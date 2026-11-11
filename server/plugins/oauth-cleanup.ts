import { and, eq, lt } from 'drizzle-orm'

// Hourly cleanup: expired authorization codes and OAuth connections whose refresh token expired.
export default defineNitroPlugin(() => {
  setInterval(async () => {
    try {
      await ensureDb()
      const db = useDb()
      const now = new Date()
      await db.delete(tables.oauthCodes).where(lt(tables.oauthCodes.expiresAt, now))
      await db.delete(tables.apiTokens).where(and(eq(tables.apiTokens.source, 'oauth'), lt(tables.apiTokens.refreshExpiresAt, now)))
    }
    catch (err) {
      console.error('[oauth] cleanup failed', err)
    }
  }, 60 * 60 * 1000).unref?.()
})
