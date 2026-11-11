import type { H3Event } from 'h3'
import { and, eq, gt, isNull } from 'drizzle-orm'

export const API_TOKEN_PREFIX = 'ex_'
const LAST_USED_RESOLUTION_MS = 60_000

export async function createApiToken(userId: string, name: string, expiresInDays: number) {
  const token = `${API_TOKEN_PREFIX}${randomToken()}`
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)

  const row = await useDb().insert(tables.apiTokens).values({
    userId,
    name,
    prefix: token.slice(0, API_TOKEN_PREFIX.length + 6),
    tokenHash: hashToken(token),
    expiresAt,
  }).returning().get()

  // The plain token is returned exactly once
  return { token, row }
}

/**
 * Resolves `Authorization: Bearer ex_…` to an active teacher.
 * Throws 401 for missing, unknown, expired or revoked tokens and deactivated users.
 */
export async function requireApiTokenUser(event: H3Event) {
  const header = getRequestHeader(event, 'authorization') ?? ''
  const token = header.match(/^Bearer\s+(\S+)$/i)?.[1]

  const unauthorized = () => {
    // RFC 9728 §5.1: tells MCP clients where to find the OAuth metadata
    setResponseHeader(event, 'www-authenticate', `Bearer resource_metadata="${protectedResourceMetadataUrl(event)}", scope="mcp"`)
    return createError({ statusCode: 401, message: 'Gültiges API-Token erforderlich (Einstellungen → API-Tokens).' })
  }
  if (!token?.startsWith(API_TOKEN_PREFIX)) throw unauthorized()

  const db = useDb()
  const now = new Date()
  const found = await db
    .select({ token: tables.apiTokens, user: tables.users })
    .from(tables.apiTokens)
    .innerJoin(tables.users, eq(tables.users.id, tables.apiTokens.userId))
    .where(and(
      eq(tables.apiTokens.tokenHash, hashToken(token)),
      isNull(tables.apiTokens.revokedAt),
      gt(tables.apiTokens.expiresAt, now),
      eq(tables.users.active, true),
    ))
    .get()
  if (!found?.user.passwordHash) throw unauthorized()

  // Avoid a write on every request
  if (!found.token.lastUsedAt || now.getTime() - found.token.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
    await db.update(tables.apiTokens).set({ lastUsedAt: now }).where(eq(tables.apiTokens.id, found.token.id))
  }

  return { user: toPublicUser(found.user), tokenId: found.token.id }
}
