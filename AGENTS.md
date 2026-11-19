# AGENTS.md

Guide for AI agents (Claude Code, Codex, Cursor, …) and humans working on **exam**: teachers build exams from
blocks, students answer in the browser and export a signed PDF that they upload to the school cloud themselves.
Overall plan and phases: [`PLAN.md`](./PLAN.md). Infrastructure (auth, OAuth, MCP, rate limits, Docker) is
derived from the sibling project Quizzle.

## Workflow

- Work phase by phase from `PLAN.md`. After each phase: `lint`, `typecheck`, `test` green → commit → push.
- Don't invent product decisions (rules, texts, defaults). Ask, collecting questions in one batch.
- Every pitfall that cost time goes into **Gotchas** below.

## Commands

```bash
pnpm install          # dependencies (pnpm 12, Node ≥ 24)
pnpm dev              # dev server on :3000 (needs .env, see .env.example)
pnpm lint             # ESLint incl. stylistic rules; pnpm lint:fix to auto-fix
pnpm typecheck        # vue-tsc across all Nuxt tsconfigs
pnpm test             # Vitest unit tests in test/
pnpm build            # production build to .output/
pnpm db:generate --name <name>   # generate a migration from server/db/schema.ts
pnpm keygen           # new Ed25519 signing key for NUXT_SIGNING_PRIVATE_KEY
```

**`pnpm lint`, `pnpm typecheck` and `pnpm test` must pass before every commit.** CI checks the same, plus that
migrations match the schema, plus a production build.

## Stack

- **Nuxt 4** (`app/` = client, `server/` = Nitro, `shared/` = both), **Nuxt UI v4** (Tailwind v4)
- **SQLite via libSQL + Drizzle ORM** (`casing: 'snake_case'`); migrations run automatically on server start
- **nuxt-auth-utils** for teacher sessions (sealed cookie, `NUXT_APP_SECRET`)
- **Zod 4** for all validation; schemas in `shared/utils/` (auto-imported on client and server)
- **MCP server** at `/mcp` (`@modelcontextprotocol/sdk`, stateless Streamable HTTP), auth via **OAuth 2.1**
  (own authorization server) or personal API tokens
- **Ed25519** signatures (`node:crypto`) for submissions; **pdfmake** + **pdf-lib** build the PDF in the browser

## Structure

```
app/
  pages/            index (student join), p/[pin] (student exam), login, invite/[token], settings, admin/users,
                    exams/ (list + [id] editor), runs/[id] (projector), verify, oauth/authorize
  components/       AppLogo, ApiTokens, blocks/* (editor, input and view per block type)
  composables/      useCountdown
  layouts/          default (lean: students/login), dashboard (teachers), projector (full screen)
  middleware/       auth, admin (UI convenience only!)
  plugins/          zod-locale, session-expired.client (401 → login)
  utils/            client helpers (errors, pdf)
server/
  api/              REST endpoints, file routing: name.<method>.ts
  db/schema.ts      Drizzle schema (single source of truth for tables)
  db/migrations/    generated SQL migrations (never edit once committed)
  routes/mcp.ts     MCP endpoint; routes/oauth/ + routes/.well-known/ OAuth
  oauth/core.ts     pure OAuth rules (PKCE, redirect URIs, CIMD, scope, resource), unit-tested
  mcp/              MCP server (tools + exam://schema resource)
  utils/            db, auth (requireTeacher/requireAdmin), exams (access, runs), signing, rate-limit,
                    invites, api-tokens, oauth, crypto, safe-fetch
  plugins/          db (migrations), zod-locale, session-check, oauth-cleanup
shared/utils/       exam.ts (block model, student view, templates, warnings), hints.ts (formal hints),
                    relations.ts (relationships from FKs, diagram layout/SVG, comparison with the solution),
                    grading.ts (AI grading prompt + reply validation),
                    submission.ts (canonical JSON, hash, signature types), schemas.ts (auth/users)
scripts/            backup.mjs (online SQLite backup), keygen.mjs, load-test.mjs
docs/               deployment.md
test/               Vitest unit tests (pure logic, no Nuxt context)
```

