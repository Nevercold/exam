import { eq } from 'drizzle-orm'

// Copies the draft to the released version. Only released exams can be started.
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const exam = await requireExamAccess(getRouterParam(event, 'id')!, me.id)
  if (exam.archivedAt) throw createError({ statusCode: 409, message: 'Archivierte Prüfungen können nicht freigegeben werden' })

  // Re-validate: stored drafts may predate schema changes
  const content = examContentSchema.parse(exam.draft)
  const row = await useDb().update(tables.exams)
    .set({ released: content, releasedAt: new Date() })
    .where(eq(tables.exams.id, exam.id))
    .returning().get()

  return { releasedAt: row.releasedAt, unreleasedChanges: false }
})
