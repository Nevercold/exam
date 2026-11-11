import { eq } from 'drizzle-orm'

// Runs whenever the client loads the session (every page load, server-side too).
// Deactivated or deleted accounts are logged out right away, and name/admin flag are
// taken fresh from the DB so the UI reflects changes by an admin without re-login.
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session) => {
    await ensureDb()
    const user = await useDb().select().from(tables.users).where(eq(tables.users.id, session.user?.id ?? '')).get()

    if (!user?.active || !user.passwordHash) {
      throw createError({ statusCode: 401, message: 'Sitzung abgelaufen' })
    }
    session.user = toSessionUser(user)
  })
})
