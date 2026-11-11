import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const exam = await requireExamAccess(getRouterParam(event, 'id')!, me.id)
  const owner = await useDb().select({ id: tables.users.id, name: tables.users.name })
    .from(tables.users).where(eq(tables.users.id, exam.ownerId)).get()

  return {
    ...toExamSummary(exam, owner!),
    isOwner: exam.ownerId === me.id,
    draft: exam.draft,
    warnings: examWarnings(exam.draft),
  }
})
