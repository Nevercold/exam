import { describe, expect, it } from 'vitest'
import { buildDocDefinition, pdfFilename } from '../app/utils/pdf'
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

describe('pdfFilename', () => {
  it('is safe for uploads', () => {
    expect(pdfFilename('Normalisierung: Werkstatt', 'Jörg Groß')).toBe('Normalisierung_Werkstatt_Joerg_Gross.pdf')
    expect(pdfFilename('', '')).toBe('Pruefung_Abgabe.pdf')
  })
})
