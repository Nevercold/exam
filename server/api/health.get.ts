import { sql } from 'drizzle-orm'

export default defineEventHandler(async () => {
  await useDb().run(sql`select 1`)
  return { ok: true }
})
