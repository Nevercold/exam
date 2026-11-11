# Deployment & operations

Quick start (Docker with Caddy or behind your own reverse proxy): see [README → Self-hosting](../README.md#self-hosting-docker).
This page covers sizing, reverse proxy details, updates, backups and troubleshooting.

## Requirements & sizing

- A Linux server with Docker (amd64 image), a domain and HTTPS.
- **1 vCPU and 512 MB RAM** are plenty for a school.

Load test (production build, `scripts/simulate-game.mjs`): 4 games with 60 players each at the same time
(240 WebSocket connections) peaked at **~190 MB RAM** and **~15 % of one CPU core**, answer round trip below 70 ms,
no errors. Measured on a developer laptop; a small VPS has less headroom per core but the same order of magnitude.

### Single instance only

Running games live in the memory of the app process. Run **exactly one** container; don't scale it horizontally
or put several instances behind a load balancer. A restart ends all running games (results of finished games are
already stored).

## Reverse proxy (variant B)

Requirements (also in the README):

- Terminate **HTTPS**. The login cookie is `Secure`; over plain HTTP you are logged out immediately.
- Forward **WebSockets** on `/_ws` (`Upgrade` / `Connection` headers).
- Pass `Host`, `X-Forwarded-For` and `X-Forwarded-Proto`. `X-Forwarded-For` matters: rate limits are per client IP.
- Allow request bodies of at least **16 MB** (image uploads, the app itself accepts up to 10 MB per image).

Notes:

- Idle WebSockets: clients send a ping every 25 seconds, so the usual proxy read timeouts (60 s, e.g. nginx
  `proxy_read_timeout`) are fine.
- **Nginx Proxy Manager:** enable *Websockets Support* for the proxy host and request an SSL certificate.
- Only forward `X-Forwarded-For` from your own proxy; the app trusts it for rate limiting.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `NUXT_APP_SECRET` | yes | ≥ 32 characters, signs the session cookie: `openssl rand -base64 32`. Changing it logs everybody out. |
| `NUXT_ADMIN_EMAIL` | first start | Admin account created on startup if the email doesn't exist yet |
| `NUXT_ADMIN_PASSWORD` | first start | Initial admin password. **Remove it from `.env` afterwards.** |
| `DOMAIN` | variant A | Domain for Caddy's certificate |
| `BIND` | variant B | Address the app port is bound to (default `127.0.0.1:3000`) |

Database and uploads live in the volume mounted at `/data` (`/data/quiz.db`, `/data/uploads`).

## Updates

```bash
docker compose pull && docker compose up -d     # variant B: add -f docker-compose.standalone.yml
```

Migrations run automatically on startup. A restart ends running games, so **update outside of lessons**.
Releases are built from `main` (`ghcr.io/nevercold/learn:latest`).

## Backups

The database is SQLite in WAL mode, so don't copy `quiz.db` while the app is running. Use the included backup
script, which takes a consistent snapshot while the app keeps running and checks its integrity:

```bash
docker compose exec app node scripts/backup.mjs     # → /data/backups/quiz-<date>-<time>.db
docker compose cp app:/data/backups ./backups
docker compose cp app:/data/uploads ./uploads       # images: immutable files, safe to copy any time
```

Old snapshots in `/data/backups` are not deleted automatically.

### Restore

1. Stop the app: `docker compose stop app`
2. Copy the snapshot into the volume and remove the old WAL files. The volume is named
   `<project>_quiz-data`, where `<project>` is the name of the folder with your compose file:

   ```bash
   docker run --rm -v <project>_quiz-data:/data -v "$PWD/backups:/backups" alpine sh -c \
     'rm -f /data/quiz.db-wal /data/quiz.db-shm && cp /backups/quiz-<date>-<time>.db /data/quiz.db && chown 1000:1000 /data/quiz.db'
   ```

3. Start again: `docker compose start app`

## Monitoring

- `GET /api/health` returns `{"ok":true}` when the app and the database respond; the Docker image has a
  `HEALTHCHECK` on it (`docker compose ps` shows `healthy`).
- Logs: `docker compose logs -f app`

## Security checklist

- [ ] Strong `NUXT_APP_SECRET`, `.env` not world-readable
- [ ] `NUXT_ADMIN_PASSWORD` removed from `.env` after the first start
- [ ] HTTPS only; the app port is not reachable from the internet directly (variant B binds to localhost)
- [ ] Regular backups, stored outside the server
- [ ] Deactivate accounts of teachers who leave (**Benutzer**); this also ends their sessions and API tokens

## Troubleshooting

| Problem | Cause / fix |
|---|---|
| Login succeeds but you are logged out immediately | No HTTPS (cookie is `Secure`) or `X-Forwarded-Proto` missing |
| Projector or phones stay on "Verbinde …" | Proxy doesn't forward WebSockets on `/_ws` |
| Image upload fails with 413 | Proxy body size limit below 16 MB |
| Students get "Zu viele falsche PINs" | More than 200 wrong PINs from one IP within 10 minutes (whole school behind one IP); wait up to 10 minutes. Joining via QR code avoids typos. |
| All students appear to come from one IP / are rate-limited together | Proxy doesn't send `X-Forwarded-For` |
| Running game gone after an update | Expected: games live in memory, see *Single instance only* |
