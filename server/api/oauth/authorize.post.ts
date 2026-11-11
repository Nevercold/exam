import { z } from 'zod'
import { buildRedirect } from '../../oauth/core'

// Consent decision. Returns the URL to send the browser to (code or access_denied).
// Cross-site POSTs carry no session cookie (SameSite=Lax), so a foreign page can't approve for the user.
const bodySchema = z.object({ approve: z.boolean(), params: z.record(z.string(), z.string()) })

export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  rateLimit(event, 'oauth-authorize', 60, 10 * 60 * 1000)
  const { approve, params } = await readValidatedBody(event, bodySchema.parse)

  const check = await checkAuthorizeRequest(event, params)
  if (!check.ok) return { redirect: check.redirect }

  const { client, params: p, scope } = check
  const iss = oauthIssuer(event)
  if (!approve) {
    return { redirect: buildRedirect(p.redirect_uri, { error: 'access_denied', error_description: 'The user denied access', state: p.state, iss }) }
  }

  const code = await createAuthCode({ client, userId: me.id, redirectUri: p.redirect_uri, codeChallenge: p.code_challenge!, scope })
  return { redirect: buildRedirect(p.redirect_uri, { code, state: p.state, iss }) }
})
