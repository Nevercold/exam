import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  ACCESS_TOKEN_TTL_SEC, AUTH_CODE_TTL_SEC, buildRedirect, grantScope, isCimdClientId, isOwnResource, MCP_SCOPE,
  parseCimdDocument, redirectUriMatches, REFRESH_TOKEN_TTL_SEC, verifyPkceS256,
} from '../oauth/core'
import type { ClientInfo } from '../oauth/core'

// OAuth 2.1 authorization server for the MCP endpoint (see server/oauth/core.ts for the pure rules).

/** Issuer = this server's origin, as seen by the client (behind a proxy via X-Forwarded-*). */
export function oauthIssuer(event: H3Event): string {
  return getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
}

export function mcpResource(event: H3Event): string {
  return `${oauthIssuer(event)}/mcp`
}

export function protectedResourceMetadataUrl(event: H3Event): string {
  return `${oauthIssuer(event)}/.well-known/oauth-protected-resource/mcp`
}

/** RFC 9728 Protected Resource Metadata for /mcp */
export function protectedResourceMetadata(event: H3Event) {
  return {
    resource: mcpResource(event),
    authorization_servers: [oauthIssuer(event)],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'exam',
  }
}

/** RFC 8414 Authorization Server Metadata */
export function authorizationServerMetadata(event: H3Event) {
  const issuer = oauthIssuer(event)
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [MCP_SCOPE],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  }
}

// --- clients ---

// Simplification: fixed in-memory TTL instead of honouring HTTP cache headers
const cimdCache = new Map<string, { client: ClientInfo, until: number }>()
const CIMD_TTL_MS = 10 * 60 * 1000

async function fetchCimdClient(url: string): Promise<ClientInfo | null> {
  const cached = cimdCache.get(url)
  if (cached && cached.until > Date.now()) return cached.client
  try {
    // SSRF-safe: public addresses only, small size, no redirects
    const body = await safeFetchBuffer(url, { maxBytes: 64 * 1024, timeoutMs: 5000, maxRedirects: 0, accept: 'application/json' })
    const client = parseCimdDocument(url, JSON.parse(body.toString('utf8')))
    if (client) cimdCache.set(url, { client, until: Date.now() + CIMD_TTL_MS })
    return client
  }
  catch {
    return null
  }
}

/** Client by id: Client ID Metadata Document (URL) or Dynamic Client Registration (DB). */
export async function resolveClient(clientId: string): Promise<ClientInfo | null> {
  if (isCimdClientId(clientId)) return await fetchCimdClient(clientId)
  const row = await useDb().select().from(tables.oauthClients).where(eq(tables.oauthClients.id, clientId)).get()
  return row ? { id: row.id, name: row.name, redirectUris: row.redirectUris } : null
}

// --- authorization request ---

export const authorizeParamsSchema = z.object({
  response_type: z.string().max(50).optional(),
  client_id: z.string().max(500),
  redirect_uri: z.string().max(2000),
  code_challenge: z.string().max(200).optional(),
  code_challenge_method: z.string().max(20).optional(),
  scope: z.string().max(500).optional(),
  state: z.string().max(1000).optional(),
  resource: z.string().max(2000).optional(),
})
export type AuthorizeParams = z.infer<typeof authorizeParamsSchema>

export type AuthorizeCheck
  = | { ok: true, client: ClientInfo, params: AuthorizeParams, scope: string }
    | { ok: false, redirect: string }

/**
 * Validates an authorization request. Unknown clients or redirect URIs are shown as an error page
 * (never redirected, to avoid open redirects); all other errors go back to the client.
 */
