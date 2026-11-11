import { eq } from 'drizzle-orm'

// Teacher: checks a signature. The browser sends only the signed payload (hash, run, time),
// never the student's name or answers; it compares the hash with the PDF content itself.
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const envelope = await readValidatedBody(event, signedEnvelopeSchema.parse)

  const validSignature = verifyEnvelope(envelope)
  const run = await useDb().select().from(tables.runs).where(eq(tables.runs.id, envelope.payload.runId)).get()
  const exam = run ? await useDb().select().from(tables.exams).where(eq(tables.exams.id, run.examId)).get() : undefined
  const access = !!exam && hasExamAccess(exam, me.id)

  const signedAt = new Date(envelope.payload.signedAt)
  const end = run ? runEnd(run) : null
  const withinRun = !!run && signedAt >= run.startedAt && (end === null || signedAt <= end)

  return {
    validSignature,
    runFound: !!run,
    withinRun,
    run: run ? { id: run.id, title: run.snapshot.title, startedAt: run.startedAt, endsAt: run.endsAt, endedAt: run.endedAt } : null,
    // Solutions only for teachers with access to the exam
    access,
    snapshot: access && run ? run.snapshot : null,
  }
})
