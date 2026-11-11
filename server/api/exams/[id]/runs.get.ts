import { desc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const exam = await requireExamAccess(getRouterParam(event, 'id')!, me.id)
  const rows = await useDb().select().from(tables.runs)
    .where(eq(tables.runs.examId, exam.id))
    .orderBy(desc(tables.runs.createdAt))
    .limit(100)
    .all()
  const now = new Date()
  return rows.map(r => toRunInfo(r, now))
})
