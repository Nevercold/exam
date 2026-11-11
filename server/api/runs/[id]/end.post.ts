import { eq } from 'drizzle-orm'

// Ends a run now. From then on exports are unsigned.
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const { run } = await requireRunAccess(getRouterParam(event, 'id')!, me.id)
  if (!isRunActive(run)) return { ...toRunInfo(run), serverNow: new Date() }

  const row = await useDb().update(tables.runs).set({ endedAt: new Date() })
    .where(eq(tables.runs.id, run.id)).returning().get()
  return { ...toRunInfo(row), serverNow: new Date() }
})
