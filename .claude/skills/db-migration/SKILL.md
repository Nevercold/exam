---
name: db-migration
description: Change the exam database schema (new table, column, index) and generate the Drizzle migration correctly. Use whenever server/db/schema.ts is touched.
---

# Database migration (Drizzle + SQLite)

## Steps

1. **Edit the schema** in `server/db/schema.ts`.
   - Use the helpers `id()` (UUID text PK) and `createdAt()`.
   - camelCase keys in TS, snake_case in the DB (`casing: 'snake_case'`, no explicit column names needed).
   - Booleans: `integer({ mode: 'boolean' })`, timestamps: `integer({ mode: 'timestamp' })`,
     JSON: `text({ mode: 'json' }).$type<T>()`.
   - Foreign keys with `references(() => x.id, { onDelete: 'cascade' })` where appropriate.
   - Export the row type: `export type Foo = typeof foos.$inferSelect`.
2. **Generate:** `pnpm db:generate --name <snake_case_description>`
3. **Review the SQL** in `server/db/migrations/NNNN_<name>.sql`:
   - `NOT NULL` without a default on an existing table fails for existing rows. Add a default.
   - SQLite can't do many `ALTER`s, so Drizzle rebuilds the table (`__new_…`). Watch for data loss.
4. **Test:** start `pnpm dev`; the migration runs automatically on startup (`server/utils/db.ts → ensureDb`).
5. **Commit** schema + SQL + `meta/` files together.

## Rules

- Never edit or delete committed migrations. Create a new one instead.
- CI fails if the schema changed without a matching migration.
- Live game state (players, answers during a round) does **not** go into the DB; it lives in memory (see PLAN.md).
- New tables holding teacher data: always access through `requireTeacher` plus an ownership check (`authorId`).
