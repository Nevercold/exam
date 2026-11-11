# exam

Exams for the classroom: teachers build an exam from blocks (task text, given tables, table answers with
primary/foreign keys, free text), start it with a PIN, and students answer in the browser. At the end each
student exports a **signed PDF** and uploads it to the school cloud themselves.

- **No student data on the server.** Names and answers never leave the student's browser; the server only signs a
  hash while the exam is running. Signed PDFs can be checked on the verification page.
- **Normalization template** (1NF → 2NF → 3NF) for Lernfeld 8.2, other exams via the generic block editor.
- **MCP server** with OAuth 2.1: let an AI assistant draft exams, the teacher reviews and releases them.

Self-hosted with Docker (SQLite, single container, optional Caddy). See [`docs/deployment.md`](docs/deployment.md),
development guide in [`AGENTS.md`](AGENTS.md), plan in [`PLAN.md`](PLAN.md).

License: MIT
