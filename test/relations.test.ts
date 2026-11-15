import { describe, expect, it } from 'vitest'
import { canonicalJson } from '../shared/utils/submission'
import { addColumns, copySchemaTables, splitColumnNames, examContentSchema, examWarnings, sanitizeAnswers, schemaTablesSchema, templateContent, toStudentContent, type Cardinality, type SchemaTable } from '../shared/utils/exam'
import { schemaHints } from '../shared/utils/hints'
import { compareRelationships, diagramLayout, diagramSvg, fkProblem, matchTables, relationships, relationshipText } from '../shared/utils/relations'

type Col = [name: string, pk?: boolean, fk?: [table: string, column: string, cardinality?: Cardinality | null]]
const table = (name: string, ...cols: Col[]): SchemaTable => ({
  name,
  columns: cols.map(([n, pk = false, fk]) => ({ name: n, pk, fk: fk ? { table: fk[0], column: fk[1], ...(fk[2] ? { cardinality: fk[2] } : {}) } : null })),
  rows: [cols.map(() => 'x')],
})

// The 3NF solution of the order exam (Leistungskontrolle)
const orders = (card: Cardinality | null = '1:n'): SchemaTable[] => [
  table('Bestellung', ['BestellNr', true], ['Bestelldatum'], ['AbteilungNr', false, ['Abteilung', 'AbteilungNr', card]], ['LieferantNr', false, ['Lieferant', 'LieferantNr', card]]),
  table('Abteilung', ['AbteilungNr', true], ['Abteilungsname']),
  table('Lieferant', ['LieferantNr', true], ['Lieferantenname'], ['LieferantTelefon']),
  table('Artikel', ['ArtikelNr', true], ['Bezeichnung'], ['Preis']),
  table('Bestellposition', ['BestellNr', true, ['Bestellung', 'BestellNr', card]], ['ArtikelNr', true, ['Artikel', 'ArtikelNr', card]], ['Menge']),
]

describe('relationships', () => {
  it('derives one relationship per foreign key', () => {
    expect(relationships(orders()).map(r => relationshipText(r))).toEqual([
      'Abteilung 1 : n Bestellung (über Bestellung.AbteilungNr)',
      'Lieferant 1 : n Bestellung (über Bestellung.LieferantNr)',
      'Bestellung 1 : n Bestellposition (über Bestellposition.BestellNr)',
      'Artikel 1 : n Bestellposition (über Bestellposition.ArtikelNr)',
    ])
  })

  it('marks missing cardinalities', () => {
    expect(relationshipText(relationships(orders(null))[0]!)).toBe('Abteilung ? Bestellung (über Bestellung.AbteilungNr, Kardinalität fehlt)')
  })

  it('groups a composite foreign key into one relationship', () => {
    const tables = [
      table('Position', ['BestellNr', true], ['PosNr', true]),
      table('Lieferung', ['LieferNr', true], ['BestellNr', false, ['Position', 'BestellNr', '1:1']], ['PosNr', false, ['Position', 'PosNr', '1:1']]),
    ]
    const rels = relationships(tables)
    expect(rels).toHaveLength(1)
    expect(rels[0]!.columns).toEqual(['BestellNr', 'PosNr'])
  })
})

describe('foreign key validation', () => {
  const tables = orders()
  it('accepts FKs to a primary key', () => {
    expect(fkProblem(tables, { table: 'abteilung', column: 'AbteilungNr' })).toBeNull()
  })
  it('rejects missing targets and non-key columns', () => {
    expect(fkProblem(tables, { table: '', column: '' })).toBe('no-target')
    expect(fkProblem(tables, { table: 'Kunde', column: 'KundeNr' })).toBe('unknown-table')
    expect(fkProblem(tables, { table: 'Abteilung', column: 'Nr' })).toBe('unknown-column')
    expect(fkProblem(tables, { table: 'Abteilung', column: 'Abteilungsname' })).toBe('not-pk')
  })

  it('hints at non-PK targets and, only when asked, missing cardinalities', () => {
    const t = orders(null)
    t[0]!.columns[2]!.fk = { table: 'Abteilung', column: 'Abteilungsname', cardinality: '1:n' }
    const off = schemaHints(t).map(h => h.message)
    expect(off).toContain('Tabelle „Bestellung“: Fremdschlüssel „AbteilungNr“ verweist nicht auf den Primärschlüssel von „Abteilung“')
    expect(off.some(m => m.includes('Kardinalität'))).toBe(false)

    const on = schemaHints(t, { askCardinality: true }).map(h => h.message)
    expect(on).toContain('Tabelle „Bestellung“: Fremdschlüssel „LieferantNr“: Kardinalität (1:1 oder 1:n) fehlt')
    expect(on.filter(m => m.includes('Kardinalität'))).toHaveLength(3)
  })
})

