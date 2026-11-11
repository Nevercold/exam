import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { PublicUser } from '../utils/auth'
import { examSchemaGuide } from './schema-guide'

const INSTRUCTIONS = `exam lets teachers create exams; students answer in the browser and export a signed PDF.
You act on behalf of one teacher. You can read and change all exams the teacher has access to (own and shared).
Everything you create or change is saved as a draft ("Entwurf"): the teacher reviews and releases it in the
editor before it can be used. Read the resource exam://schema before writing exam content.
Write exam content in German.`

const examIdArg = z.string().describe('Exam id (from list_exams / create_exam)')
const contentArg = z.unknown().describe('Complete ExamContent object, see resource exam://schema')

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function fail(err: unknown): CallToolResult {
  const text = err instanceof z.ZodError
    ? `Ungültige Daten:\n${z.prettifyError(err)}`
    : (err as { message?: string })?.message || 'Unbekannter Fehler'
  return { isError: true, content: [{ type: 'text', text }] }
}

/** Wraps a handler so thrown errors (403, 404, validation …) become readable tool errors. */
function tool<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return ok(await fn(args))
    }
    catch (err) {
      return fail(err)
    }
  }
}

/** Builds a server bound to one teacher. Stateless: one instance per HTTP request. */
export function createExamMcpServer(user: PublicUser, origin: string) {
  const server = new McpServer(
    { name: 'exam', version: '1.0.0' },
    { instructions: INSTRUCTIONS },
  )
  const editorUrl = (id: string) => `${origin}/exams/${id}`

  async function draftResult(examId: string) {
    const exam = await requireExamAccess(examId, user.id)
    return {
      id: exam.id,
      editorUrl: editorUrl(exam.id),
      note: 'Saved as draft. The teacher must review and release it in the editor.',
      warnings: examWarnings(exam.draft),
    }
  }

  server.registerResource('exam-schema', 'exam://schema', {
    title: 'Aufbau einer Prüfung',
    description: 'JSON structure of exam content and conventions for normalization exams',
    mimeType: 'text/markdown',
  }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: examSchemaGuide }] }))

  // --- read ---

  server.registerTool('list_exams', {
    title: 'Prüfungen auflisten',
    description: 'Lists exams the teacher has access to (own and shared by colleagues). Optional title search.',
    inputSchema: {
      search: z.string().max(100).optional().describe('Case-insensitive search in the title'),
      includeArchived: z.boolean().default(false),
    },
    annotations: { readOnlyHint: true },
  }, tool(async ({ search, includeArchived }) => {
    const term = search?.trim().toLowerCase()
    const rows = await useDb()
      .select({ exam: tables.exams, owner: { id: tables.users.id, name: tables.users.name } })
      .from(tables.exams)
      .innerJoin(tables.users, eq(tables.users.id, tables.exams.ownerId))
      .where(and(examAccessCondition(user.id), includeArchived ? undefined : isNull(tables.exams.archivedAt)))
      .orderBy(desc(tables.exams.draftUpdatedAt))
      .all()
    return rows
      .filter(r => !term || r.exam.draft.title.toLowerCase().includes(term))
      .map(r => ({ ...toExamSummary(r.exam, r.owner), isOwner: r.exam.ownerId === user.id }))
  }))

  server.registerTool('get_exam', {
    title: 'Prüfung lesen',
    description: 'Returns the draft content of an exam (including solutions) and editor warnings.',
    inputSchema: { examId: examIdArg },
    annotations: { readOnlyHint: true },
  }, tool(async ({ examId }) => {
    const exam = await requireExamAccess(examId, user.id)
    return {
      id: exam.id,
      editorUrl: editorUrl(exam.id),
      released: exam.released !== null,
      unreleasedChanges: hasUnreleasedChanges(exam),
      warnings: examWarnings(exam.draft),
      content: exam.draft,
    }
  }))

  server.registerTool('validate_exam', {
    title: 'Prüfung prüfen',
    description: 'Validates exam content without saving. Returns errors (would be rejected) and warnings.',
    inputSchema: { content: contentArg },
    annotations: { readOnlyHint: true },
  }, tool(async ({ content }) => {
    const parsed = examContentSchema.safeParse(content)
    if (!parsed.success) return { valid: false, errors: z.prettifyError(parsed.error) }
    return { valid: true, warnings: examWarnings(parsed.data) }
  }))

  // --- create / change (always saved as draft) ---

  server.registerTool('create_exam', {
    title: 'Prüfung erstellen',
    description: 'Creates a new exam as draft. Either pass complete `content`, or a `template` (+ title) to start '
      + 'from ("normalization" creates the 1NF/2NF/3NF structure). Returns id and editor URL.',
    inputSchema: {
      title: z.string().min(1).max(200).optional(),
      template: z.enum(EXAM_TEMPLATES).optional(),
      content: contentArg.optional(),
    },
  }, tool(async ({ title, template, content }) => {
    const parsed = content !== undefined
      ? examContentSchema.parse(content)
      : templateContent(template ?? 'blank', title)
    const row = await createExam(user.id, parsed, 'mcp')
    return await draftResult(row.id)
  }))

  server.registerTool('update_exam', {
    title: 'Prüfung ändern',
    description: 'Replaces the draft content of an exam (read it with get_exam first, change it, send it back '
      + 'complete). The released version stays unchanged until the teacher releases the draft.',
    inputSchema: { examId: examIdArg, content: contentArg },
  }, tool(async ({ examId, content }) => {
    const exam = await requireExamAccess(examId, user.id)
    if (exam.archivedAt) throw createError({ statusCode: 409, message: 'Archivierte Prüfungen können nicht geändert werden' })
    await saveDraft(exam.id, examContentSchema.parse(content), 'mcp')
    return await draftResult(exam.id)
  }))

  return server
}
