import { eq } from 'drizzle-orm'
import type { RunRow } from '../db/schema'

/** Loads a run whose exam the teacher can access, or throws 404. */
export async function requireRunAccess(runId: string, userId: string) {
  const run = await useDb().select().from(tables.runs).where(eq(tables.runs.id, runId)).get()
  if (!run) throw createError({ statusCode: 404, message: 'Durchgang nicht gefunden' })
  const exam = await requireExamAccess(run.examId, userId).catch(() => null)
  if (!exam) throw createError({ statusCode: 404, message: 'Durchgang nicht gefunden' })
  return { run, exam }
}

/** Answer blocks of a run with their maximum points (no solutions). */
export function toRunPointsView(run: Pick<RunRow, 'snapshot'>) {
  return {
    title: run.snapshot.title,
    blocks: run.snapshot.blocks.flatMap(b => (b.type === 'schema-answer' || b.type === 'freetext')
      ? [{ id: b.id, label: b.label || b.id, points: b.points ?? null }]
      : []),
  }
}

export type RunPointsView = ReturnType<typeof toRunPointsView>
