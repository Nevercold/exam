import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  rateLimit(event, 'password', 10, 15 * 60 * 1000)
  const me = await requireTeacher(event)
  const { currentPassword, newPassword } = await readValidatedBody(event, changePasswordSchema.parse)

  const db = useDb()
  const user = await db.select().from(tables.users).where(eq(tables.users.id, me.id)).get()
  if (!user?.passwordHash || !await verifyPassword(user.passwordHash, currentPassword)) {
    throw createError({ statusCode: 400, message: 'Aktuelles Passwort ist falsch' })
  }

  await db.update(tables.users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(tables.users.id, me.id))
  return { ok: true }
})