describe('data model', () => {
  it('keeps old content and answers unchanged (no new keys when parsing)', () => {
    const oldAnswer = [{ name: 'Kunde', columns: [{ name: 'KundeNr', pk: true, fk: null }, { name: 'OrtNr', pk: false, fk: { table: 'Ort', column: 'OrtNr' } }], rows: [['1', '2']] }]
    expect(canonicalJson(schemaTablesSchema.parse(oldAnswer))).toBe(canonicalJson(oldAnswer))

    const oldBlock = { id: 's', type: 'schema-answer', label: 'L', copyFrom: null, solution: null }
    const parsed = examContentSchema.parse({ title: 'T', template: 'blank', blocks: [oldBlock] })
    expect(parsed.blocks[0]).toEqual(oldBlock)
  })

  it('rejects unknown cardinalities', () => {
    const bad = [table('A', ['x', true], ['y', false, ['A', 'x']])]
    ;(bad[0]!.columns[1]!.fk as { cardinality: string }).cardinality = 'n:m'
    expect(schemaTablesSchema.safeParse(bad).success).toBe(false)
  })

  it('sends askCardinality but never the solution to students', () => {
    const content = examContentSchema.parse({
      title: 'T',
      blocks: [{ id: 's', type: 'schema-answer', askCardinality: true, solution: orders() }],
    })
    const student = toStudentContent(content)
    expect(student.blocks[0]).toEqual({ id: 's', type: 'schema-answer', label: '', copyFrom: null, askCardinality: true })
    expect(JSON.stringify(student)).not.toContain('Abteilungsname')
  })

  it('keeps cardinalities in submitted answers', () => {
    const student = toStudentContent(examContentSchema.parse({ title: 'T', blocks: [{ id: 's', type: 'schema-answer', askCardinality: true }] }))
    const answers = sanitizeAnswers(student.blocks, { s: orders() })
    expect(relationships(answers.s as SchemaTable[]).every(r => r.cardinality === '1:n')).toBe(true)
  })
})

describe('adding columns', () => {
  it('splits names at commas, semicolons, tabs and new lines', () => {
    expect(splitColumnNames(' KundenNr, Name;Ort\tPLZ\n,,  ')).toEqual(['KundenNr', 'Name', 'Ort', 'PLZ'])
  })

  it('fills a new table: first column is the PK, one empty row', () => {
    const t: SchemaTable = { name: 'Kunde', columns: [], rows: [] }
    addColumns(t, ['KundenNr', 'Name'])
    expect(t.columns.map(c => [c.name, c.pk])).toEqual([['KundenNr', true], ['Name', false]])
    expect(t.rows).toEqual([['', '']])
  })

  it('replaces the single empty column of an old-style new table', () => {
    const t: SchemaTable = { name: '', columns: [{ name: '', pk: true, fk: null }], rows: [['']] }
    addColumns(t, ['A', 'B'])
    expect(t.columns.map(c => c.name)).toEqual(['A', 'B'])
    expect(t.rows).toEqual([['', '']])
  })

  it('appends to existing columns and keeps the data', () => {
    const t = table('Kunde', ['KundenNr', true])
    addColumns(t, ['Ort'])
    expect(t.columns.map(c => c.name)).toEqual(['KundenNr', 'Ort'])
    expect(t.rows).toEqual([['x', '']])
  })
})

describe('copyFrom', () => {
  it('copies foreign keys and cardinalities as an independent copy', () => {
    const source = orders()
    const copy = copySchemaTables(source)
    expect(copy).toEqual(source)
    expect(relationships(copy).map(r => relationshipText(r))).toEqual(relationships(source).map(r => relationshipText(r)))
    copy[0]!.columns[2]!.fk!.cardinality = '1:1'
    expect(source[0]!.columns[2]!.fk!.cardinality).toBe('1:n')
  })
})

describe('examWarnings', () => {
  const withSolution = (solution: SchemaTable[] | null, askCardinality = true) => examContentSchema.parse({
    title: 'T',
    blocks: [{ id: '3nf-tables', type: 'schema-answer', label: 'Tabellen in 3NF', askCardinality, solution }],
  })
  const messages = (c: ReturnType<typeof withSolution>) => examWarnings(c).map(w => w.message)

  it('is quiet for a complete solution', () => {
    expect(messages(withSolution(orders()))).toEqual([])
  })
  it('warns when cardinalities are asked but the solution has none', () => {
    expect(messages(withSolution(orders(null)))).toContain('In „Tabellen in 3NF“ werden Kardinalitäten abgefragt, die Musterlösung enthält aber keine')
    expect(messages(withSolution(orders(null), false))).toEqual([])
  })
  it('warns about single missing cardinalities and FKs to non-key columns', () => {
    const s = orders()
    delete s[4]!.columns[1]!.fk!.cardinality
    s[0]!.columns[3]!.fk!.column = 'Lieferantenname'
    expect(messages(withSolution(s))).toEqual([
      'Musterlösung „Tabellen in 3NF“, Tabelle „Bestellung“: Fremdschlüssel „LieferantNr“ verweist nicht auf den Primärschlüssel von „Lieferant“',
      'Musterlösung „Tabellen in 3NF“: Kardinalität fehlt bei Bestellposition.ArtikelNr',
    ])
  })
  it('enables cardinalities only in the 3NF step of the normalization template', () => {
    const blocks = templateContent('normalization').blocks.filter(b => b.type === 'schema-answer')
    expect(blocks.map(b => b.type === 'schema-answer' && !!b.askCardinality)).toEqual([false, false, true])
  })
})

