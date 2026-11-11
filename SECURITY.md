# Security Policy

## Reporting a vulnerability

Please **do not open public issues** for security vulnerabilities.
Report them privately via
[GitHub Private Vulnerability Reporting](https://github.com/Nevercold/learn/security/advisories/new).

Helpful details:

- affected version/commit
- steps to reproduce
- potential impact

You'll usually get a response within a week.

## Supported versions

Security fixes are provided for the latest state of `main` / the latest release only.

## Notes for operators

- `NUXT_APP_SECRET` must be long and random (`openssl rand -base64 32`) and must never be exposed.
- After the first start, remove `NUXT_ADMIN_PASSWORD` from `.env` and change the password in the app.
- Only run behind HTTPS (e.g. with the included Caddy setup).
- Back up the `/data` volume (SQLite + uploads) regularly.
