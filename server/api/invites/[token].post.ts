import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  rateLimit(event, 'invite', 30, 15 * 60 * 1000)
  const { password } = await readValidatedBody(event, setPasswordSchema.parse)

  const found = await findValidInvite(getRouterParam(event, 'token') ?? '')
  if (!found) throw createError({ statusCode: 404, message: 'Einladung ungültig oder abgelaufen' })

  const db = useDb()
  const passwordHash = await hashPassword(password)
  const [user] = await db.batch([
    db.update(tables.users).set({ passwordHash }).where(eq(tables.users.id, found.user.id)).returning(),
    db.update(tables.invites).set({ usedAt: new Date() }).where(eq(tables.invites.tokenHash, found.invite.tokenHash)),
  ])

  await setUserSession(event, { user: toSessionUser(user[0]!), loggedInAt: Date.now() })
  return { ok: true }
})
