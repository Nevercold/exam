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
| Run control | Teacher opens a run (timer in minutes or none) → students join and see only a waiting screen → teacher clicks "Prüfung starten": content appears, timer starts. End manually any time (or cancel while waiting) |
| Head count | Projector shows how many students are connected: anonymous random id per browser, in memory only |
| After the run ends | PDFs are still signed for **10 minutes** (grace period, marked on the verification page); after that exports are **unsigned** and visibly marked |
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

An exam's content is `{ title, template, blocks: Block[] }`, defined as a zod discriminated union in
`shared/utils/exam.ts` (also: student view via allow-list, answer schemas, templates, editor warnings).
Formal hints live in `shared/utils/hints.ts`, PDF rendering in `app/utils/pdf.ts`. Per block type the
UI has `app/components/blocks/<Type>Editor.vue` (teacher, incl. solution), `<Type>Input.vue` (student)
and a read-only view (preview, verification page).

### MVP block types

- **`text`** — Markdown task text/heading. Rendered with a safe Markdown renderer (no raw HTML).
- **`table`** — given table (`columns: string[]`, `rows: string[][]`), e.g. the unnormalized table.
- **`schema-answer`** — student builds tables:
  `tables: [{ name, columns: [{ name, pk, fk?: { table, column, cardinality? } }], rows: string[][] }]`.
  Option `copyFrom: blockId` adds a button "Tabellen aus vorherigem Schritt übernehmen" (copies keys and
  cardinalities). Option `askCardinality`: every FK needs `1:1` or `1:n` (seen from the referenced table);
  relationships are derived from FKs (`shared/utils/relations.ts`) and shown as diagram + text list on the
  student page, in the editor, on the verification page and in the PDF. Missing cardinalities: hint while
  working, warning dialog on export (export stays possible). The verification page compares relationships
  with the solution (informational, no points): tables matched by name or columns, reversed direction is an
  error, a missing junction table is reported as unresolved n:m (info).
  Hints: table without PK, FK to missing table/column or to a non-PK column, empty or duplicate names, empty
  cells, rows with wrong cell count.
- **`freetext`** — reasoning text, optional character limit.
- **Translations** (optional, `content.translations[lang]`): any language, written by the teacher in the editor
  (title + one text per block; table contents and solutions are not translated). Students switch a translation
  on themselves (off by default); it is shown below the German text (RTL for Arabic etc.). The student interface
  itself is German or English. Answers and the PDF stay German; the PDF notes which translation was shown.
