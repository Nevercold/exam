import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  const id = getRouterParam(event, 'id')!
  const changes = await readValidatedBody(event, updateUserSchema.parse)

  // Schutz vor Selbst-Aussperrung
  if (id === me.id && (changes.active === false || changes.isAdmin === false)) {
    throw createError({ statusCode: 400, message: 'Du kannst dich nicht selbst deaktivieren oder dir die Admin-Rechte entziehen' })
  }

  const user = await useDb().update(tables.users).set(changes).where(eq(tables.users.id, id)).returning().get()
  if (!user) throw createError({ statusCode: 404, message: 'Benutzer nicht gefunden' })

  return toPublicUser(user)
})
