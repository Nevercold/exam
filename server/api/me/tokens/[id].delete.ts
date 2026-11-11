import { and, eq, isNull } from 'drizzle-orm'

// Revoke (kept for the audit trail, never usable again)
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const t = tables.apiTokens

  const row = await useDb().update(t)
    .set({ revokedAt: new Date() })
    .where(and(eq(t.id, getRouterParam(event, 'id')!), eq(t.userId, me.id), isNull(t.revokedAt)))
    .returning({ id: t.id })
    .get()
  if (!row) throw createError({ statusCode: 404, message: 'Token nicht gefunden' })

  return { ok: true }
})
