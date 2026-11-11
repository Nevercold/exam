import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  sharedWithColleagues: z.boolean().optional(),
  archived: z.boolean().optional(),
})

// Owner-only settings: sharing and archiving.
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const exam = await requireExamOwner(getRouterParam(event, 'id')!, me.id)
  const { sharedWithColleagues, archived } = await readValidatedBody(event, bodySchema.parse)

  const row = await useDb().update(tables.exams)
    .set({
      ...(sharedWithColleagues !== undefined && { sharedWithColleagues }),
      ...(archived !== undefined && { archivedAt: archived ? new Date() : null }),
    })
    .where(eq(tables.exams.id, exam.id))
    .returning().get()

  return { sharedWithColleagues: row.sharedWithColleagues, archived: row.archivedAt !== null }
})
