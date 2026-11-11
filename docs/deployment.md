# Deployment & operations

Self-hosted with Docker: a single container with SQLite, optionally with Caddy for HTTPS.

## Quick start

```bash
cp .env.example .env
# fill in NUXT_APP_SECRET, NUXT_ADMIN_EMAIL, NUXT_ADMIN_PASSWORD and DOMAIN, then create the signing key:
docker run --rm ghcr.io/nevercold/exam:latest node scripts/keygen.mjs >> .env

docker compose up -d                                          # variant A: app + Caddy (automatic HTTPS)
docker compose -f docker-compose.standalone.yml up -d        # variant B: behind your own reverse proxy
```

Log in with the admin account, then invite colleagues under **Benutzer**.

## Requirements & sizing

- A Linux server with Docker (amd64 image), a domain and HTTPS.
- **1 vCPU and 512 MB RAM** are plenty for a school.

Load test (production build, `scripts/load-test.mjs`): 90 students joining one exam and exporting 3 PDFs each
within ~9 seconds, all from one IP: **0 errors**, join p95 8 ms, sign p95 6 ms, server at **~190 MB RAM** and
below 10 % of one CPU core. Measured on a developer laptop; a small VPS has less headroom per core but the same
order of magnitude. PDFs are rendered in the students' browsers, so the server load hardly grows with exam size.

```bash
node scripts/load-test.mjs https://exam.example.org <PIN> 30 3   # start a run first
```

### Single instance

Rate limits are kept in memory, so run **exactly one** container. Runs are stored in the database: a restart
does not end running exams, and students keep working in their browsers while the server is briefly gone
(signing is retried with their next export).

## Reverse proxy (variant B)

- Terminate **HTTPS**. The login cookie is `Secure`; over plain HTTP you are logged out immediately.
- Pass `Host`, `X-Forwarded-For` and `X-Forwarded-Proto`. `X-Forwarded-For` matters: rate limits are per client IP.
- Request bodies are small (no uploads; PDFs are checked in the browser), default proxy limits are fine.
- Only forward `X-Forwarded-For` from your own proxy; the app trusts it for rate limiting.
- **Privacy:** the app writes no access logs. Caddy (variant A) doesn't either unless you add a `log` directive.
  If your proxy logs requests, keep the retention short: IP addresses of students are personal data.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `NUXT_APP_SECRET` | yes | ≥ 32 characters, signs the session cookie: `openssl rand -base64 32`. Changing it logs everybody out. |
| `NUXT_SIGNING_PRIVATE_KEY` | yes | Ed25519 key that signs student PDFs, created with `node scripts/keygen.mjs`. **Back it up**: without it, PDFs signed with it can't be verified. |
| `NUXT_SIGNING_KEY_ID` | no | Id of the current key (default `k1`), stored in every signature |
| `NUXT_SIGNING_RETIRED_KEYS` | no | After a key rotation: JSON `{"k1":"<public key>"}` of old keys that stay valid for verification |
| `NUXT_ADMIN_EMAIL` | first start | Admin account created on startup if the email doesn't exist yet |
| `NUXT_ADMIN_PASSWORD` | first start | Initial admin password. **Remove it from `.env` afterwards.** |
| `DOMAIN` | variant A | Domain for Caddy's certificate |
| `BIND` | variant B | Address the app port is bound to (default `127.0.0.1:3000`) |

The database lives in the volume mounted at `/data` (`/data/exam.db`).

### Rotating the signing key

Only needed if the key leaked. Create a new key with a new id (`NUXT_SIGNING_KEY_ID=k2`), and add the old public
key (printed by `keygen.mjs` as a comment, or derive it from the old private key) to `NUXT_SIGNING_RETIRED_KEYS`.
Remove a retired key only when PDFs signed with it no longer need checking.

## Updates

```bash
docker compose pull && docker compose up -d     # variant B: add -f docker-compose.standalone.yml
```

Migrations run automatically on startup. Prefer updating outside of exams: while the container restarts,
students can't sign (they can keep working and export again afterwards).
Releases are built from `main` (`ghcr.io/nevercold/exam:latest`).

## Backups

The database is SQLite in WAL mode, so don't copy `exam.db` while the app is running. Use the included backup
script, which takes a consistent snapshot while the app keeps running and checks its integrity:

```bash
docker compose exec app node scripts/backup.mjs     # → /data/backups/exam-<date>-<time>.db
docker compose cp app:/data/backups ./backups
```

Old snapshots in `/data/backups` are not deleted automatically. Keep the signing key with the backup (but not
in the same publicly readable place).

### Restore

1. Stop the app: `docker compose stop app`
2. Copy the snapshot into the volume and remove the old WAL files. The volume is named
   `<project>_exam-data`, where `<project>` is the name of the folder with your compose file:

   ```bash
   docker run --rm -v <project>_exam-data:/data -v "$PWD/backups:/backups" alpine sh -c \
     'rm -f /data/exam.db-wal /data/exam.db-shm && cp /backups/exam-<date>-<time>.db /data/exam.db && chown 1000:1000 /data/exam.db'
   ```

3. Start again: `docker compose start app`

## Monitoring

- `GET /api/health` returns `{"ok":true}` when the app and the database respond; the Docker image has a
  `HEALTHCHECK` on it (`docker compose ps` shows `healthy`).
- Logs: `docker compose logs -f app`

## Security checklist

- [ ] Strong `NUXT_APP_SECRET`, `.env` not world-readable
- [ ] `NUXT_SIGNING_PRIVATE_KEY` set and backed up outside the server
- [ ] `NUXT_ADMIN_PASSWORD` removed from `.env` after the first start
- [ ] HTTPS only; the app port is not reachable from the internet directly (variant B binds to localhost)
- [ ] Regular backups, stored outside the server
- [ ] Deactivate accounts of teachers who leave (**Benutzer**); this also ends their sessions and API tokens

## Troubleshooting

| Problem | Cause / fix |
|---|---|
| Login succeeds but you are logged out immediately | No HTTPS (cookie is `Secure`) or `X-Forwarded-Proto` missing |
| App doesn't start: `NUXT_SIGNING_PRIVATE_KEY is not set` | Create a key with `node scripts/keygen.mjs` and add it to `.env` |
| Students get "Zu viele falsche PINs" | More than 200 wrong PINs from one IP within 10 minutes (whole school behind one IP); wait up to 10 minutes. Joining via QR code avoids typos. |
| All students are rate-limited together | Proxy doesn't send `X-Forwarded-For` |
| Verification says "Keine Prüfungsdaten" | The PDF was re-saved, printed to PDF or edited; ask for the original export |
| Verification says "Signatur ungültig" | The PDF content was changed after signing, or it was signed by a key that is no longer configured |
