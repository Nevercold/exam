import { z } from 'zod'

const bodySchema = z.object({
  // null = no timer, end manually
  durationMinutes: z.number().int().min(1, 'Mindestens 1 Minute').max(600, 'Maximal 600 Minuten').nullable(),
})

// Opens a run of the released version in the waiting state: students can join with the PIN but see
// nothing of the exam until the teacher starts it. The snapshot freezes content and solutions now.
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const exam = await requireExamAccess(getRouterParam(event, 'id')!, me.id)
  if (exam.archivedAt) throw createError({ statusCode: 409, message: 'Archivierte Prüfungen können nicht gestartet werden' })
  if (!exam.released) throw createError({ statusCode: 409, message: 'Bitte die Prüfung zuerst freigeben' })

  const { durationMinutes } = await readValidatedBody(event, bodySchema.parse)
  const run = await useDb().insert(tables.runs).values({
    examId: exam.id,
    startedBy: me.id,
    pin: await generatePin(),
    snapshot: examContentSchema.parse(exam.released),
    durationMinutes,
  }).returning().get()

  return toRunInfo(run)
})
