import { describe, expect, it } from 'vitest'
import { breakable, buildDocDefinition, columnParts, MAX_COLUMNS_PER_PART, pdfFilename, ZERO_WIDTH_SPACE } from '../app/utils/pdf'
import { examContentSchema, toStudentContent } from '../shared/utils/exam'
import type { SignedEnvelope, Submission } from '../shared/utils/submission'

const content = toStudentContent(examContentSchema.parse({
  title: 'Werkstatt',
  blocks: [
    { id: 'intro', type: 'text', markdown: 'Aufgabe' },
    { id: 's', type: 'schema-answer', label: 'Tabellen in 1NF', solution: [{ name: 'GEHEIM', columns: [], rows: [] }] },
    { id: 'f', type: 'freetext', label: 'Begründung', solution: 'GEHEIM' },
  ],
}))

const submission: Submission = {
  v: 1,
  runId: 'r1',
  examTitle: 'Werkstatt',
  name: 'Kim Müller',
  answers: { s: [{ name: 'Auftrag', columns: [{ name: 'AuftragNr', pk: true, fk: null }, { name: 'KundeNr', pk: false, fk: { table: 'Kunde', column: 'KundeNr' } }], rows: [['A1', 'K1']] }], f: 'Wiederholungsgruppe aufgelöst' },
  exportedAt: '2026-11-11T08:00:00.000Z',
}

const envelope: SignedEnvelope = {
  payload: { v: 1, runId: 'r1', hash: 'a'.repeat(64), signedAt: '2026-11-11T08:00:00.000Z', kid: 'k1' },
  signature: 'sig',
}

describe('buildDocDefinition', () => {
  it('contains name, answers and keys, but no solutions', () => {
    const json = JSON.stringify(buildDocDefinition({ content, submission, envelope, hash: 'a'.repeat(64) }))
    for (const text of ['Kim Müller', 'Werkstatt', 'Tabellen in 1NF', 'Auftrag', 'AuftragNr', 'FK: Kunde.KundeNr', 'Wiederholungsgruppe aufgelöst', 'AAAA-AAAA-AAAA']) {
      expect(json).toContain(text)
    }
    expect(json).not.toContain('GEHEIM')
    expect(json).not.toContain('NICHT SIGNIERT')
  })

  it('marks unsigned exports on every page', () => {
    const doc = buildDocDefinition({ content, submission, envelope: null, hash: 'a'.repeat(64) })
    expect(JSON.stringify(doc.watermark)).toContain('NICHT SIGNIERT')
    expect(JSON.stringify(doc.content)).toContain('NICHT SIGNIERT')
  })
})

describe('relational model in the PDF', () => {
  const tables = [
    { name: 'Kunde', columns: [{ name: 'KundeNr', pk: true, fk: null }], rows: [['K1']] },
    { name: 'Auftrag', columns: [{ name: 'AuftragNr', pk: true, fk: null }, { name: 'KundeNr', pk: false, fk: { table: 'Kunde', column: 'KundeNr', cardinality: '1:n' as const } }], rows: [['A1', 'K1']] },
  ]
  const build = (askCardinality: boolean) => JSON.stringify(buildDocDefinition({
    content: toStudentContent(examContentSchema.parse({ title: 'T', blocks: [{ id: 's', type: 'schema-answer', askCardinality }] })),
    submission: { ...submission, answers: { s: tables } },
    envelope,
    hash: 'a'.repeat(64),
  }))

  it('adds diagram and relationship list when cardinalities are asked', () => {
    const json = build(true)
    expect(json).toContain('<svg')
    expect(json).toContain('Kunde 1 : n Auftrag (über Auftrag.KundeNr)')
  })

  it('stays as before otherwise', () => {
    expect(build(false)).not.toContain('<svg')
  })
})

describe('long content in the PDF', () => {
  it('gives long words invisible break points, short words stay untouched', () => {
    expect(breakable('Kunde Ort')).toBe('Kunde Ort')
    const long = 'Donaudampfschifffahrtsgesellschaft'
    const out = breakable(long)
    expect(out).not.toBe(long)
    expect(out.replaceAll(ZERO_WIDTH_SPACE, '')).toBe(long)
    expect(out.split(ZERO_WIDTH_SPACE).every(part => part.length <= 12)).toBe(true)
  })

  it('splits very wide tables into parts that repeat the primary key', () => {
    const cols = (n: number, pks: number[]) => Array.from({ length: n }, (_, i) => ({ pk: pks.includes(i) }))
    expect(columnParts(cols(8, [0]))).toEqual([[0, 1, 2, 3, 4, 5, 6, 7]])
    const parts = columnParts(cols(30, [0, 1]))
    expect(parts.every(p => p.length <= MAX_COLUMNS_PER_PART && p[0] === 0 && p[1] === 1)).toBe(true)
    expect(new Set(parts.flat()).size).toBe(30)
  })

  it('keeps every cell of a 30-column table', () => {
    const wide = { name: 'Breit', columns: Array.from({ length: 30 }, (_, i) => ({ name: `S${i}`, pk: i === 0, fk: null })), rows: [Array.from({ length: 30 }, (_, i) => `W${i}`)] }
    const json = JSON.stringify(buildDocDefinition({ content, submission: { ...submission, answers: { s: [wide] } }, envelope, hash: 'a'.repeat(64) }))
    for (let i = 0; i < 30; i++) expect(json).toContain(`"W${i}"`)
    expect(json).toContain('Breit (Teil 1 von 3, 30 Spalten)')
  })
})

describe('pdfFilename', () => {
  it('is safe for uploads', () => {
    expect(pdfFilename('Normalisierung: Werkstatt', 'Jörg Groß')).toBe('Normalisierung_Werkstatt_Joerg_Gross.pdf')
    expect(pdfFilename('', '')).toBe('Pruefung_Abgabe.pdf')
  })
})
