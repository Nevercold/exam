// Load test: simulated students join a running exam and request signatures, like a class exporting PDFs.
//
//   node scripts/load-test.mjs <baseUrl> <pin> [students=30] [exportsPerStudent=3]
//
// Start a run in the app first (Prüfung → Starten) and pass its PIN. All requests come from one IP, like a
// school, so this also checks that rate limits don't hit normal use (the sign limit is 600 per 10 minutes and
// IP: stay below that or run it against a dev server you can restart).
import { createHash } from 'node:crypto'

const [base, pin, studentsArg = '30', exportsArg = '3'] = process.argv.slice(2)
if (!base || !/^\d{6}$/.test(pin ?? '')) {
  console.error('Usage: node scripts/load-test.mjs <baseUrl> <pin> [students] [exportsPerStudent]')
  process.exit(1)
}
const students = Number(studentsArg)
const exportsPerStudent = Number(exportsArg)

const timings = { join: [], sign: [] }
let errors = 0

async function timed(kind, fn) {
  const start = performance.now()
  try {
    return await fn()
  }
  catch (err) {
    errors++
    console.error(`${kind}: ${err.message}`)
  }
  finally {
    timings[kind].push(performance.now() - start)
  }
}

async function student(i) {
  // Students don't all arrive at the same millisecond
  await new Promise(r => setTimeout(r, Math.random() * 2000))
  const run = await timed('join', async () => {
    const res = await fetch(`${base}/api/join/${pin}`)
    if (!res.ok) throw new Error(`join ${res.status}`)
    return res.json()
  })
  if (!run) return
  for (let e = 0; e < exportsPerStudent; e++) {
    await new Promise(r => setTimeout(r, Math.random() * 3000))
    const hash = createHash('sha256').update(`student-${i}-export-${e}-${Date.now()}`).digest('hex')
    await timed('sign', async () => {
      const res = await fetch(`${base}/api/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId: run.runId, hash }),
      })
      if (!res.ok) throw new Error(`sign ${res.status}`)
      const body = await res.json()
      if (body.payload.hash !== hash) throw new Error('wrong hash signed')
    })
  }
}

const pct = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(0) : '-'
}

const started = performance.now()
await Promise.all(Array.from({ length: students }, (_, i) => student(i)))
const seconds = ((performance.now() - started) / 1000).toFixed(1)

console.log(`${students} students × ${exportsPerStudent} exports in ${seconds} s, errors: ${errors}`)
for (const [kind, values] of Object.entries(timings)) {
  console.log(`${kind.padEnd(5)} n=${values.length} p50=${pct(values, 0.5)} ms p95=${pct(values, 0.95)} ms max=${pct(values, 1)} ms`)
}
process.exitCode = errors ? 1 : 0
