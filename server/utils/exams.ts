import { and, desc, eq, gt, isNull, or } from 'drizzle-orm'
import type { ExamRow, RunRow } from '../db/schema'

// Access rule: the owner and, if shared, every (active) teacher. Everyone with access sees the
// solution, may edit, copy and start runs. Archiving and sharing are owner-only.

export const hasExamAccess = (exam: Pick<ExamRow, 'ownerId' | 'sharedWithColleagues'>, userId: string) =>
  exam.ownerId === userId || exam.sharedWithColleagues

export const examAccessCondition = (userId: string) =>
  or(eq(tables.exams.ownerId, userId), eq(tables.exams.sharedWithColleagues, true))

/** Loads an exam the user may access, or throws 404 (no difference between "missing" and "forbidden"). */
export async function requireExamAccess(examId: string, userId: string): Promise<ExamRow> {
  const exam = await useDb().select().from(tables.exams)
    .where(and(eq(tables.exams.id, examId), examAccessCondition(userId)))
    .get()
  if (!exam) throw createError({ statusCode: 404, message: 'Prüfung nicht gefunden' })
  return exam
}

export async function requireExamOwner(examId: string, userId: string): Promise<ExamRow> {
  const exam = await requireExamAccess(examId, userId)
  if (exam.ownerId !== userId) throw createError({ statusCode: 403, message: 'Nur die Besitzerin oder der Besitzer kann das ändern' })
  return exam
}

/** Saves new draft content. `via: 'mcp'` marks AI changes, which always stay a draft until released. */
export async function saveDraft(examId: string, content: ExamContent, via: 'editor' | 'mcp') {
  return await useDb().update(tables.exams)
    .set({ draft: content, draftUpdatedAt: new Date(), draftUpdatedVia: via })
    .where(eq(tables.exams.id, examId))
    .returning().get()
}

export async function createExam(ownerId: string, content: ExamContent, via: 'editor' | 'mcp') {
  return await useDb().insert(tables.exams)
    .values({ ownerId, draft: content, draftUpdatedVia: via })
    .returning().get()
}

export function hasUnreleasedChanges(exam: Pick<ExamRow, 'draft' | 'released'>) {
  return !exam.released || canonicalJson(exam.draft) !== canonicalJson(exam.released)
}

/** List entry for the dashboard and MCP (no content). */
export function toExamSummary(exam: ExamRow, owner: { id: string, name: string }) {
  return {
    id: exam.id,
    title: exam.draft.title,
    template: exam.draft.template,
    owner,
    sharedWithColleagues: exam.sharedWithColleagues,
    released: exam.released !== null,
    releasedAt: exam.releasedAt,
    unreleasedChanges: hasUnreleasedChanges(exam),
    draftUpdatedAt: exam.draftUpdatedAt,
    draftUpdatedVia: exam.draftUpdatedVia,
    archived: exam.archivedAt !== null,
  }
}

export type ExamSummary = ReturnType<typeof toExamSummary>

// ---------- Runs ----------

export function isRunActive(run: Pick<RunRow, 'endedAt' | 'endsAt'>, now = new Date()) {
  return run.endedAt === null && (run.endsAt === null || run.endsAt > now)
}

/** When the run stopped accepting signatures (null while active without timer). */
export function runEnd(run: Pick<RunRow, 'endedAt' | 'endsAt'>): Date | null {
  if (run.endedAt && run.endsAt) return run.endedAt < run.endsAt ? run.endedAt : run.endsAt
  return run.endedAt ?? run.endsAt
}

const activeRunCondition = (now: Date) =>
  and(isNull(tables.runs.endedAt), or(isNull(tables.runs.endsAt), gt(tables.runs.endsAt, now)))

export async function findActiveRunByPin(pin: string, now = new Date()) {
  return await useDb().select().from(tables.runs)
    .where(and(eq(tables.runs.pin, pin), activeRunCondition(now)))
    .orderBy(desc(tables.runs.startedAt))
    .get() ?? null
}

/** Random 6-digit PIN that no active run uses. */
export async function generatePin(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const pin = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000))
    if (!await findActiveRunByPin(pin)) return pin
  }
  throw createError({ statusCode: 503, message: 'Keine freie PIN gefunden. Bitte erneut versuchen.' })
}

export function toRunInfo(run: RunRow, now = new Date()) {
  return {
    id: run.id,
    examId: run.examId,
    title: run.snapshot.title,
    pin: run.pin,
    startedAt: run.startedAt,
    endsAt: run.endsAt,
    endedAt: run.endedAt,
    active: isRunActive(run, now),
  }
}

export type RunInfo = ReturnType<typeof toRunInfo>
