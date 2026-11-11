// Consistent online backup of the SQLite database (safe while the app is running, WAL mode included).
// No dependencies: uses node:sqlite. Included in the Docker image:
//
//   docker compose exec app node scripts/backup.mjs            → /data/backups/exam-<timestamp>.db
//   docker compose cp app:/data/backups ./backups
//
// Uploaded images (/data/uploads) are immutable files and can be copied at any time.
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'

const url = process.env.NUXT_DATABASE_URL ?? 'file:./data/exam.db'
if (!url.startsWith('file:')) throw new Error(`Only local SQLite files can be backed up (NUXT_DATABASE_URL=${url})`)
const source = url.slice('file:'.length)

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
const target = process.argv[2] ?? join(dirname(source), 'backups', `exam-${stamp}.db`)
mkdirSync(dirname(target), { recursive: true })

const db = new DatabaseSync(source, { readOnly: true })
const pages = await backup(db, target)
db.close()

// Make the copy a single self-contained file (no -wal/-shm next to it) and verify it
const copy = new DatabaseSync(target)
copy.exec('PRAGMA journal_mode = DELETE')
const check = copy.prepare('PRAGMA integrity_check').get()
copy.close()
if (check.integrity_check !== 'ok') throw new Error(`Backup failed the integrity check: ${JSON.stringify(check)}`)
console.log(`Backup written to ${target} (${pages} pages, integrity ok)`)
