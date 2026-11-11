import { and, count, eq, gt, isNull } from 'drizzle-orm'

const MAX_ACTIVE_TOKENS = 10

export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  rateLimit(event, 'api-token-create', 20, 60 * 60 * 1000)
  const { name, expiresInDays } = await readValidatedBody(event, createApiTokenSchema.parse)

  const t = tables.apiTokens
  const active = await useDb().select({ n: count() }).from(t)
    .where(and(eq(t.userId, me.id), eq(t.source, 'manual'), isNull(t.revokedAt), gt(t.expiresAt, new Date())))
    .get()
  if ((active?.n ?? 0) >= MAX_ACTIVE_TOKENS) {
    throw createError({ statusCode: 400, message: `Maximal ${MAX_ACTIVE_TOKENS} aktive Tokens. Widerrufe zuerst ein altes.` })
  }

  const { token, row } = await createApiToken(me.id, name, expiresInDays)
  setResponseStatus(event, 201)
  return { token, id: row.id, name: row.name, prefix: row.prefix, expiresAt: row.expiresAt }
})
