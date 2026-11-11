import { z } from 'zod'
import { isAllowedRedirectUri } from '../../oauth/core'

// RFC 7591 Dynamic Client Registration. Deprecated in the MCP spec (CIMD is preferred), but still used
// by many clients. Only public clients (PKCE, no client secret) are supported.

const registrationSchema = z.object({
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  client_name: z.string().trim().max(100).optional(),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
})

const fail = (error: string, description: string) => ({ error, error_description: description })

export default defineEventHandler(async (event) => {
  rateLimit(event, 'oauth-register', 30, 60 * 60 * 1000)
  await ensureDb()
  setResponseHeaders(event, { 'cache-control': 'no-store' })

  const parsed = registrationSchema.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) {
    setResponseStatus(event, 400)
    return fail('invalid_client_metadata', 'redirect_uris is required')
  }
  const meta = parsed.data

  if (!meta.redirect_uris.every(isAllowedRedirectUri)) {
    setResponseStatus(event, 400)
    return fail('invalid_redirect_uri', 'Redirect URIs must use https or a loopback address (localhost)')
  }
  if (meta.token_endpoint_auth_method && meta.token_endpoint_auth_method !== 'none') {
    setResponseStatus(event, 400)
    return fail('invalid_client_metadata', 'Only public clients (token_endpoint_auth_method "none") are supported')
  }
  const grantTypes = meta.grant_types ?? ['authorization_code', 'refresh_token']
  if (!grantTypes.every(g => g === 'authorization_code' || g === 'refresh_token') || (meta.response_types ?? ['code']).some(r => r !== 'code')) {
    setResponseStatus(event, 400)
    return fail('invalid_client_metadata', 'Only the authorization_code flow is supported')
  }

  const row = await useDb().insert(tables.oauthClients).values({
    id: randomToken(16),
    name: meta.client_name || 'MCP-Client',
    redirectUris: meta.redirect_uris,
  }).returning().get()

  setResponseStatus(event, 201)
  return {
    client_id: row.id,
    client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
    client_name: row.name,
    redirect_uris: row.redirectUris,
    token_endpoint_auth_method: 'none',
    grant_types: grantTypes,
    response_types: ['code'],
  }
})
