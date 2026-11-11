import { and, eq, gt, isNull } from 'drizzle-orm'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Creates a new invite link and invalidates all older ones for this user. */
export async function createInvite(userId: string) {
  const db = useDb()
  const token = randomToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)

  await db.delete(tables.invites).where(eq(tables.invites.userId, userId))
  await db.insert(tables.invites).values({ tokenHash: hashToken(token), userId, expiresAt })

  return { path: `/invite/${token}`, expiresAt }
}

/** Returns a valid (unexpired, unused) invite with its user, or null. */
export async function findValidInvite(token: string) {
  return await useDb()
    .select({ invite: tables.invites, user: tables.users })
    .from(tables.invites)
    .innerJoin(tables.users, eq(tables.users.id, tables.invites.userId))
    .where(and(
      eq(tables.invites.tokenHash, hashToken(token)),
      isNull(tables.invites.usedAt),
      gt(tables.invites.expiresAt, new Date()),
      eq(tables.users.active, true),
    ))
    .get() ?? null
}
