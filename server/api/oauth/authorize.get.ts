import { isCimdClientId, isLoopbackRedirect } from '../../oauth/core'

// Validates an authorization request for the consent page (teacher must be logged in).
export default defineEventHandler(async (event) => {
  await requireTeacher(event)
  const check = await checkAuthorizeRequest(event, getQuery(event))
  if (!check.ok) return { redirect: check.redirect }

  const redirect = new URL(check.params.redirect_uri)
  return {
    client: {
      name: check.client.name,
      // For CIMD clients the domain of the client_id URL identifies the publisher
      domain: isCimdClientId(check.client.id) ? new URL(check.client.id).hostname : null,
    },
    redirectHost: redirect.host,
    loopback: isLoopbackRedirect(check.params.redirect_uri),
  }
})
