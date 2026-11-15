import { describe, expect, it } from 'vitest'
import { buildDocDefinition } from '../app/utils/pdf'
import { UI_TEXT } from '../app/utils/ui-text'
import { examContentSchema, examWarnings, isRtl, languageName, pointsLabel, toStudentContent } from '../shared/utils/exam'
import { schemaHints } from '../shared/utils/hints'
import { relationships, relationshipText } from '../shared/utils/relations'
import { canonicalJson, embeddedSubmissionSchema, hashSubmission, type Submission } from '../shared/utils/submission'

const base = {
  title: 'Normalisierung',
  blocks: [
    { id: 'intro', type: 'text', markdown: 'Normalisiere die Tabelle.' },
    { id: 'given', type: 'table', caption: 'Ausgangstabelle', table: { columns: ['A'], rows: [['1']] } },
    { id: 's', type: 'schema-answer', label: 'Tabellen in 1NF', points: 4, solution: [{ name: 'GEHEIM', columns: [], rows: [] }] },
    { id: 'f', type: 'freetext', label: 'Begründung', solution: 'GEHEIME BEGRÜNDUNG' },
  ],
}

describe('translations in the exam model', () => {
  it('are optional: exams without them parse unchanged', () => {
    const parsed = examContentSchema.parse(base)
    expect(parsed).not.toHaveProperty('translations')
    expect(toStudentContent(parsed)).not.toHaveProperty('translations')
  })

  it('accept any BCP 47 code except German', () => {
    const withLang = (code: string) => examContentSchema.safeParse({ ...base, translations: { [code]: { title: 'x', blocks: {} } } }).success
    expect(withLang('uk')).toBe(true)
    expect(withLang('pt-BR')).toBe(true)
    expect(withLang('ckb')).toBe(true)
    expect(withLang('de')).toBe(false)
    expect(withLang('de-AT')).toBe(false)
    expect(withLang('Ukrainisch')).toBe(false)
  })

  it('limits the number of languages', () => {
    const many = Object.fromEntries(['en', 'uk', 'ru', 'ar', 'tr', 'pl', 'ro', 'fa', 'it', 'es', 'fr'].map(c => [c, { title: '', blocks: {} }]))
    expect(examContentSchema.safeParse({ ...base, translations: many }).success).toBe(false)
  })

  it('reach students without any solution', () => {
    const content = examContentSchema.parse({ ...base, translations: { uk: { title: 'Нормалізація', blocks: { intro: 'Нормалізуйте таблицю.', s: 'Таблиці в 1НФ' } } } })
    const student = toStudentContent(content)
    expect(student.translations?.uk?.blocks.intro).toBe('Нормалізуйте таблицю.')
    const json = JSON.stringify(student)
    expect(json).not.toContain('GEHEIM')
  })

  it('warn about missing texts per language', () => {
    const content = examContentSchema.parse({ ...base, translations: { uk: { title: '', blocks: { intro: 'x' } } } })
    expect(examWarnings(content).map(w => w.message)).toContain('Übersetzung Ukrainisch: 4 Texte fehlen')
  })
})

describe('language helpers', () => {
  it('know right-to-left scripts', () => {
    expect([isRtl('ar'), isRtl('fa'), isRtl('ckb'), isRtl('uk'), isRtl('tr')]).toEqual([true, true, true, false, false])
  })

  it('name languages in German and natively', () => {
    expect(languageName('uk')).toBe('Ukrainisch')
    expect(languageName('uk', 'uk')).toBe('українська')
  })
})

describe('English student interface', () => {
  it('has every German text', () => {
    expect(Object.keys(UI_TEXT.en).sort()).toEqual(Object.keys(UI_TEXT.de).sort())
  })

  it('translates hints, relationships and points', () => {
    expect(schemaHints([], { lang: 'en' })[0]!.message).toBe('No table yet')
    const tables = [
      { name: 'Kunde', columns: [{ name: 'KundenNr', pk: true, fk: null }], rows: [['1']] },
      { name: 'Auftrag', columns: [{ name: 'AuftragNr', pk: true, fk: null }, { name: 'KundenNr', pk: false, fk: { table: 'Kunde', column: 'KundenNr' } }], rows: [['A', '1']] },
    ]
    expect(schemaHints(tables, { askCardinality: true, lang: 'en' }).map(h => h.message))
      .toEqual(['Table “Auftrag”: foreign key “KundenNr”: cardinality (1:1 or 1:n) missing'])
    expect(relationshipText(relationships(tables)[0]!, 'en')).toBe('Kunde ? Auftrag (via Auftrag.KundenNr, cardinality missing)')
    expect(pointsLabel(2.5, 'en')).toBe('2.5 points')
  })
})

describe('submission with a translation', () => {
  const submission: Submission = { v: 1, runId: 'r', examTitle: 'T', name: 'Kim', answers: {}, exportedAt: '2026-11-16T08:00:00.000Z', translation: 'uk' }

  it('keeps the language through embedding, so the hash still matches', async () => {
    const parsed = embeddedSubmissionSchema.parse(JSON.parse(JSON.stringify({ submission, signature: null })))
    expect(await hashSubmission(parsed.submission)).toBe(await hashSubmission(submission))
  })

  it('old submissions without the field parse byte-identically', () => {
    const { translation: _, ...old } = submission
    expect(canonicalJson(embeddedSubmissionSchema.parse({ submission: old, signature: null }).submission)).toBe(canonicalJson(old))
  })

  it('is noted on the German PDF', () => {
    const content = toStudentContent(examContentSchema.parse(base))
    const json = JSON.stringify(buildDocDefinition({ content, submission, envelope: null, hash: 'a'.repeat(64) }))
    expect(json).toContain('Aufgaben angezeigt mit Übersetzung: Ukrainisch')
    expect(json).toContain('Tabellen in 1NF (4 Punkte)')
  })

  it('preview PDFs are marked as preview', () => {
    const content = toStudentContent(examContentSchema.parse(base))
    const doc = buildDocDefinition({ content, submission, envelope: null, hash: 'a'.repeat(64), preview: true })
    expect(JSON.stringify(doc.watermark)).toContain('VORSCHAU')
    expect(JSON.stringify(doc.content)).toContain('VORSCHAU aus dem Editor')
  })
})
