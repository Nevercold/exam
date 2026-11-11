# exam — Plan

Web tool for teachers to build exams from blocks. Students work in the browser and export a
**signed PDF**, which they upload to the school cloud themselves. The server stores **no student
data**: it never sees names or answers, only a hash to sign.

First use case: normalization exams (LF 8.2, FISI 2nd year): unnormalized table → 1NF → 2NF → 3NF.

## Decisions

| Topic | Decision |
|---|---|
| Submission | PDF only, downloaded by the student, uploaded by them to the school cloud |
| Student identity | Name typed into the exam page, printed on the PDF, never sent to the server |
| Run control | Teacher starts a run with a timer (minutes) or without one; can end it manually at any time |
| After the run ends | Export still possible, but the PDF is **unsigned** and visibly marked as such |
| Multiple exports | Allowed; each PDF carries its own signature timestamp, the teacher uses the latest |
| Roles | `admin` (invites, deactivates) and `teacher`; accounts via invite link only |
| Sharing | An exam can be shared with all colleagues; everyone with access can view (incl. solution), edit, copy and start it |
| Solution access | Everyone with access to an exam sees its solution |
| Grading | Manual. Verification page: upload **one** student PDF → signature check + answer side by side with the solution. No automatic scoring or diffing |
| Hints for students | Formal hints only (e.g. "table without PK"), never content checks |
| AI interface | MCP at `/mcp` with OAuth 2.1 (PKCE, DCR) and personal tokens; everything the AI writes is a draft |
| Blocks (MVP) | `text`, `table`, `schema-answer`, `freetext`. Later: `choice`, `sql`. ER diagrams: not planned for now |
| Hosting | Own VPS, Docker, single instance |
| Design | Primary `emerald`, font Inter (bundled locally), German UI |

## Stack

- Nuxt 4 + Nuxt UI v4 (Tailwind v4) + Nitro, TypeScript, pnpm
- SQLite (libSQL, WAL) + Drizzle ORM; migrations run on startup; committed migrations are never edited
- Zod for all validation, shared between forms, API and MCP (`shared/`)
- nuxt-auth-utils for teacher sessions (password hashing via its scrypt helpers)
- PDF in the browser: pdfmake (layout/tables) + pdf-lib (embedded attachment)
- Signing: Ed25519 via Node Web Crypto on the server
- Vitest, ESLint (`@nuxt/eslint`), `nuxi typecheck`
- Docker image on GHCR via GitHub Actions; variants with Caddy or behind an existing reverse proxy

## Block model

Each block type lives in two places:

```
shared/blocks/<type>/
  schema.ts   # zod: config (teacher-defined), solution, answer
  hints.ts    # pure: (config, answer) => Hint[]
  pdf.ts      # pure: (config, answer) => pdfmake content
app/components/blocks/<type>/
  Editor.vue  # teacher: config + solution
  Input.vue   # student: answer
  View.vue    # read-only render (preview, verification page)
```

A registry in `shared/blocks/index.ts` maps `type` → definitions. An exam's content is
`{ title, blocks: Block[] }` where each block is `{ id, type, config, solution? }`.

### MVP block types

- **`text`** — Markdown task text/heading. Rendered with a safe Markdown renderer (no raw HTML).
- **`table`** — given table (`columns: string[]`, `rows: string[][]`), e.g. the unnormalized table.
- **`schema-answer`** — student builds tables:
  `tables: [{ name, columns: [{ name, pk, fk?: { table, column } }], rows: string[][] }]`.
  Option `copyFrom: blockId` adds a button "Tabellen aus vorherigem Schritt übernehmen".
  Hints: table without PK, FK to missing table/column, empty or duplicate names, empty cells,
  rows with wrong cell count.
- **`freetext`** — reasoning text, optional character limit.

### Normalization template

`text` (scenario) → `table` (unnormalized) → for 1NF/2NF/3NF: `text` (heading) + `schema-answer`
(`copyFrom` the previous step) + `freetext` (reasoning). Template checks (warnings in editor and
`validate_exam`): ≥ 8 columns, 3–5 rows, solution present in every answer block. A "troll" exam is
just an exam whose solution has unchanged tables in every step.

## Data model (Drizzle)

```
users           id, email (unique), name, passwordHash, role ('admin'|'teacher'),
                disabledAt, createdAt
invites         id, tokenHash, role, createdBy → users, expiresAt, usedAt
exams           id, ownerId → users, title, draft (json), released (json|null),
                releasedAt, sharedWithColleagues (bool), createdAt, updatedAt, archivedAt
runs            id, examId → exams, startedBy → users, pin, snapshot (json: released content
                incl. solutions at start), startedAt, endsAt (null = no timer), endedAt
api_tokens      id, userId → users, name, tokenHash, lastUsedAt, createdAt, revokedAt
oauth_clients   id, clientId, name, redirectUris (json), createdAt          -- DCR
oauth_codes     id, codeHash, clientId, userId, codeChallenge, redirectUri, expiresAt, usedAt
oauth_tokens    id, accessTokenHash, refreshTokenHash, clientId, userId, expiresAt, revokedAt
```

