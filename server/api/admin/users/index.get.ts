import { and, asc, eq, gt, isNull } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()

  const rows = await db
    .select({ user: tables.users, inviteExpiresAt: tables.invites.expiresAt })
    .from(tables.users)
    .leftJoin(tables.invites, and(
      eq(tables.invites.userId, tables.users.id),
      isNull(tables.invites.usedAt),
      gt(tables.invites.expiresAt, new Date()),
    ))
    .orderBy(asc(tables.users.name))

  return rows.map(({ user, inviteExpiresAt }) => ({
    ...toPublicUser(user),
    hasPassword: !!user.passwordHash,
    inviteExpiresAt,
  }))
})
