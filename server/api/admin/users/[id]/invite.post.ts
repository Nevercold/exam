import { eq } from 'drizzle-orm'

// New invite link, e.g. to reset a forgotten password.
// The old password stays valid until the link is redeemed.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!

  const user = await useDb().select({ id: tables.users.id }).from(tables.users).where(eq(tables.users.id, id)).get()
  if (!user) throw createError({ statusCode: 404, message: 'Benutzer nicht gefunden' })

  return await createInvite(user.id)
})