## Conventions

- **Language:** code, comments, docs, commits in **English**. **UI strings and user-facing error messages are
  German** with proper umlauts (ä, ö, ü, ß).
- **Auth in every teacher endpoint:** first line `await requireTeacher(event)` or `requireAdmin(event)`. This also
  checks the DB state (deactivated accounts). Client middleware is convenience, not security.
- **Exam access:** `requireExamAccess(id, user.id)` (owner or shared) / `requireExamOwner` for archive and sharing.
- **Validation:** `readValidatedBody(event, schema.parse)` with schemas from `shared/utils/`. Same schema in the form.
- **Errors:** `throw createError({ statusCode, message: '<German text>' })`, **not** `statusMessage`.
  On the client: `errorMessage(err)` from `app/utils/errors.ts`.
- **Rate limits** for everything public or brute-forceable: `rateLimit(event, scope, limit, ms)`. A whole school
  shares one IP: limit failures (wrong PINs: `countPinMiss`), not normal use.
- **AI grading** (`/api/grade`, `server/utils/ai.ts`, `shared/utils/grading.ts`): only when the teacher asks for a
  suggestion, answers (never the name) pass through the server to the configured OpenAI-compatible API. Never
  store or log them, not even in error messages (provider error bodies may echo the request).
- **Student data:** the server never receives student names, nor answers outside AI grading. `/api/sign` takes a hash only; the
  verification page extracts and hashes the PDF content in the browser.
- **Solutions:** content reaches students only through `toStudentContent()` (allow-list schema, tested).
- **Run lifecycle:** `runStatus()` (waiting → running → ended) and `canSign()` (running + 10 min grace) in
  `server/utils/exams.ts` are the single source of truth; no content is sent while a run is waiting.
- **DB access:** `useDb()` + `tables.<name>`. Never send password/token hashes to the client (`toPublicUser`).
- **Performance (school Wi-Fi!):** student pages use the lean `default` layout. pdfmake/pdf-lib are loaded lazily
  on export only. No external CDNs, fonts or icon APIs. Icons only from `@iconify-json/lucide`.
- **Responsive:** every page must work at 360 px. Projector views: large and high-contrast, keyboard-operable.
- **Design:** Nuxt UI components first, primary `emerald`, font Inter (self-hosted by @nuxt/fonts).
- **Comments:** only where the *why* isn't obvious. Mark deliberate simplifications:
  `// Simplification: <limit>, upgrade when <condition>`.
- **Public repo:** no secrets, no real domain (`example.org`), no personal details. Commits with the GitHub
  noreply address.

## Database changes

1. Edit `server/db/schema.ts`
2. `pnpm db:generate --name <short_name>`, then review the SQL (data loss? defaults for existing rows?)
3. Commit the migration. Never modify committed migrations; create a new one instead.

## Gotchas

- `vue-tsc` doesn't support TypeScript 7 yet; TypeScript is pinned to 6.x.
- `$fetch` with dynamic paths to typed Nitro routes can hit "Excessive stack depth" in typecheck. Pass an explicit
  generic: `$fetch<T>(...)`.
- libsql's native binary is included in the Nitro bundle explicitly via `nitro.externals.traceInclude`
  (see `nuxt.config.ts`). Building inside Docker picks the Linux binary.
- Pages need a single root element (put modals inside `UDashboardPanel`).
- Inputs on pages with global shortcuts (projector) must stop Enter/Esc (`@keydown.enter.stop`).
- Flex items inside scroll containers get squeezed: add `shrink-0` to blocks that must keep their size.
- Nitro tree-shakes top-level side effects in our own modules. Global setup (e.g. `z.config(...)`) must run from
  a plugin (`server/plugins/zod-locale.ts` + `app/plugins/zod-locale.ts` + `test/setup.ts`).
- Nuxt UI inputs accept `undefined`, not `null`. For nullable fields bind `:model-value="x ?? undefined"`.
- Nuxt UI centers modals with `translate(-50%, -50%)`; odd heights land on half pixels and text gets blurry in
  Chrome. `app.config.ts` overrides this with `inset-0 m-auto h-fit` (no transform). Keep it when upgrading.
