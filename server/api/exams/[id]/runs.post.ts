import { z } from 'zod'

const bodySchema = z.object({
  // null = no timer, end manually
  durationMinutes: z.number().int().min(1, 'Mindestens 1 Minute').max(600, 'Maximal 600 Minuten').nullable(),
})

// Starts a run of the released version. The snapshot freezes content and solutions.
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const exam = await requireExamAccess(getRouterParam(event, 'id')!, me.id)
  if (exam.archivedAt) throw createError({ statusCode: 409, message: 'Archivierte Prüfungen können nicht gestartet werden' })
  if (!exam.released) throw createError({ statusCode: 409, message: 'Bitte die Prüfung zuerst freigeben' })

  const { durationMinutes } = await readValidatedBody(event, bodySchema.parse)
  const startedAt = new Date()
  const run = await useDb().insert(tables.runs).values({
    examId: exam.id,
    startedBy: me.id,
    pin: await generatePin(),
    snapshot: examContentSchema.parse(exam.released),
    startedAt,
    endsAt: durationMinutes ? new Date(startedAt.getTime() + durationMinutes * 60_000) : null,
  }).returning().get()

  return toRunInfo(run)
})
