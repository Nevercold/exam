import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { ExamContent } from '../../shared/utils/exam'

const id = () => text().primaryKey().$defaultFn(() => crypto.randomUUID())
const createdAt = () => integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date())

export const users = sqliteTable('user', {
  id: id(),
  name: text().notNull(),
  email: text().notNull().unique(),
  // null until the invite link has been redeemed
  passwordHash: text(),
  isAdmin: integer({ mode: 'boolean' }).notNull().default(false),
  active: integer({ mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
})

export const invites = sqliteTable('invite', {
  // SHA-256 of the token; the plain token only exists in the link
  tokenHash: text().primaryKey(),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer({ mode: 'timestamp' }).notNull(),
  usedAt: integer({ mode: 'timestamp' }),
  createdAt: createdAt(),
})

/**
 * API tokens for the MCP server. Only SHA-256 hashes are stored.
 * `manual`: created in the settings. `oauth`: issued by the OAuth flow; then `expiresAt` is the
 * short access-token lifetime and the refresh token (rotated on use) keeps the connection alive.
 */
export const apiTokens = sqliteTable('api_token', {
  id: id(),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  // First characters of the token, shown in the UI to tell tokens apart
  prefix: text().notNull(),
  tokenHash: text().notNull().unique(),
  lastUsedAt: integer({ mode: 'timestamp' }),
  expiresAt: integer({ mode: 'timestamp' }).notNull(),
  revokedAt: integer({ mode: 'timestamp' }),
  createdAt: createdAt(),
  source: text({ enum: ['manual', 'oauth'] }).notNull().default('manual'),
  oauthClientId: text(),
  refreshTokenHash: text().unique(),
  refreshExpiresAt: integer({ mode: 'timestamp' }),
}, t => [index('api_token_user_idx').on(t.userId)])

/** OAuth clients registered via Dynamic Client Registration (CIMD clients are not stored). */
export const oauthClients = sqliteTable('oauth_client', {
  id: text().primaryKey(),
  name: text().notNull(),
  redirectUris: text({ mode: 'json' }).$type<string[]>().notNull(),
  createdAt: createdAt(),
})

/** Short-lived, single-use authorization codes (PKCE-bound). */
export const oauthCodes = sqliteTable('oauth_code', {
  codeHash: text().primaryKey(),
  clientId: text().notNull(),
  clientName: text().notNull(),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text().notNull(),
  codeChallenge: text().notNull(),
  scope: text().notNull(),
  expiresAt: integer({ mode: 'timestamp' }).notNull(),
})

/**
 * An exam. Editing (UI or MCP) always changes `draft`; "Freigeben" copies it to `released`.
 * Both contain the solutions, so neither may ever be sent to a student.
 */
export const exams = sqliteTable('exam', {
  id: id(),
  ownerId: text().notNull().references(() => users.id),
  draft: text({ mode: 'json' }).$type<ExamContent>().notNull(),
  draftUpdatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  draftUpdatedVia: text({ enum: ['editor', 'mcp'] }).notNull().default('editor'),
  released: text({ mode: 'json' }).$type<ExamContent>(),
  releasedAt: integer({ mode: 'timestamp' }),
  sharedWithColleagues: integer({ mode: 'boolean' }).notNull().default(false),
  archivedAt: integer({ mode: 'timestamp' }),
  createdAt: createdAt(),
}, t => [index('exam_owner_idx').on(t.ownerId)])

/**
 * One sitting of an exam. `snapshot` freezes the released content (incl. solutions) at start,
 * so later edits never change a running or past run. Active while `endedAt` is null and
 * `endsAt` (timer) is null or in the future.
 */
export const runs = sqliteTable('run', {
  id: id(),
  examId: text().notNull().references(() => exams.id),
  startedBy: text().notNull().references(() => users.id),
  pin: text().notNull(),
  snapshot: text({ mode: 'json' }).$type<ExamContent>().notNull(),
  startedAt: createdAt(),
  endsAt: integer({ mode: 'timestamp' }),
  endedAt: integer({ mode: 'timestamp' }),
}, t => [index('run_pin_idx').on(t.pin), index('run_exam_idx').on(t.examId)])

export type User = typeof users.$inferSelect
export type ExamRow = typeof exams.$inferSelect
export type RunRow = typeof runs.$inferSelect
