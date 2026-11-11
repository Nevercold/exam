import { z } from 'zod'

// Exam content model: an exam is a list of blocks. Used by the editor, the API, the MCP server,
// the student view (via toStudentContent) and the PDF.

export const BLOCK_TYPES = ['text', 'table', 'schema-answer', 'freetext'] as const

export const EXAM_TEMPLATES = ['blank', 'normalization'] as const

export const LIMITS = {
  title: 200,
  markdown: 20_000,
  label: 200,
  cell: 500,
  columns: 30,
  rows: 50,
  tables: 20,
  blocks: 100,
  freetext: 20_000,
}

const blockId = z.string().trim().min(1).max(40)
const cell = z.string().max(LIMITS.cell, `Maximal ${LIMITS.cell} Zeichen pro Zelle`)
const label = z.string().trim().max(LIMITS.label)

const rowsMatchColumns = (t: { columns: unknown[], rows: unknown[][] }) => t.rows.every(r => r.length === t.columns.length)
const rowsMatchColumnsError = { message: 'Jede Zeile braucht genau eine Zelle pro Spalte' }

/** A table given in the task (e.g. the unnormalized table). Columns are plain names. */
export const givenTableSchema = z.object({
  columns: z.array(cell).min(1, 'Mindestens eine Spalte').max(LIMITS.columns),
  rows: z.array(z.array(cell)).max(LIMITS.rows),
}).refine(rowsMatchColumns, rowsMatchColumnsError)

export const schemaColumnSchema = z.object({
  name: z.string().max(100),
  pk: z.boolean().default(false),
  fk: z.object({ table: z.string().max(100), column: z.string().max(100) }).nullable().default(null),
})

/** A relational table as built by students (and in solutions): name, keys, data. */
export const schemaTableSchema = z.object({
  name: z.string().max(100),
  columns: z.array(schemaColumnSchema).max(LIMITS.columns),
  rows: z.array(z.array(cell)).max(LIMITS.rows),
}).refine(rowsMatchColumns, rowsMatchColumnsError)

export const schemaTablesSchema = z.array(schemaTableSchema).max(LIMITS.tables)

export const textBlockSchema = z.object({
  id: blockId,
  type: z.literal('text'),
  markdown: z.string().max(LIMITS.markdown),
})

export const tableBlockSchema = z.object({
  id: blockId,
  type: z.literal('table'),
  caption: label.default(''),
  table: givenTableSchema,
})

export const schemaAnswerBlockSchema = z.object({
  id: blockId,
  type: z.literal('schema-answer'),
  label: label.default(''),
  // Offers "Tabellen aus vorherigem Schritt übernehmen" from this earlier schema-answer block
  copyFrom: blockId.nullable().default(null),
  solution: schemaTablesSchema.nullable().default(null),
})

export const freetextBlockSchema = z.object({
  id: blockId,
  type: z.literal('freetext'),
  label: label.default(''),
  maxLength: z.number().int().min(10).max(LIMITS.freetext).nullable().default(null),
  solution: z.string().max(LIMITS.freetext).nullable().default(null),
})

export const blockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  tableBlockSchema,
  schemaAnswerBlockSchema,
  freetextBlockSchema,
])

export const examContentSchema = z.object({
  title: z.string().trim().min(1, 'Titel fehlt').max(LIMITS.title),
  template: z.enum(EXAM_TEMPLATES).default('blank'),
  blocks: z.array(blockSchema).max(LIMITS.blocks),
}).superRefine((content, ctx) => {
  const seen = new Map<string, number>()
  content.blocks.forEach((b, i) => {
    if (seen.has(b.id)) ctx.addIssue({ code: 'custom', path: ['blocks', i, 'id'], message: `Block-ID "${b.id}" ist doppelt` })
    if (b.type === 'schema-answer' && b.copyFrom !== null) {
      const source = seen.get(b.copyFrom)
      if (source === undefined || content.blocks[source]?.type !== 'schema-answer') {
        ctx.addIssue({ code: 'custom', path: ['blocks', i, 'copyFrom'], message: 'Kann nur von einem früheren Tabellen-Antwortblock übernehmen' })
      }
    }
    seen.set(b.id, i)
  })
})

export type Block = z.output<typeof blockSchema>
export type BlockType = Block['type']
export type ExamContent = z.output<typeof examContentSchema>
export type ExamContentInput = z.input<typeof examContentSchema>
export type GivenTable = z.output<typeof givenTableSchema>
export type SchemaColumn = z.output<typeof schemaColumnSchema>
export type SchemaTable = z.output<typeof schemaTableSchema>

// ---------- Student view: content without solutions ----------

// Explicit allow-lists: a new solution field never leaks by accident.
const studentBlockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  tableBlockSchema,
  schemaAnswerBlockSchema.pick({ id: true, type: true, label: true, copyFrom: true }),
  freetextBlockSchema.pick({ id: true, type: true, label: true, maxLength: true }),
])

export const studentContentSchema = z.object({
  title: z.string(),
  blocks: z.array(studentBlockSchema),
})

export type StudentBlock = z.output<typeof studentBlockSchema>
export type StudentContent = z.output<typeof studentContentSchema>

