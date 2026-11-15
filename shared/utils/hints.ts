import type { SchemaColumn, SchemaTable } from './exam'
import { fkProblem } from './relations'

// Formal hints shown to students while they work. They must never judge the content
// (that would reveal the solution), only structural problems like missing keys.
// German by default; English for the English student interface.

export type Hint = { table?: number, message: string }
export type HintLang = 'de' | 'en'

const norm = (s: string) => s.trim().toLowerCase()

const TEXT = {
  de: {
    noTables: 'Noch keine Tabelle angelegt',
    table: (name: string, i: number) => (name ? `Tabelle „${name}“` : `Tabelle ${i + 1}`),
    nameMissing: 'Name fehlt',
    nameDuplicate: 'Name kommt mehrfach vor',
    noColumns: 'keine Spalten',
    noPk: 'kein Primärschlüssel (PK) markiert',
    columnUnnamed: (n: number) => `Spalte ${n} hat keinen Namen`,
    columnDuplicate: (name: string) => `Spalte „${name}“ kommt mehrfach vor`,
    noRows: 'keine Datenzeilen',
    emptyCells: (n: number) => (n === 1 ? '1 Zeile mit leeren Zellen' : `${n} Zeilen mit leeren Zellen`),
    pkNotUnique: 'Primärschlüssel-Werte sind nicht eindeutig',
    fk: (col: string) => `Fremdschlüssel „${col}“`,
    fkNoTarget: 'hat kein Ziel',
    fkUnknownTable: (t: string) => `verweist auf unbekannte Tabelle „${t}“`,
    fkUnknownColumn: (t: string, c: string) => `verweist auf unbekannte Spalte „${t}.${c}“`,
    fkNotPk: (t: string) => `verweist nicht auf den Primärschlüssel von „${t}“`,
    fkNoCardinality: 'Kardinalität (1:1 oder 1:n) fehlt',
  },
  en: {
    noTables: 'No table yet',
    table: (name: string, i: number) => (name ? `Table “${name}”` : `Table ${i + 1}`),
    nameMissing: 'name missing',
    nameDuplicate: 'name used more than once',
    noColumns: 'no columns',
    noPk: 'no primary key (PK) marked',
    columnUnnamed: (n: number) => `column ${n} has no name`,
    columnDuplicate: (name: string) => `column “${name}” used more than once`,
    noRows: 'no data rows',
    emptyCells: (n: number) => (n === 1 ? '1 row with empty cells' : `${n} rows with empty cells`),
    pkNotUnique: 'primary key values are not unique',
    fk: (col: string) => `foreign key “${col}”`,
    fkNoTarget: 'has no target',
    fkUnknownTable: (t: string) => `refers to unknown table “${t}”`,
    fkUnknownColumn: (t: string, c: string) => `refers to unknown column “${t}.${c}”`,
    fkNotPk: (t: string) => `does not refer to the primary key of “${t}”`,
    fkNoCardinality: 'cardinality (1:1 or 1:n) missing',
  },
} as const

export function schemaHints(tables: SchemaTable[], options: { askCardinality?: boolean, lang?: HintLang } = {}): Hint[] {
  const tx = TEXT[options.lang ?? 'de']
  const hints: Hint[] = []
  if (tables.length === 0) return [{ message: tx.noTables }]

  const names = new Map<string, SchemaTable>()
  tables.forEach((t, i) => {
    const label = tx.table(t.name.trim(), i)
    const add = (message: string) => hints.push({ table: i, message: `${label}: ${message}` })

    if (!t.name.trim()) add(tx.nameMissing)
    else if (names.has(norm(t.name))) add(tx.nameDuplicate)
    else names.set(norm(t.name), t)

    if (t.columns.length === 0) add(tx.noColumns)
    else if (!t.columns.some(c => c.pk)) add(tx.noPk)

    const colNames = new Set<string>()
    t.columns.forEach((c, ci) => {
      if (!c.name.trim()) add(tx.columnUnnamed(ci + 1))
      else if (colNames.has(norm(c.name))) add(tx.columnDuplicate(c.name.trim()))
      else colNames.add(norm(c.name))
    })

    if (t.columns.length > 0 && t.rows.length === 0) add(tx.noRows)
    const emptyRows = t.rows.filter(r => r.some(c => !c.trim())).length
    if (emptyRows > 0) add(tx.emptyCells(emptyRows))

    const keys = t.columns.flatMap((c, ci) => (c.pk ? [ci] : []))
    if (keys.length > 0) {
      const seen = new Set<string>()
      let duplicates = 0
      for (const r of t.rows) {
        const key = JSON.stringify(keys.map(k => (r[k] ?? '').trim()))
        if (seen.has(key)) duplicates++
        seen.add(key)
      }
      if (duplicates > 0) add(tx.pkNotUnique)
    }
  })

  // FK targets are checked after all names are known
  tables.forEach((t, i) => {
    const label = tx.table(t.name.trim(), i)
    for (const c of t.columns) {
      if (!c.fk) continue
      const message = fkMessage(tables, c.name, c.fk, options.askCardinality, options.lang)
      if (message) hints.push({ table: i, message: `${label}: ${message}` })
    }
  })

  return hints
}

/** Problem of one foreign key as a sentence ("Fremdschlüssel „X“ …"), or null. Also used for solution warnings. */
export function fkMessage(tables: SchemaTable[], column: string, fk: NonNullable<SchemaColumn['fk']>, askCardinality = false, lang: HintLang = 'de'): string | null {
  const tx = TEXT[lang]
  const col = tx.fk(column.trim() || '?')
  switch (fkProblem(tables, fk)) {
    case 'no-target': return `${col} ${tx.fkNoTarget}`
    case 'unknown-table': return `${col} ${tx.fkUnknownTable(fk.table)}`
    case 'unknown-column': return `${col} ${tx.fkUnknownColumn(fk.table, fk.column)}`
    case 'not-pk': return `${col} ${tx.fkNotPk(fk.table)}`
  }
  return askCardinality && !fk.cardinality ? `${col}: ${tx.fkNoCardinality}` : null
}
