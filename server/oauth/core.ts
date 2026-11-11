import { createHash } from 'node:crypto'

// Pure OAuth 2.1 helpers for the MCP authorization flow (unit-tested, no Nitro globals).
// Spec: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization

export const MCP_SCOPE = 'mcp'
/** Scopes a client may ask for. `offline_access` is tolerated (refresh tokens are issued anyway). */
const ACCEPTED_SCOPES = new Set([MCP_SCOPE, 'offline_access'])

export const ACCESS_TOKEN_TTL_SEC = 60 * 60
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60
export const AUTH_CODE_TTL_SEC = 5 * 60

/** PKCE with S256 only (OAuth 2.1); `plain` is not supported. */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  // RFC 7636 §4.1: 43–128 characters from the unreserved set
  if (!/^[\w.~-]{43,128}$/.test(verifier)) return false
  const computed = createHash('sha256').update(verifier).digest('base64url')
  return computed === challenge
}

/** Redirect URIs must be https, or http on a loopback host (native apps). No fragments. */
export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL
  try {
    url = new URL(uri)
  }
  catch {
    return false
  }
  if (url.hash) return false
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

export function isLoopbackRedirect(uri: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(uri).hostname)
  }
  catch {
    return false
  }
}

/**
 * Exact match of the redirect URI, except that loopback redirects may use any port
 * (OAuth 2.1 / RFC 8252 §7.3: native apps pick a free port at runtime).
 */
export function redirectUriMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true
  if (!isLoopbackRedirect(requested)) return false
  const req = new URL(requested)
  return registered.some((r) => {
    if (!isLoopbackRedirect(r)) return false
    const reg = new URL(r)
    return reg.protocol === req.protocol && reg.hostname === req.hostname && reg.pathname === req.pathname && reg.search === req.search
  })
}

/** Client ID Metadata Documents: the client_id is an https URL with a path. */
export function isCimdClientId(clientId: string): boolean {
  try {
    const url = new URL(clientId)
    return url.protocol === 'https:' && url.pathname.length > 1 && !url.hash
  }
  catch {
    return false
  }
}

export interface ClientInfo { id: string, name: string, redirectUris: string[] }

/** Validates a fetched CIMD document (client_id must equal the URL exactly). */
export function parseCimdDocument(url: string, doc: unknown): ClientInfo | null {
  if (!doc || typeof doc !== 'object') return null
  const d = doc as Record<string, unknown>
  if (d.client_id !== url) return null
  if (typeof d.client_name !== 'string' || !d.client_name.trim()) return null
  if (!Array.isArray(d.redirect_uris) || !d.redirect_uris.length) return null
  if (!d.redirect_uris.every(u => typeof u === 'string' && isAllowedRedirectUri(u))) return null
  return { id: url, name: d.client_name.trim().slice(0, 100), redirectUris: d.redirect_uris as string[] }
}

/** Returns the granted scope, or null if an unsupported scope was requested. */
export function grantScope(requested: string | undefined): string | null {
  const scopes = (requested ?? '').split(' ').filter(Boolean)
  if (scopes.some(s => !ACCEPTED_SCOPES.has(s))) return null
  return MCP_SCOPE
}

/**
 * RFC 8707 resource indicator: must identify this MCP server. Accepts the canonical
 * `<origin>/mcp` and the bare origin, case-insensitive in scheme/host, with or without trailing slash.
 */
export function isOwnResource(resource: string, origin: string): boolean {
  try {
    const url = new URL(resource)
    if (url.hash || url.search) return false
    const path = url.pathname.replace(/\/$/, '')
    return url.origin === new URL(origin).origin && (path === '' || path === '/mcp')
  }
  catch {
    return false
  }
}

/** Appends OAuth response parameters to a redirect URI (keeps existing query parameters). */
export function buildRedirect(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value)
  return url.toString()
}