describe('compareRelationships', () => {
  it('accepts renamed tables, columns and different order', () => {
    const answer = [
      table('Lieferanten', ['LiefNr', true], ['Lieferantenname'], ['LieferantTelefon']),
      table('Abteilungen', ['AbteilungNr', true], ['Abteilungsname']),
      table('Artikel', ['ArtikelNr', true], ['Bezeichnung'], ['Preis']),
      table('Posten', ['BestellNr', true, ['Bestellungen', 'BestellNr', '1:n']], ['ArtikelNr', true, ['Artikel', 'ArtikelNr', '1:n']], ['Menge']),
      table('Bestellungen', ['BestellNr', true], ['Bestelldatum'], ['AbteilungNr', false, ['Abteilungen', 'AbteilungNr', '1:n']], ['LiefNr', false, ['Lieferanten', 'LiefNr', '1:n']]),
    ]
    expect(matchTables(answer, orders()).size).toBe(5)
    const findings = compareRelationships(answer, orders())
    expect(findings.map(f => f.kind)).toEqual(['ok', 'ok', 'ok', 'ok'])
  })

  it('reports reversed direction and wrong cardinality as errors', () => {
    const answer = orders()
    // FK in Abteilung instead of Bestellung → Bestellung 1:n Abteilung
    answer[0]!.columns.splice(2, 1)
    answer[0]!.rows = [['x', 'x', 'x']]
    answer[1]!.columns.push({ name: 'BestellNr', pk: false, fk: { table: 'Bestellung', column: 'BestellNr', cardinality: '1:n' } })
    answer[4]!.columns[1]!.fk!.cardinality = '1:1'
    const findings = compareRelationships(answer, orders())
    expect(findings.find(f => f.kind === 'reversed')?.message).toBe('Abteilung 1 : n Bestellung: Richtung vertauscht (Fremdschlüssel in „Abteilung“ statt in „Bestellung“)')
    expect(findings.find(f => f.kind === 'cardinality')?.message).toBe('Artikel 1 : n Bestellposition: angegeben 1 : 1')
    expect(findings.filter(f => f.severity === 'error')).toHaveLength(2)
  })

  it('reports missing and extra relationships', () => {
    const answer = orders()
    answer[0]!.columns[3]!.fk = null
    answer[2]!.columns.push({ name: 'ArtikelNr', pk: false, fk: { table: 'Artikel', column: 'ArtikelNr', cardinality: '1:n' } })
    const findings = compareRelationships(answer, orders())
    expect(findings.filter(f => f.kind === 'missing').map(f => f.message)).toEqual(['Lieferant 1 : n Bestellung: fehlt'])
    expect(findings.filter(f => f.kind === 'extra').map(f => f.message)).toEqual(['Zusätzlich: Artikel 1 : n Lieferant (über Lieferant.ArtikelNr)'])
  })

  it('reports an unresolved n:m relationship as info, not as missing relationships', () => {
    const answer = orders().slice(0, 4)
    const findings = compareRelationships(answer, orders())
    expect(findings.filter(f => f.severity === 'error')).toEqual([])
    const nm = findings.find(f => f.kind === 'unresolved-nm')
    expect(nm?.severity).toBe('info')
    expect(nm?.message).toContain('Bestellung n : m Artikel')
  })
})

describe('diagram', () => {
  it('puts referenced tables above the tables holding the foreign keys', () => {
    const { boxes, edges } = diagramLayout(orders())
    const y = Object.fromEntries(boxes.map(b => [b.name, b.y]))
    expect(y.Abteilung).toBe(y.Lieferant)
    expect(y.Abteilung).toBeLessThan(y.Bestellung!)
    expect(y.Bestellung).toBeLessThan(y.Bestellposition!)
    expect(edges).toHaveLength(4)
    expect(edges.every(e => e.parentLabel.text === '1' && e.childLabel.text === 'n')).toBe(true)
  })

  it('survives cycles and self references', () => {
    const t = [
      table('A', ['a', true], ['b', false, ['B', 'b', '1:1']]),
      table('B', ['b', true], ['a', false, ['A', 'a', '1:n']], ['chef', false, ['B', 'b', '1:n']]),
    ]
    const layout = diagramLayout(t)
    expect(layout.edges).toHaveLength(3)
    expect(Number.isFinite(layout.height)).toBe(true)
  })

  it('escapes names in the SVG', () => {
    const svg = diagramSvg(diagramLayout([table('<script>&', ['"x"', true])]))
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&#60;script&#62;&#38;')
  })
})
