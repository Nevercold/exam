import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'turso',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  casing: 'snake_case',
  dbCredentials: { url: process.env.NUXT_DATABASE_URL ?? 'file:./data/quiz.db' },
})
