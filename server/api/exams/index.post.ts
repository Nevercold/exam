import { z } from 'zod'

const bodySchema = z.object({
  title: z.string().trim().min(1, 'Titel fehlt').max(LIMITS.title),
  template: z.enum(EXAM_TEMPLATES).default('blank'),
})

export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const { title, template } = await readValidatedBody(event, bodySchema.parse)
  const row = await createExam(me.id, templateContent(template, title), 'editor')
  return { id: row.id }
})
