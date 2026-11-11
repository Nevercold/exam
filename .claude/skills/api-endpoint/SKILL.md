---
name: api-endpoint
description: Add or change a Nitro API endpoint in exam (server/api) with auth, Zod validation, rate limiting and German user-facing error messages. Use for every new or modified route under /api.
---

# Adding an API endpoint

## File & routing

- `server/api/<path>/<name>.<method>.ts`, e.g. `server/api/exams/[id]/index.patch.ts` for `PATCH /api/exams/:id`.
- Collections: `index.get.ts` / `index.post.ts`. Single resources: `[id]/index.<method>.ts`.

## Template

```ts
import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)                        // 1. auth (or requireAdmin)
  const id = getRouterParam(event, 'id')!
  const input = await readValidatedBody(event, fooSchema.parse) // 2. validation (schema from shared/utils)

  const row = await useDb().update(tables.foos)                 // 3. logic, check ownership!
    .set(input)
    .where(and(eq(tables.foos.id, id), eq(tables.foos.authorId, me.id)))
    .returning().get()
  if (!row) throw createError({ statusCode: 404, message: 'Nicht gefunden' })

  return row                                                     // 4. never return secrets
})
```

## Checklist

- [ ] `requireTeacher`/`requireAdmin` as the **first** line (except intentionally public routes like join/invite)
- [ ] Public routes: `rateLimit(event, '<scope>', limit, windowMs)`
- [ ] Body/query validated with Zod from `shared/utils/schemas.ts` (`readValidatedBody`, `getValidatedQuery`);
      the client form uses the same schema
- [ ] Ownership check for shared resources (`requireExamAccess` for shared exams, `requireExamOwner` for archive/sharing)
- [ ] Errors via `createError({ statusCode, message })` with a German message, **not** `statusMessage`
- [ ] No password/token hashes in responses (`toPublicUser` or similar)
- [ ] Client `$fetch` with dynamic paths: pass a generic (`$fetch<T>(…)`) to avoid "Excessive stack depth"
- [ ] Pure logic (scoring, parsing) in testable functions, tests in `test/`
- [ ] Afterwards: `pnpm lint && pnpm typecheck && pnpm test`
