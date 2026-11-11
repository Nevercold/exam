import { eq } from 'drizzle-orm'

// Public: signs the hash of a submission while its run is active. Receives no names or answers.
export default defineEventHandler(async (event) => {
  // Generous: a class exports several times. Limits abuse, not normal use behind one school IP.
  rateLimit(event, 'sign', 600, 10 * 60 * 1000)
  const { runId, hash } = await readValidatedBody(event, signRequestSchema.parse)

  const run = await useDb().select({ id: tables.runs.id, endsAt: tables.runs.endsAt, endedAt: tables.runs.endedAt })
    .from(tables.runs).where(eq(tables.runs.id, runId)).get()
  if (!run) throw createError({ statusCode: 404, message: 'Prüfung nicht gefunden' })
  if (!isRunActive(run)) {
    throw createError({ statusCode: 409, message: 'Die Prüfung ist beendet. Das PDF wird ohne Signatur erstellt.' })
  }

  return signPayload({ v: SUBMISSION_VERSION, runId: run.id, hash, signedAt: new Date().toISOString() })
})
