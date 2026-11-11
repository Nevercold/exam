import { describe, expect, it } from 'vitest'
import type { SchemaTable } from '../shared/utils/exam'
import { schemaHints } from '../shared/utils/hints'

const col = (name: string, pk = false, fk: { table: string, column: string } | null = null) => ({ name, pk, fk })

describe('schemaHints', () => {
  it('asks for a first table', () => {
    expect(schemaHints([]).map(h => h.message)).toEqual(['Noch keine Tabelle angelegt'])
  })

  it('is quiet for a correct structure', () => {
    const tables: SchemaTable[] = [
      { name: 'Kunde', columns: [col('KundenNr', true), col('Name')], rows: [['K1', 'Ada']] },
      { name: 'Auftrag', columns: [col('AuftragsNr', true), col('KundenNr', false, { table: 'kunde', column: 'kundennr' })], rows: [['A1', 'K1']] },
    ]
    expect(schemaHints(tables)).toEqual([])
  })

  it('reports formal problems', () => {
    const tables: SchemaTable[] = [
      { name: '', columns: [col('A'), col('A')], rows: [['1', '']] },
      { name: 'X', columns: [col('Id', true), col('Ref', false, { table: 'Nope', column: 'Id' }), col('Ref2', false, { table: 'X', column: 'Missing' })], rows: [['1', '', ''], ['1', '', '']] },
      { name: 'x', columns: [], rows: [] },
    ]
    const messages = schemaHints(tables).map(h => h.message)
    expect(messages).toEqual(expect.arrayContaining([
      'Tabelle 1: Name fehlt',
      'Tabelle 1: kein Primärschlüssel (PK) markiert',
      'Tabelle 1: Spalte „A“ kommt mehrfach vor',
      'Tabelle 1: 1 Zeile mit leeren Zellen',
      'Tabelle „X“: Primärschlüssel-Werte sind nicht eindeutig',
      'Tabelle „X“: Fremdschlüssel „Ref“ verweist auf unbekannte Tabelle „Nope“',
      'Tabelle „X“: Fremdschlüssel „Ref2“ verweist auf unbekannte Spalte „X.Missing“',
      'Tabelle „x“: Name kommt mehrfach vor',
      'Tabelle „x“: keine Spalten',
    ]))
  })
})
