# AGENTS.md

Guide for agents and humans working on **exam**. See `PLAN.md` for scope, data model and phases.

## Workflow

- Work phase by phase from `PLAN.md`. After each phase: `lint`, `typecheck`, `test` green → commit
  (→ push once a remote exists).
- Don't invent product decisions (rules, texts, defaults). Ask, collecting questions in one batch.
- Every pitfall that cost time goes into **Gotchas** below.

## Commands

> Filled in during phase 1.

```
pnpm dev          # dev server
pnpm lint         # ESLint
pnpm typecheck    # nuxi typecheck
pnpm test         # Vitest
pnpm build        # production build
pnpm db:generate  # Drizzle: generate migration from schema
```

## Structure

```
app/                      # Nuxt app (pages, components, composables)
  components/blocks/<t>/  # Editor.vue, Input.vue, View.vue per block type
server/                   # Nitro: api/, db/ (schema, migrations), utils/, mcp/
shared/                   # zod schemas, block definitions (schema, hints, pdf) — used by app + server
docs/                     # deployment.md
```

## Conventions

- UI texts and error messages: German with real umlauts. Code, comments, docs, commits: English.
- Comments only where the *why* isn't obvious. Mark deliberate simplifications:
  `// Simplification: <limit>, upgrade when <condition>`.
- Zod for every validation; the same schema in form and API (`shared/`).
- Every protected endpoint checks auth and the user's DB state (disabled?) in its first line.
- Solutions never reach student clients — student payloads go through a dedicated schema, tested.
- The server never receives student names or answers (sign endpoint takes a hash only).
- Tokens stored as SHA-256 hashes only; hashes never sent to the client.
- Never render user input as HTML.
- Committed migrations are never edited; add a new one.
- Public repo: no secrets, no real domain (`example.org`), no personal details.
- Student pages stay lean: no CDNs, external fonts or icon APIs; everything bundled locally.
- Every page works at 360 px width; long words wrap (`hyphens: auto`, `overflow-wrap: anywhere`).

## Gotchas

- Flex children in scroll containers get squeezed: set `shrink-0`.
- Nuxt UI inputs accept `undefined`, not `null`.
- `$fetch` with dynamic paths needs an explicit generic (typecheck stack depth).
- Global setup like `z.config` belongs in plugins — Nitro tree-shakes top-level side effects.
- Inputs on pages with global shortcuts need `@keydown.enter.stop`.
- One school shares one IP: rate-limit failed attempts, not normal usage.
