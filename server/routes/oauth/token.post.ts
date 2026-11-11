import { z } from 'zod'
import { isOwnResource } from '../../oauth/core'

// OAuth 2.1 token endpoint (public clients): authorization_code with PKCE and refresh_token with rotation.
const bodySchema = z.object({
  grant_type: z.string(),
  client_id: z.string().max(500),
  code: z.string().max(200).optional(),
  redirect_uri: z.string().max(2000).optional(),
  code_verifier: z.string().max(200).optional(),
  refresh_token: z.string().max(200).optional(),
  resource: z.string().max(2000).optional(),
})

export default defineEventHandler(async (event) => {
  rateLimit(event, 'oauth-token', 120, 10 * 60 * 1000)
  await ensureDb()
  setResponseHeaders(event, { 'cache-control': 'no-store', 'pragma': 'no-cache' })

  // Form-encoded per spec; JSON is accepted too
  const parsed = bodySchema.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) {
    setResponseStatus(event, 400)
    return { error: 'invalid_request', error_description: 'grant_type and client_id are required' }
  }
  const body = parsed.data

  try {
    if (body.resource && !isOwnResource(body.resource, oauthIssuer(event))) {
      throw new OAuthError('invalid_target', 'Unknown resource')
    }
    if (body.grant_type === 'authorization_code') {
      if (!body.code || !body.redirect_uri || !body.code_verifier) {
        throw new OAuthError('invalid_request', 'code, redirect_uri and code_verifier are required')
      }
      return await exchangeAuthCode({ code: body.code, clientId: body.client_id, redirectUri: body.redirect_uri, codeVerifier: body.code_verifier })
    }
    if (body.grant_type === 'refresh_token') {
      if (!body.refresh_token) throw new OAuthError('invalid_request', 'refresh_token is required')
      return await refreshTokens({ refreshToken: body.refresh_token, clientId: body.client_id })
    }
    throw new OAuthError('unsupported_grant_type', 'Supported: authorization_code, refresh_token')
  }
  catch (err) {
    if (!(err instanceof OAuthError)) throw err
    setResponseStatus(event, err.status)
    return { error: err.code, error_description: err.description }
  }
})