/** Strips solutions (and anything else not explicitly allowed). The only way content reaches students. */
export function toStudentContent(content: ExamContent): StudentContent {
  return studentContentSchema.parse({ title: content.title, blocks: content.blocks })
}

// ---------- Answers ----------

export const answerSchemas = {
  'schema-answer': schemaTablesSchema,
  'freetext': z.string().max(LIMITS.freetext),
} as const

export type AnswerBlockType = keyof typeof answerSchemas
export type Answers = Record<string, SchemaTable[] | string>

export const isAnswerBlock = (b: { type: string }): b is { type: AnswerBlockType } => b.type in answerSchemas

/** Validates answers against the exam's answer blocks; unknown or invalid entries are dropped. */
export function sanitizeAnswers(blocks: StudentBlock[], raw: unknown): Answers {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const result: Answers = {}
  for (const b of blocks) {
    if (!isAnswerBlock(b) || !(b.id in input)) continue
    const parsed = answerSchemas[b.type].safeParse(input[b.id])
    if (parsed.success) result[b.id] = parsed.data
  }
  return result
}

// ---------- Helpers ----------

export function newBlockId(existing: { id: string }[]): string {
  const ids = new Set(existing.map(b => b.id))
  for (let n = existing.length + 1; ; n++) if (!ids.has(`b${n}`)) return `b${n}`
}

export function emptyBlock(type: BlockType, id: string): Block {
  switch (type) {
    case 'text': return { id, type, markdown: '' }
    case 'table': return { id, type, caption: '', table: { columns: ['Spalte 1'], rows: [['']] } }
    case 'schema-answer': return { id, type, label: '', copyFrom: null, solution: null }
    case 'freetext': return { id, type, label: '', maxLength: null, solution: null }
  }
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  'text': 'Text',
  'table': 'Vorgegebene Tabelle',
  'schema-answer': 'Antwort: Tabellen',
  'freetext': 'Antwort: Freitext',
}

/** Starting content for a new exam. The normalization template follows LF 8.2 (1NF → 2NF → 3NF). */
export function templateContent(template: (typeof EXAM_TEMPLATES)[number], title = 'Neue Prüfung'): ExamContent {
  if (template === 'blank') {
    return { title, template, blocks: [{ id: 'b1', type: 'text', markdown: '' }] }
  }
  const steps = [
    ['1NF', 'Bringe die Tabelle in die **1. Normalform**: Jedes Attribut ist atomar, keine Wiederholungsgruppen.'],
    ['2NF', 'Bringe die Tabellen in die **2. Normalform**: Jedes Nicht-Schlüssel-Attribut hängt vom gesamten Primärschlüssel ab.'],
    ['3NF', 'Bringe die Tabellen in die **3. Normalform**: keine transitiven Abhängigkeiten.'],
  ] as const
  const blocks: Block[] = [
    {
      id: 'intro',
      type: 'text',
      markdown: '## Szenario\n\nBeschreibe hier das Szenario.\n\nGib in jedem Schritt **alle** Tabellen mit Namen, Spalten und vollständigen Datenzeilen an, auch wenn sie sich nicht ändern. Kennzeichne Primär- (PK) und Fremdschlüssel (FK) und begründe kurz, welches Problem der Schritt behebt bzw. warum keine Änderung nötig ist.',
    },
    { id: 'given', type: 'table', caption: 'Unnormalisierte Tabelle', table: { columns: ['Spalte 1'], rows: [['']] } },
  ]
  steps.forEach(([nf, text], i) => {
    const key = nf.toLowerCase()
    blocks.push(
      { id: `${key}-task`, type: 'text', markdown: `## ${nf}\n\n${text}` },
      { id: `${key}-tables`, type: 'schema-answer', label: `Tabellen in ${nf}`, copyFrom: i === 0 ? null : `${steps[i - 1]![0].toLowerCase()}-tables`, solution: null },
      { id: `${key}-reason`, type: 'freetext', label: `Begründung ${nf}`, maxLength: null, solution: null },
    )
  })
  return { title, template, blocks }
}

export type ExamWarning = { blockId?: string, message: string }

/** Editor/MCP warnings that don't block saving but should be fixed before release. */
export function examWarnings(content: ExamContent): ExamWarning[] {
  const warnings: ExamWarning[] = []
  for (const b of content.blocks) {
    if (isAnswerBlock(b) && (b as { solution: unknown }).solution === null) {
      warnings.push({ blockId: b.id, message: `Antwortblock "${(b as { label: string }).label || b.id}" hat keine Musterlösung` })
    }
  }
  if (!content.blocks.some(isAnswerBlock)) warnings.push({ message: 'Die Prüfung hat keinen Antwortblock' })

  if (content.template === 'normalization') {
    const given = content.blocks.find(b => b.type === 'table')
    if (!given) {
      warnings.push({ message: 'Die unnormalisierte Ausgangstabelle fehlt' })
    }
    else {
      const { columns, rows } = given.table
      if (columns.length < 8) warnings.push({ blockId: given.id, message: `Ausgangstabelle hat ${columns.length} Spalten (mindestens 8)` })
      if (rows.length < 3 || rows.length > 5) warnings.push({ blockId: given.id, message: `Ausgangstabelle hat ${rows.length} Datenzeilen (3–5)` })
    }
  }
  return warnings
}
