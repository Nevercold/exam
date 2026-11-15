# exam

Exams for the classroom: teachers build an exam from blocks (task text, given tables, table answers with
primary/foreign keys, free text), start it with a PIN, and students answer in the browser. At the end each
student exports a **signed PDF** and uploads it to the school cloud themselves.

- **No student data on the server.** Names and answers never leave the student's browser; the server only signs a
  hash while the exam is running. Signed PDFs can be checked on the verification page, a whole class at once.
- **Optional AI grading suggestions** via any OpenAI-compatible API (e.g. Hetzner Inference): points per block
  and a comment, sent without the student's name and never stored. The teacher decides.
- **Normalization template** (1NF → 2NF → 3NF) for Lernfeld 8.2, other exams via the generic block editor.
- **MCP server** with OAuth 2.1: let an AI assistant draft exams, the teacher reviews and releases them.

## Self-hosting (Docker)

```bash
cp .env.example .env            # fill in secret, admin account and domain
docker run --rm ghcr.io/nevercold/exam:latest node scripts/keygen.mjs >> .env
docker compose up -d            # with Caddy (HTTPS); or -f docker-compose.standalone.yml behind your own proxy
```

Details (sizing, proxy, backups, key rotation): [`docs/deployment.md`](docs/deployment.md).

## Development

```bash
pnpm install
cp .env.example .env            # NUXT_APP_SECRET + admin account; without a signing key dev uses a temporary one
pnpm dev
```

Guide for contributors and AI agents: [`AGENTS.md`](AGENTS.md), plan and decisions: [`PLAN.md`](PLAN.md).

License: MIT
