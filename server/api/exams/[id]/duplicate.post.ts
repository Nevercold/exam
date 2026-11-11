// Copies the draft into a new, unshared exam owned by the current teacher.
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const exam = await requireExamAccess(getRouterParam(event, 'id')!, me.id)

  const title = `${exam.draft.title} (Kopie)`.slice(0, LIMITS.title)
  const row = await createExam(me.id, { ...exam.draft, title }, 'editor')
  return { id: row.id }
})
