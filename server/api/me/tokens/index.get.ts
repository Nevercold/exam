import { and, desc, eq, isNull } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const t = tables.apiTokens

  const rows = await useDb()
    .select({ id: t.id, name: t.name, prefix: t.prefix, source: t.source, lastUsedAt: t.lastUsedAt, expiresAt: t.expiresAt, refreshExpiresAt: t.refreshExpiresAt, createdAt: t.createdAt })
    .from(t)
    .where(and(eq(t.userId, me.id), isNull(t.revokedAt)))
    .orderBy(desc(t.createdAt))

  // For OAuth connections the refresh token decides how long the connection lasts
  return rows.map(({ refreshExpiresAt, ...r }) => ({ ...r, expiresAt: r.source === 'oauth' ? refreshExpiresAt ?? r.expiresAt : r.expiresAt }))
})