export async function checkAuthorizeRequest(event: H3Event, raw: unknown): Promise<AuthorizeCheck> {
  const parsed = authorizeParamsSchema.safeParse(raw)
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Ungültige Anfrage: client_id und redirect_uri fehlen.' })
  const params = parsed.data

  const client = await resolveClient(params.client_id)
  if (!client) throw createError({ statusCode: 400, message: 'Unbekannte Anwendung (client_id).' })
  // Exact match against the registered redirect URIs
  if (!redirectUriMatches(client.redirectUris, params.redirect_uri)) {
    throw createError({ statusCode: 400, message: 'Die Rücksprungadresse (redirect_uri) ist für diese Anwendung nicht registriert.' })
  }

  const fail = (error: string, description: string): AuthorizeCheck => ({
    ok: false,
    redirect: buildRedirect(params.redirect_uri, { error, error_description: description, state: params.state, iss: oauthIssuer(event) }),
  })

  if (params.response_type !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported')
  if (!params.code_challenge || params.code_challenge_method !== 'S256') return fail('invalid_request', 'PKCE with S256 is required')
  const scope = grantScope(params.scope)
  if (!scope) return fail('invalid_scope', 'Only the scope "mcp" is supported')
  if (params.resource && !isOwnResource(params.resource, oauthIssuer(event))) return fail('invalid_target', 'Unknown resource')

  return { ok: true, client, params, scope }
}

// --- codes & tokens ---

export async function createAuthCode(opts: { client: ClientInfo, userId: string, redirectUri: string, codeChallenge: string, scope: string }) {
  const code = randomToken()
  await useDb().insert(tables.oauthCodes).values({
    codeHash: hashToken(code),
    clientId: opts.client.id,
    clientName: opts.client.name,
    userId: opts.userId,
    redirectUri: opts.redirectUri,
    codeChallenge: opts.codeChallenge,
    scope: opts.scope,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SEC * 1000),
  })
  return code
}

/** OAuth error response for the token endpoint (RFC 6749 §5.2). */
export class OAuthError extends Error {
  constructor(public code: string, public description: string, public status = 400) {
    super(description)
  }
}

interface TokenResponse { access_token: string, token_type: 'Bearer', expires_in: number, refresh_token: string, scope: string }

function newTokens() {
  const accessToken = `${API_TOKEN_PREFIX}${randomToken()}`
  const refreshToken = `qzr_${randomToken()}`
  return {
    accessToken,
    refreshToken,
    columns: {
      prefix: accessToken.slice(0, API_TOKEN_PREFIX.length + 6),
      tokenHash: hashToken(accessToken),
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SEC * 1000),
      refreshTokenHash: hashToken(refreshToken),
      refreshExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000),
    },
  }
}

function response(accessToken: string, refreshToken: string, scope: string): TokenResponse {
  return { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_SEC, refresh_token: refreshToken, scope }
}

/** authorization_code grant: single-use code, PKCE-verified, bound to client and redirect URI. */
export async function exchangeAuthCode(input: { code: string, clientId: string, redirectUri: string, codeVerifier: string }): Promise<TokenResponse> {
  const db = useDb()
  const codeHash = hashToken(input.code)
  // Delete first: a code can be redeemed exactly once, even under concurrent requests
  const row = await db.delete(tables.oauthCodes).where(eq(tables.oauthCodes.codeHash, codeHash)).returning().get()

  if (!row || row.expiresAt < new Date()) throw new OAuthError('invalid_grant', 'Authorization code is invalid or expired')
  if (row.clientId !== input.clientId) throw new OAuthError('invalid_grant', 'Authorization code was issued to another client')
  if (row.redirectUri !== input.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri does not match')
  if (!verifyPkceS256(input.codeVerifier, row.codeChallenge)) throw new OAuthError('invalid_grant', 'PKCE verification failed')

  const user = await db.select().from(tables.users).where(eq(tables.users.id, row.userId)).get()
  if (!user?.active) throw new OAuthError('invalid_grant', 'User is not active')

  const tokens = newTokens()
  await db.insert(tables.apiTokens).values({
    userId: row.userId,
    name: `${row.clientName} (OAuth)`,
    source: 'oauth',
    oauthClientId: row.clientId,
    ...tokens.columns,
  })
  return response(tokens.accessToken, tokens.refreshToken, row.scope)
}

/** refresh_token grant with rotation: the old refresh token is invalid afterwards. */
export async function refreshTokens(input: { refreshToken: string, clientId: string }): Promise<TokenResponse> {
  const db = useDb()
  const t = tables.apiTokens
  const row = await db.select().from(t).where(eq(t.refreshTokenHash, hashToken(input.refreshToken))).get()

  if (!row || row.revokedAt || !row.refreshExpiresAt || row.refreshExpiresAt < new Date()) {
    throw new OAuthError('invalid_grant', 'Refresh token is invalid or expired')
  }
  if (row.oauthClientId !== input.clientId) throw new OAuthError('invalid_grant', 'Refresh token was issued to another client')

  const user = await db.select().from(tables.users).where(eq(tables.users.id, row.userId)).get()
  if (!user?.active) throw new OAuthError('invalid_grant', 'User is not active')

  const tokens = newTokens()
  await db.update(t).set(tokens.columns).where(eq(t.id, row.id))
  return response(tokens.accessToken, tokens.refreshToken, MCP_SCOPE)
}
