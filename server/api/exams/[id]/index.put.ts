// Saves the draft. The released version (used for new runs) only changes via /release.
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const exam = await requireExamAccess(getRouterParam(event, 'id')!, me.id)
  if (exam.archivedAt) throw createError({ statusCode: 409, message: 'Archivierte Prüfungen können nicht geändert werden' })

  const content = await readValidatedBody(event, examContentSchema.parse)
  const row = await saveDraft(exam.id, content, 'editor')
  return {
    draftUpdatedAt: row.draftUpdatedAt,
    unreleasedChanges: hasUnreleasedChanges(row),
    warnings: examWarnings(row.draft),
  }
})
