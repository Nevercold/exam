import { eq } from 'drizzle-orm'

/** Loads a run whose exam the teacher can access, or throws 404. */
export async function requireRunAccess(runId: string, userId: string) {
  const run = await useDb().select().from(tables.runs).where(eq(tables.runs.id, runId)).get()
  if (!run) throw createError({ statusCode: 404, message: 'Durchgang nicht gefunden' })
  const exam = await requireExamAccess(run.examId, userId).catch(() => null)
  if (!exam) throw createError({ statusCode: 404, message: 'Durchgang nicht gefunden' })
  return { run, exam }
}