- The editor preview can be exported as a PDF (watermark "VORSCHAU").
- **Leaving the page** (other tab/window, `useFocusLog`): counted only while the exam is running, not during the
  PDF export; students see a notice. Count + duration go into the signed submission, the PDF, the verification
  page and the CSV. An indication, not proof (measured in the student's browser).
- Both answer blocks have optional `points` (max., shown to students and in the PDF). The verification page checks many PDFs at once
  (overview, duplicates skipped, CSV for the grade book) and, if `NUXT_AI_*` is configured, asks an
  OpenAI-compatible API (Hetzner Inference) for a points suggestion + comment per block. Sent without the name,
  not stored; the teacher decides.

### Normalization template

`text` (scenario) → `table` (unnormalized) → for 1NF/2NF/3NF: `text` (heading) + `schema-answer`
(`copyFrom` the previous step; the 3NF step has `askCardinality`) + `freetext` (reasoning). Template checks (warnings in editor and
`validate_exam`): ≥ 8 columns, 3–5 rows, solution present in every answer block. A "troll" exam is
just an exam whose solution has unchanged tables in every step.

## Data model (Drizzle)

Accounts, invites, API tokens and OAuth follow Quizzle (see `server/db/schema.ts`):

```
user            id, name, email (unique), passwordHash (null until invite redeemed), isAdmin, active
invite          tokenHash (PK), userId → user, expiresAt, usedAt          -- admin creates user + link
api_token       id, userId, name, prefix, tokenHash, expiresAt, revokedAt, source ('manual'|'oauth'),
                oauthClientId, refreshTokenHash, refreshExpiresAt          -- OAuth access tokens are rows here
oauth_client    id, name, redirectUris                                     -- DCR; CIMD clients not stored
oauth_code      codeHash, clientId, userId, redirectUri, codeChallenge, scope, expiresAt
exam            id, ownerId → user, draft (json), draftUpdatedAt, draftUpdatedVia ('editor'|'mcp'),
                released (json|null), releasedAt, sharedWithColleagues, archivedAt, createdAt
run             id, examId → exam, startedBy → user, pin, snapshot (json), startedAt, endsAt, endedAt
```

The first admin is created from `NUXT_ADMIN_EMAIL`/`NUXT_ADMIN_PASSWORD` on startup.

- Editing (UI or MCP) changes `draft`. "Freigeben" copies `draft` → `released`. Only released
  exams can be started.
- A run stores a **snapshot**, so editing an exam never affects a running or past run, and the
  verification page shows the solution that belonged to the run.
- A run is active while `endedAt IS NULL AND (endsAt IS NULL OR endsAt > now)`.

## Flows

**Run a sitting (teacher):** pick a released exam → optional timer → run opens in the **waiting** state
with a 6-digit PIN unique among open runs → projector view with large PIN, QR code (`/p/<pin>`) and the
number of connected students → "Prüfung starten" sets `startedAt` and `endsAt` → countdown, "Beenden"
button (keyboard accessible).

**Take the exam (student):** open QR/enter PIN → waiting screen, polling `/api/join/<pin>` every ~3 s
(no content is sent before the start) → after the start the server returns the snapshot **without
solutions** → enter name, work through blocks, see formal hints → answers autosaved in `localStorage`
(per run id), heartbeat every 20 s (`/api/presence`: head count + detects a manual end) →
"PDF exportieren".

**Export and sign:**
1. Browser builds canonical JSON `{ v, runId, examTitle, name, answers, exportedAt }`.
2. Browser sends `{ runId, hash: sha256(json) }` to `POST /api/sign`.
3. If the run is running or ended less than 10 minutes ago (`SIGN_GRACE_MS`), the server returns
   `signature = Ed25519({ v, runId, hash, signedAt, kid })`. Otherwise the browser exports unsigned.
4. Browser renders the PDF: name, exam title, date, answers, short verification code; the
   submission JSON and signature are embedded in the PDF info dictionary (`ExamSubmission`).
   Unsigned PDFs carry a clear "NICHT SIGNIERT" mark on every page.

**Verify (teacher):** upload one PDF on `/verify` → browser extracts the embedded JSON, recomputes
the hash and sends only `{ payload, signature }` to `POST /api/verify` → server checks the signature
and run, returns the run's snapshot including solutions if the teacher has access to the exam →
page shows: signature status, signed-at time vs. run window, and each block's answer next to the
solution. The student's name and answers stay in the browser.

## Security and privacy

- Server never receives student names or answers; the sign endpoint takes a hash only.
- No student accounts; nothing about students is stored. Teacher accounts store email, name,
  password hash.
- Solutions never reach student clients: the student endpoint strips them through an allow-list
  zod schema (`toStudentContent`), covered by tests.
- Signing key from env (`NUXT_SIGNING_PRIVATE_KEY`, PKCS8), key id `kid` in each signature so keys
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

1. **Scaffold** ✅ — Nuxt 4, Nuxt UI v4, Inter, ESLint, Vitest, typecheck, Drizzle + libSQL
   with auto-migrations, `/api/health`, CI workflow (lint, typecheck, test, build, migration/schema
   check), Dockerfile. Domain model (`shared/utils/exam.ts`), hints, signing utils + tests.
2. **Accounts** ✅ — taken over from Quizzle: admin seed from env, invite links, login/logout, admin user
   list, deactivate, rate limits, API tokens, OAuth 2.1 authorization server.
3. **Blocks and editor** ✅ — four MVP blocks, exam list/editor with draft/release, sharing, copy,
   archive, student preview, normalization template + checks, paste tables from spreadsheets.
4. **Runs and student view** ✅ — start with/without timer, end manually, projector view (PIN, QR,
   countdown), student page at 360 px, hints, autosave, offline fallback (cached exam, unsigned export).
5. **PDF and signing** ✅ — canonical JSON, sign endpoint, PDF in the browser (landscape for wide tables),
   submission embedded in the PDF info dictionary, "NICHT SIGNIERT" watermark.
6. **Verification** ✅ — upload one PDF, signature/hash/run-window check, side-by-side with the solution.
7. **MCP** ✅ — `/mcp` (Streamable HTTP, auth from phase 2), resource `exam://schema`, tools:
   `list_exams`, `get_exam`, `validate_exam`, `create_exam`, `update_exam` (all writes → draft).
8. **Operations** ✅ — Docker (Caddy or own proxy), backup + keygen scripts in the image, healthcheck,
   startup check for the signing key, load test script, `docs/deployment.md`.

## Ideas (not planned yet)

- More block types: `choice` (single/multiple choice), `sql` (query answer), ER diagrams (Chen).
- Automatic comparison hints on the verification page (currently manual grading by design).

## Further defaults (confirmed)

- Students can join a run only while it is active; pages already open keep working offline.
- The projector can extend the timer (+5/+10/+15 or custom, max. 120 min per click), also after it ran out
  (reopens the run) as long as nobody clicked "Beenden" and signing is still open.
- The PDF shows only name, exam title, date, answers and the verification code.
- Only the owner can archive an exam or change its sharing.