- Editing (UI or MCP) changes `draft`. "Freigeben" copies `draft` → `released`. Only released
  exams can be started.
- A run stores a **snapshot**, so editing an exam never affects a running or past run, and the
  verification page shows the solution that belonged to the run.
- A run is active while `endedAt IS NULL AND (endsAt IS NULL OR endsAt > now)`.

## Flows

**Start a run (teacher):** pick a released exam → optional timer → run gets a 6-digit PIN unique
among active runs → projector view with large PIN, QR code (`/p/<pin>`), countdown, "Beenden" button
(keyboard accessible).

**Take the exam (student):** open QR/enter PIN → server returns the snapshot **without solutions**
→ enter name, work through blocks, see formal hints → answers autosaved in `localStorage`
(per run id) → "PDF exportieren".

**Export and sign:**
1. Browser builds canonical JSON `{ v, runId, examTitle, name, answers, exportedAt }`.
2. Browser sends `{ hash: sha256(json) }` to `POST /api/runs/<pin>/sign`.
3. If the run is active, the server returns `signature = Ed25519({ v, runId, hash, signedAt, kid })`.
   Otherwise the browser exports unsigned.
4. Browser renders the PDF: name, exam title, date, answers, short verification code/QR; the
   canonical JSON and signature are embedded as a PDF attachment. Unsigned PDFs carry a clear
   "NICHT SIGNIERT" mark on every page.

**Verify (teacher):** upload one PDF on `/admin/verify` → browser extracts attachment, recomputes
the hash and sends only `{ payload, signature }` to `POST /api/verify` → server checks the signature
and run, returns the run's snapshot including solutions if the teacher has access to the exam →
page shows: signature status, signed-at time vs. run window, and each block's answer next to the
solution. The student's name and answers stay in the browser.

## Security and privacy

- Server never receives student names or answers; the sign endpoint takes a hash only.
- No student accounts; nothing about students is stored. Teacher accounts store email, name,
  password hash.
- Solutions never reach student clients: the student endpoint strips them through a dedicated
  zod schema; covered by a test per block type.
- Signing key from env (`SIGNING_PRIVATE_KEY`, PKCS8), key id `kid` in each signature so keys
  can be rotated (old public keys stay configured for verification).
- Tokens (invites, API, OAuth codes/tokens) stored as SHA-256 hashes only, never sent to clients.
- Accounts are deactivated, not deleted. Every protected endpoint first checks session/token and
  that the user is not disabled.
- Rate limits on failed attempts, not normal use (one school = one IP): wrong PINs, failed logins,
  invalid invite tokens. Sign endpoint: generous per-run limit.
- User input is never rendered as HTML.
- Access logs: off in the app; Caddy example config without IP logging.
- Public repo: no secrets, `example.org` as domain, commits with GitHub noreply address.

## Phases

Each phase ends with green `lint`, `typecheck`, `test`, a commit (and push once a remote exists).

1. **Scaffold** — Nuxt 4, Nuxt UI v4, Inter bundled, ESLint, Vitest, typecheck, Drizzle + libSQL
   with auto-migrations, `/api/health`, CI workflow (lint, typecheck, test, build, migration/schema
   check), Dockerfile.
2. **Accounts** — bootstrap admin invite (printed once on first start when no user exists), invite
   links, login/logout, admin user list, deactivate, rate limits.
3. **Blocks and editor** — block registry, four MVP blocks (editor, input, view, hints, pdf),
   exam list/editor with draft/release, sharing, copy, normalization template + checks.
4. **Runs and student view** — start with/without timer, end manually, projector view (PIN, QR,
   countdown), student page at 360 px, hints, autosave, solution-stripping tests.
5. **PDF and signing** — canonical JSON, sign endpoint, PDF rendering with attachment, unsigned mark.
6. **Verification** — upload one PDF, signature check, side-by-side with the solution.
7. **MCP** — `/mcp` (Streamable HTTP), OAuth 2.1 (PKCE, DCR) authorization flow with consent page,
   personal tokens, tools: `list_block_types`, `get_block_schema`, `list_exams`, `get_exam`,
   `create_exam`, `update_exam`, `validate_exam`, `preview_exam` (all writes → draft).
8. **Operations** — Caddy variant, backup script (SQLite online backup) in the image, healthcheck,
   load test bot script (students joining and signing), `docs/deployment.md`.

## Further defaults (confirmed)

- Students can join a run only while it is active; pages already open keep working offline.
- No "extend timer" button for now.
- The PDF shows only name, exam title, date, answers and the verification code.
- Only the owner can archive an exam or change its sharing.
