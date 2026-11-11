import { and, eq, isNull } from 'drizzle-orm'

// Starts a waiting run: from now on students see the exam, the timer runs and PDFs get signed.
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const { run } = await requireRunAccess(getRouterParam(event, 'id')!, me.id)
  const status = runStatus(run)
  if (status === 'ended') throw createError({ statusCode: 409, message: 'Der Durchgang ist bereits beendet' })
  if (status === 'running') return { ...toRunInfo(run), present: presenceCount(run.id), serverNow: new Date() }

  const startedAt = new Date()
  const endsAt = run.durationMinutes ? new Date(startedAt.getTime() + run.durationMinutes * 60_000) : null
  // Guard against a double click: only the first start wins
  const row = await useDb().update(tables.runs).set({ startedAt, endsAt })
    .where(and(eq(tables.runs.id, run.id), isNull(tables.runs.startedAt)))
    .returning().get()
    ?? await useDb().select().from(tables.runs).where(eq(tables.runs.id, run.id)).get()

  return { ...toRunInfo(row!), present: presenceCount(run.id), serverNow: new Date() }
})
