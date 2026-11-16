import { describe, expect, it } from 'vitest'
import { examContentSchema, examWarnings, runPointsSchema, sanitizeAnswers, templateContent, toStudentContent, withPoints, type ExamContent } from '../shared/utils/exam'

const solutionTable = { name: 'Kunde', columns: [{ name: 'KundenNr', pk: true, fk: null }], rows: [['K1']] }

function exam(): ExamContent {
  return examContentSchema.parse({
    title: 'Test',
    blocks: [
      { id: 'a', type: 'text', markdown: 'Aufgabe' },
      { id: 'g', type: 'table', table: { columns: ['A', 'B'], rows: [['1', '2']] } },
      { id: 's1', type: 'schema-answer', label: '1NF', solution: [solutionTable] },
      { id: 's2', type: 'schema-answer', label: '2NF', copyFrom: 's1', solution: [solutionTable] },
      { id: 'f', type: 'freetext', label: 'Begründung', solution: 'GEHEIME BEGRÜNDUNG' },
    ],
  })
}

describe('toStudentContent', () => {
  it('never contains solutions', () => {
    const student = toStudentContent(exam())
    const json = JSON.stringify(student)
    expect(json).not.toContain('solution')
    expect(json).not.toContain('GEHEIME')
    expect(json).not.toContain('KundenNr')
    expect(student.blocks).toHaveLength(5)
  })

  it('drops unknown fields, even if they slipped into stored content', () => {
    const content = exam()
    ;(content.blocks[2] as Record<string, unknown>).secret = 'x'
    ;(content as Record<string, unknown>).template = 'normalization'
    const json = JSON.stringify(toStudentContent(content))
    expect(json).not.toContain('secret')
    expect(json).not.toContain('normalization')
  })

  it('strips solutions from the normalization template', () => {
    const content = templateContent('normalization')
    for (const b of content.blocks) if ('solution' in b) b.solution = b.type === 'freetext' ? 'X-SOL' : []
    expect(JSON.stringify(toStudentContent(content))).not.toContain('solution')
  })
})

describe('examContentSchema', () => {
  it('rejects duplicate block ids', () => {
    const r = examContentSchema.safeParse({ title: 'T', blocks: [{ id: 'x', type: 'text', markdown: '' }, { id: 'x', type: 'text', markdown: '' }] })
    expect(r.success).toBe(false)
  })

  it('accepts copyFrom only from an earlier schema-answer block', () => {
    const base = { title: 'T', blocks: [{ id: 't', type: 'text', markdown: '' }] }
    expect(examContentSchema.safeParse({ ...base, blocks: [...base.blocks, { id: 's', type: 'schema-answer', copyFrom: 't' }] }).success).toBe(false)
    expect(examContentSchema.safeParse({ ...base, blocks: [...base.blocks, { id: 's', type: 'schema-answer', copyFrom: 'later' }, { id: 'later', type: 'schema-answer' }] }).success).toBe(false)
    expect(examContentSchema.safeParse({ ...base, blocks: [{ id: 'a', type: 'schema-answer' }, { id: 'b', type: 'schema-answer', copyFrom: 'a' }] }).success).toBe(true)
  })

  it('rejects rows that do not match the columns', () => {
    const r = examContentSchema.safeParse({ title: 'T', blocks: [{ id: 'g', type: 'table', table: { columns: ['A', 'B'], rows: [['1']] } }] })
    expect(r.success).toBe(false)
  })

  it('accepts both templates', () => {
    expect(examContentSchema.safeParse(templateContent('blank')).success).toBe(true)
    expect(examContentSchema.safeParse(templateContent('normalization')).success).toBe(true)
  })
})

describe('examWarnings', () => {
  it('flags missing solutions and the normalization table rules', () => {
    const messages = examWarnings(templateContent('normalization')).map(w => w.message)
    expect(messages.filter(m => m.includes('keine Musterlösung'))).toHaveLength(6)
    expect(messages.some(m => m.includes('mindestens 8'))).toBe(true)
    expect(messages.some(m => m.includes('3–5'))).toBe(true)
  })

  it('is quiet for a complete exam', () => {
    expect(examWarnings(exam())).toEqual([])
  })
})

describe('sanitizeAnswers', () => {
  it('keeps only valid answers to answer blocks', () => {
    const blocks = toStudentContent(exam()).blocks
    const answers = sanitizeAnswers(blocks, {
      s1: [solutionTable],
      s2: 'not tables',
      f: 'Text',
      a: 'answer to a text block',
      unknown: 'x',
    })
    expect(Object.keys(answers).sort()).toEqual(['f', 's1'])
  })
})

describe('withPoints', () => {
  it('sets and removes points on answer blocks only', () => {
    const content = withPoints(exam(), { s1: 4, f: 2.5, a: 3, unknown: 1 })
    const byId = Object.fromEntries(content.blocks.map(b => [b.id, b]))
    expect(byId.s1).toMatchObject({ points: 4, solution: [solutionTable] })
    expect(byId.f).toMatchObject({ points: 2.5 })
    expect(byId.s2).not.toHaveProperty('points')
    expect(byId.a).not.toHaveProperty('points')

    const removed = withPoints(content, { s1: null })
    // No leftover key: same JSON as a block that never had points
    expect(JSON.stringify(removed.blocks[2])).toBe(JSON.stringify(exam().blocks[2]))
    expect(removed.blocks[4]).toMatchObject({ points: 2.5 })
  })

  it('validates like the editor', () => {
    expect(runPointsSchema.safeParse({ points: { s1: 2.5, f: null } }).success).toBe(true)
    expect(runPointsSchema.safeParse({ points: { s1: 0 } }).success).toBe(false)
    expect(runPointsSchema.safeParse({ points: { s1: 1.3 } }).success).toBe(false)
    expect(runPointsSchema.safeParse({ points: { s1: 101 } }).success).toBe(false)
  })
})
