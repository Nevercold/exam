import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import * as schema from '../db/schema'

export const tables = schema

type Db = ReturnType<typeof createDb>

let db: Db | undefined
let ready: Promise<void> | undefined

function createDb(url: string) {
  return drizzle({ connection: { url }, schema, casing: 'snake_case' })
}

export function useDb(): Db {
  if (!db) {
    const url = useRuntimeConfig().databaseUrl
    if (url.startsWith('file:')) mkdirSync(dirname(resolve(url.slice('file:'.length))), { recursive: true })
    db = createDb(url)
  }
  return db
}

/** Runs migrations + admin seed exactly once. Awaited by the plugin and the middleware. */
export function ensureDb(): Promise<void> {
  ready ??= (async () => {
    const db = useDb()
    await db.run('PRAGMA journal_mode = WAL')
    await db.run('PRAGMA foreign_keys = ON')
    await migrate(db, { migrationsFolder: resolve(process.cwd(), 'server/db/migrations') })
    await seedAdmin(db)
  })()
  return ready
}

async function seedAdmin(db: Db) {
  const { adminEmail, adminPassword, adminName } = useRuntimeConfig()
  if (!adminEmail || !adminPassword) return

  const email = adminEmail.trim().toLowerCase()
  const existing = await db.select({ id: tables.users.id }).from(tables.users).where(eq(tables.users.email, email)).get()
  if (existing) return

  await db.insert(tables.users).values({
    name: adminName,
    email,
    passwordHash: await hashPassword(adminPassword),
    isAdmin: true,
  })
  console.info(`[db] created admin account ${email}`)
}
