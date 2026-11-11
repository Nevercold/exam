import type { SchemaTable } from './exam'

// Formal hints shown to students while they work. They must never judge the content
// (that would reveal the solution), only structural problems like missing keys.

export type Hint = { table?: number, message: string }

const norm = (s: string) => s.trim().toLowerCase()

export function schemaHints(tables: SchemaTable[]): Hint[] {
  const hints: Hint[] = []
  if (tables.length === 0) return [{ message: 'Noch keine Tabelle angelegt' }]

  const names = new Map<string, SchemaTable>()
  tables.forEach((t, i) => {
    const label = t.name.trim() ? `Tabelle „${t.name.trim()}“` : `Tabelle ${i + 1}`
    const add = (message: string) => hints.push({ table: i, message: `${label}: ${message}` })

    if (!t.name.trim()) add('Name fehlt')
    else if (names.has(norm(t.name))) add('Name kommt mehrfach vor')
    else names.set(norm(t.name), t)

    if (t.columns.length === 0) add('keine Spalten')
    else if (!t.columns.some(c => c.pk)) add('kein Primärschlüssel (PK) markiert')

    const colNames = new Set<string>()
    t.columns.forEach((c, ci) => {
      if (!c.name.trim()) add(`Spalte ${ci + 1} hat keinen Namen`)
      else if (colNames.has(norm(c.name))) add(`Spalte „${c.name.trim()}“ kommt mehrfach vor`)
      else colNames.add(norm(c.name))
    })

    if (t.columns.length > 0 && t.rows.length === 0) add('keine Datenzeilen')
    const emptyRows = t.rows.filter(r => r.some(c => !c.trim())).length
    if (emptyRows > 0) add(emptyRows === 1 ? '1 Zeile mit leeren Zellen' : `${emptyRows} Zeilen mit leeren Zellen`)

    const keys = t.columns.flatMap((c, ci) => (c.pk ? [ci] : []))
    if (keys.length > 0) {
      const seen = new Set<string>()
      let duplicates = 0
      for (const r of t.rows) {
        const key = JSON.stringify(keys.map(k => (r[k] ?? '').trim()))
        if (seen.has(key)) duplicates++
        seen.add(key)
      }
      if (duplicates > 0) add('Primärschlüssel-Werte sind nicht eindeutig')
    }
  })

  // FK targets are checked after all names are known
  tables.forEach((t, i) => {
    const label = t.name.trim() ? `Tabelle „${t.name.trim()}“` : `Tabelle ${i + 1}`
    for (const c of t.columns) {
      if (!c.fk) continue
      const target = names.get(norm(c.fk.table))
      const col = c.name.trim() || '?'
      if (!c.fk.table.trim() || !c.fk.column.trim()) {
        hints.push({ table: i, message: `${label}: Fremdschlüssel „${col}“ hat kein Ziel` })
      }
      else if (!target) {
        hints.push({ table: i, message: `${label}: Fremdschlüssel „${col}“ verweist auf unbekannte Tabelle „${c.fk.table}“` })
      }
      else if (!target.columns.some(tc => norm(tc.name) === norm(c.fk!.column))) {
        hints.push({ table: i, message: `${label}: Fremdschlüssel „${col}“ verweist auf unbekannte Spalte „${c.fk.table}.${c.fk.column}“` })
      }
    }
  })

  return hints
}
