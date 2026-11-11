export default defineEventHandler(async (event) => {
  rateLimit(event, 'invite', 30, 15 * 60 * 1000)
  const found = await findValidInvite(getRouterParam(event, 'token') ?? '')
  if (!found) throw createError({ statusCode: 404, message: 'Einladung ungültig oder abgelaufen' })

  return { name: found.user.name, email: found.user.email }
})
