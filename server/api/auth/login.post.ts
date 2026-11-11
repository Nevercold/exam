import { eq } from 'drizzle-orm'

let dummyHash: Promise<string> | undefined

export default defineEventHandler(async (event) => {
  // Per IP *and* email: teachers of one school share a public IP, so a pure IP limit would lock out
  // colleagues. The coarse IP limit still caps password spraying across many accounts.
  rateLimit(event, 'login-ip', 100, 15 * 60 * 1000)
  const { email, password } = await readValidatedBody(event, loginSchema.parse)
  rateLimit(event, `login:${email}`, 10, 15 * 60 * 1000)

  const user = await useDb().select().from(tables.users).where(eq(tables.users.email, email)).get()

  // Hash even without a user so response timing doesn't reveal which emails exist
  dummyHash ??= hashPassword('dummy-password-for-timing')
  const valid = await verifyPassword(user?.passwordHash ?? await dummyHash, password)

  if (!user?.passwordHash || !valid || !user.active) {
    throw createError({ statusCode: 401, message: 'E-Mail oder Passwort falsch' })
  }

  await setUserSession(event, { user: toSessionUser(user), loggedInAt: Date.now() })
  return toSessionUser(user)
})
