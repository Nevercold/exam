import { eq } from 'drizzle-orm'

// Teacher: sets the maximum points of a run afterwards (e.g. forgotten before the run). Only the run's snapshot
// changes, not the exam; points aren't part of the signed hash, so existing PDFs stay valid. Verify and AI
// grading read the points from the snapshot.
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const { run } = await requireRunAccess(getRouterParam(event, 'id')!, me.id)
  const { points } = await readValidatedBody(event, runPointsSchema.parse)

  const row = await useDb().update(tables.runs).set({ snapshot: withPoints(run.snapshot, points) })
    .where(eq(tables.runs.id, run.id)).returning().get()
  return toRunPointsView(row)
})
