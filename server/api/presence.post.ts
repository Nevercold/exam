import { eq } from 'drizzle-orm'

// Public heartbeat from a student browser while working. Counts it for the projector and tells the
// page whether the run is still running (so a manual end shows up without a reload).
export default defineEventHandler(async (event) => {
  // A class sends ~3 heartbeats per minute per student; several classes can share one school IP
  rateLimit(event, 'presence', 5000, 10 * 60 * 1000)
  const { runId, clientId } = await readValidatedBody(event, presenceRequestSchema.parse)

  const run = await useDb()
    .select({ id: tables.runs.id, startedAt: tables.runs.startedAt, endsAt: tables.runs.endsAt, endedAt: tables.runs.endedAt })
    .from(tables.runs).where(eq(tables.runs.id, runId)).get()
  if (!run) throw createError({ statusCode: 404, message: 'Prüfung nicht gefunden' })

  const status = runStatus(run)
  if (status !== 'ended') touchPresence(run.id, clientId)
  return { status, signUntil: run.startedAt ? signDeadline(run) : null }
})
