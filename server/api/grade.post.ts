import { eq } from 'drizzle-orm'

// Teacher: AI grading suggestion for one submission. The verification page sends the answers from the PDF
// (never the name); the solution comes from the run snapshot. Nothing is stored or logged.
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  rateLimit(event, 'grade', 200, 10 * 60_000)
  const config = aiConfig()
  if (!config) throw createError({ statusCode: 404, message: 'KI-Bewertung ist auf diesem Server nicht eingerichtet' })

  const { runId, answers } = await readValidatedBody(event, gradeRequestSchema.parse)
  const run = await useDb().select().from(tables.runs).where(eq(tables.runs.id, runId)).get()
  if (!run) throw createError({ statusCode: 404, message: 'Durchgang nicht gefunden' })
  await requireExamAccess(run.examId, me.id)

  // Snapshots may predate schema changes
  const content = examContentSchema.parse(run.snapshot)
  const clean = sanitizeAnswers(toStudentContent(content).blocks, answers)
  const reply = await chatCompletion(config, buildGradingMessages(content, clean), GRADING_JSON_SCHEMA)
  try {
    return parseGradingReply(reply, content, config.model)
  }
  catch {
    throw createError({ statusCode: 502, message: 'Die Antwort der KI war nicht auswertbar, bitte nochmal versuchen' })
  }
})
