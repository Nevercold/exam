---
name: verify
description: Fully verify exam with lint, typecheck, tests, production build and an API smoke test against a running server. Use before commits/PRs and after larger changes.
---

# Verify

## 1. Static checks

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## 2. Start a dev server with a test admin (in the background)

```bash
NUXT_APP_SECRET=dev-secret-at-least-32-characters-long-xx \
NUXT_ADMIN_EMAIL=admin@test.de NUXT_ADMIN_PASSWORD=admin-password-123 \
NUXT_DATABASE_URL=file:./data/verify.db \
pnpm dev --port 3123
```

A separate DB file (`data/verify.db`) keeps local data untouched. Delete it afterwards.

## 3. Smoke test (curl)

```bash
B=http://localhost:3123
curl -s --retry 30 --retry-connrefused --retry-delay 2 $B/api/health
curl -s -c data/a.jar -H 'content-type: application/json' \
  -d '{"email":"admin@test.de","password":"admin-password-123"}' $B/api/auth/login
curl -s -b data/a.jar $B/api/admin/users
```

Expect: teacher routes without a session → 401, teacher on admin routes → 403, invalid input → 400.
Add the endpoints of the feature you're working on. Delete cookie jars and `data/verify.db` afterwards.

## 4. Production build

Run this when changing the build, dependencies or anything native (libsql):

```bash
pnpm build
PORT=3125 NUXT_APP_SECRET=... NUXT_ADMIN_EMAIL=... NUXT_ADMIN_PASSWORD=... \
NUXT_DATABASE_URL=file:./data/prod-test.db node .output/server/index.mjs
curl -s localhost:3125/api/health
```

Or with Docker: `docker build -t exam:test . && docker run --rm -p 3124:3000 -e NUXT_APP_SECRET=... exam:test`

## 5. Server log

Watch for `WARN`/`ERROR` in the server log and fix deprecations early.