- `USelect` items must not use `''` as value (Reka throws); use a sentinel like `'__none__'`.
- In `<script setup>`, `useHead({ title: () => state.value… })` must come after `state` is declared,
  otherwise SSR fails with "Cannot access 'state' before initialization".
- `UDashboardToolbar`: content goes into `#left`/`#right`; the default slot replaces both.
- The auto-import scanner misses an `export const` that directly follows an `export const x = […] as const`
  line in the same file. If a shared export is "not found" after `nuxt prepare`, check the line before it.
- Vitest has no Nuxt auto-imports: server utils used in tests import shared helpers explicitly.
- `useFetch` uses its own `$fetch`, so the 401 handler in `session-expired.client.ts` only covers direct `$fetch`
  calls. Page loads are covered by `server/plugins/session-check.ts`.
- New Nitro plugins (`server/plugins/*`) need a dev-server restart.
- The shell is zsh: unquoted `$var` does not word-split in loops; use `xargs`.
- OAuth: never redirect to an unverified `redirect_uri`. OAuth access tokens are `api_token` rows, so `/mcp` has a
  single auth path (`requireApiTokenUser`). The consent page must stay non-frameable (`routeRules`).
- MCP write tools save via `saveDraft(…, 'mcp')`/`createExam(…, 'mcp')`; only the teacher releases in the UI.
- drizzle-kit generates libSQL-only `ALTER COLUMN` for nullability changes and `NOT NULL` columns without
  defaults; rewrite such migrations as a portable table rebuild before committing (see `0001_run_lobby.sql`).
- Screenshots of a background tab can be taken before hydration: wait or re-take before judging the UI.
- New fields in the block or answer model must be `.optional()` without `.default()`: a default adds keys when
  old data is parsed, which changes released snapshots and makes stored data differ from what was hashed. Old
  answers must parse to exactly the same JSON (test in `test/relations.test.ts`).
- OpenAI-compatible servers differ: not all accept `response_format` json_schema (we fall back after a 400), and
  reasoning models may wrap the JSON in `<think>` or code fences (`extractJson`). Test against a mock that does
  both before trusting a new provider.
- `lint:fix` turns `﻿`/`​` escapes into the invisible characters themselves (then
  `no-irregular-whitespace` fails or the code becomes unreadable): use `String.fromCharCode(…)` constants
  (`ZERO_WIDTH_SPACE` in `app/utils/pdf.ts`).
- pdfmake wraps only at spaces: a long word pushes a table off the page and the content is silently lost. All
  student text in the PDF goes through `breakable()`, tables with > 12 columns are split (`columnParts`). Check
  layout changes with a stress PDF (30 columns, 120-character words), not just with nice data.
- The auto-import scanner also missed `export`s placed after the big dictionary objects in `app/utils/ui-text.ts`.
  Keep helper exports above them; if something is "not found", run `pnpm exec nuxt prepare` and grep
  `.nuxt/imports.d.ts`.
- Student UI texts live in `app/utils/ui-text.ts` (German + English, same keys, tested). Components shared with
  teacher pages take a `lang` prop that defaults to German; only student pages pass the student's choice.
- Student forms: check the Tab order by actually typing. In the table editor, Tab from the table name used to land
  on "Tabelle löschen" and the next Enter deleted the table. DOM order = tab order; place actions visually with
  grid/order instead, and let destructive actions ask first (confirmation modal; skip it when nothing is lost).
- Data attributes on Nuxt UI inputs may end up on the wrapper or on the `<input>`; the `focus()` helper in
  `SchemaTablesInput.vue` handles both.
- `@click="fn"` passes the event as first argument; for functions with an optional parameter (`exportPdf(force)`)
  write `@click="fn()"`.
- The relational diagram is plain SVG from `diagramLayout()`: the Vue template renders it in the browser (escaped),
  `diagramSvg()` escapes for pdfmake's `svg` node. Never `v-html` the SVG string, it contains student input.
- Without `NUXT_SIGNING_PRIVATE_KEY` the dev server uses an ephemeral key (PDFs unverifiable after restart);
  production refuses to sign.
