import type { Cardinality, SchemaTable } from './exam'

// Relationships of a relational model, derived from foreign keys only (nothing is stored separately).
// Used for the text list, the diagram (student page, editor, verification page, PDF) and the comparison
// with the model solution on the verification page.

const norm = (s: string) => s.trim().toLowerCase()

export type Relationship = {
  /** Referenced table (the "1" side), index into the tables array; -1 if the target doesn't exist */
  parent: number
  /** Table holding the foreign key */
  child: number
  parentName: string
  childName: string
  /** FK column names in the child table (more than one for a composite key) */
  columns: string[]
  cardinality: Cardinality | null
}

export function findTable(tables: SchemaTable[], name: string): number {
  const n = norm(name)
  return n ? tables.findIndex(t => norm(t.name) === n) : -1
}

export type FkProblem = 'no-target' | 'unknown-table' | 'unknown-column' | 'not-pk'

/** Formal problem of a foreign key column, or null if it points to a primary key column of an existing table. */
export function fkProblem(tables: SchemaTable[], fk: { table: string, column: string }): FkProblem | null {
  if (!fk.table.trim() || !fk.column.trim()) return 'no-target'
  const target = tables[findTable(tables, fk.table)]
  if (!target) return 'unknown-table'
  const col = target.columns.find(c => norm(c.name) === norm(fk.column))
  if (!col) return 'unknown-column'
  return col.pk ? null : 'not-pk'
}

/**
 * One relationship per foreign key. FK columns of one table that reference the same table with a composite
 * primary key (e.g. Position(BestellNr, PosNr) → Bestellposition) form a single relationship.
 */
export function relationships(tables: SchemaTable[]): Relationship[] {
  const result: Relationship[] = []
  tables.forEach((t, child) => {
    const grouped = new Map<number, Relationship>()
    for (const c of t.columns) {
      if (!c.fk || !c.fk.table.trim()) continue
      const parent = findTable(tables, c.fk.table)
      const compositeTarget = parent >= 0 && tables[parent]!.columns.filter(x => x.pk).length > 1
      const existing = compositeTarget ? grouped.get(parent) : undefined
      if (existing) {
        existing.columns.push(c.name.trim())
        existing.cardinality ??= c.fk.cardinality ?? null
        continue
      }
      const rel: Relationship = {
        parent,
        child,
        parentName: parent >= 0 ? tables[parent]!.name.trim() : c.fk.table.trim(),
        childName: t.name.trim(),
        columns: [c.name.trim()],
        cardinality: c.fk.cardinality ?? null,
      }
      if (compositeTarget) grouped.set(parent, rel)
      result.push(rel)
    }
  })
  return result
}

const CARDINALITY_SIDES: Record<Cardinality, string> = { '1:1': '1 : 1', '1:n': '1 : n' }

/** "Abteilung 1 : n Bestellung (über Bestellung.AbteilungNr)"; English: "(via …, cardinality missing)" */
export function relationshipText(r: Relationship, lang: 'de' | 'en' = 'de'): string {
  const via = r.columns.map(c => `${r.childName || '?'}.${c || '?'}`).join(', ')
  const card = r.cardinality ? CARDINALITY_SIDES[r.cardinality] : '?'
  const [over, missing] = lang === 'en' ? ['via', 'cardinality missing'] : ['über', 'Kardinalität fehlt']
  return `${r.parentName || '?'} ${card} ${r.childName || '?'} (${over} ${via}${r.cardinality ? '' : `, ${missing}`})`
}

// ---------- Diagram layout ----------

export const DIAGRAM = {
  font: 12,
  charWidth: 7.2, // generous average for Inter/Roboto at 12 px; boxes may be a bit wide, never too narrow
  header: 26,
  row: 20,
  padX: 10,
  gapX: 70,
  gapY: 70,
  perRow: 4,
  minWidth: 110,
} as const

export type DiagramBox = {
  x: number
  y: number
  w: number
  h: number
  name: string
  columns: { name: string, pk: boolean, fk: boolean }[]
}

export type DiagramEdge = {
  points: [number, number][]
  /** Label positions next to the parent ("1") and child ("1" or "n") ends */
  parentLabel: { x: number, y: number, text: string }
  childLabel: { x: number, y: number, text: string }
}

export type DiagramLayout = { width: number, height: number, boxes: DiagramBox[], edges: DiagramEdge[] }

const textWidth = (s: string, extra = 0) => (s.length + extra) * DIAGRAM.charWidth

/**
 * Layered layout: referenced tables on top, tables holding foreign keys below their targets
 * (Abteilung/Lieferant/Artikel → Bestellung → Bestellposition). Lines run between box borders.
 * Simplification: straight lines may cross boxes in dense models, upgrade when exams need more than ~8 tables.
 */
export function diagramLayout(tables: SchemaTable[]): DiagramLayout {
  const rels = relationships(tables).filter(r => r.parent >= 0)

  // level = longest FK path to a table without foreign keys; cycles are cut by the depth limit
  const level = new Array<number>(tables.length).fill(0)
  for (let pass = 0; pass < tables.length; pass++) {
    let changed = false
    for (const r of rels) {
      if (r.parent === r.child) continue
      const l = Math.min(level[r.parent]! + 1, tables.length)
      if (l > level[r.child]!) {
        level[r.child] = l
        changed = true
      }
    }
    if (!changed) break
  }

  const boxes: DiagramBox[] = tables.map((t) => {
    const columns = t.columns.map(c => ({ name: c.name.trim() || '?', pk: c.pk, fk: !!c.fk }))
    const longest = Math.max(textWidth(t.name.trim() || '?'), ...columns.map(c => textWidth(c.name, 6)))
    return {
      x: 0,
      y: 0,
      w: Math.max(DIAGRAM.minWidth, Math.ceil(longest + 2 * DIAGRAM.padX)),
      h: DIAGRAM.header + Math.max(1, columns.length) * DIAGRAM.row + 6,
      name: t.name.trim() || '?',
      columns,
    }
  })

  // Rows per level, long levels wrapped; order by the mean x of the parents to reduce crossings
  const levels = [...new Set(level)].sort((a, b) => a - b)
  const rows: number[][] = []
  const centerX = new Array<number>(tables.length).fill(0)
  for (const l of levels) {
    const members = tables.map((_, i) => i).filter(i => level[i] === l)
    if (rows.length > 0) {
      const parentMean = (i: number) => {
        const ps = rels.filter(r => r.child === i && r.parent !== i).map(r => centerX[r.parent]!)
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Number.POSITIVE_INFINITY
      }
      members.sort((a, b) => parentMean(a) - parentMean(b) || a - b)
    }
    for (let i = 0; i < members.length; i += DIAGRAM.perRow) {
      const row = members.slice(i, i + DIAGRAM.perRow)
      rows.push(row)
      let x = 0
      for (const b of row) {
        centerX[b] = x + boxes[b]!.w / 2
        x += boxes[b]!.w + DIAGRAM.gapX
      }
    }
  }

  const rowWidth = (row: number[]) => row.reduce((s, i) => s + boxes[i]!.w, 0) + (row.length - 1) * DIAGRAM.gapX
  const margin = 20
  const width = Math.max(0, ...rows.map(rowWidth)) + 2 * margin
  let y = margin
  for (const row of rows) {
    let x = (width - rowWidth(row)) / 2
    for (const i of row) {
      boxes[i]!.x = x
      boxes[i]!.y = y
      x += boxes[i]!.w + DIAGRAM.gapX
    }
    y += Math.max(...row.map(i => boxes[i]!.h)) + DIAGRAM.gapY
  }
  const height = rows.length ? y - DIAGRAM.gapY + margin : 0

  const edges = rels.map(r => edge(boxes[r.parent]!, boxes[r.child]!, r.cardinality))
  return { width, height, boxes, edges }
}

const center = (b: DiagramBox): [number, number] => [b.x + b.w / 2, b.y + b.h / 2]

/** Point where the line from the box center towards (tx, ty) leaves the box. */
function borderPoint(b: DiagramBox, tx: number, ty: number): [number, number] {
  const [cx, cy] = center(b)
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return [cx, cy]
  const s = Math.min(dx ? (b.w / 2) / Math.abs(dx) : Infinity, dy ? (b.h / 2) / Math.abs(dy) : Infinity)
  return [cx + dx * s, cy + dy * s]
}

function edge(parent: DiagramBox, child: DiagramBox, cardinality: Cardinality | null): DiagramEdge {
  const childText = cardinality === '1:1' ? '1' : cardinality === '1:n' ? 'n' : '?'
  if (parent === child) {
    // Self reference (e.g. Mitarbeiter.VorgesetzterNr): loop on the right side
    const x = parent.x + parent.w
    const y1 = parent.y + DIAGRAM.header / 2
    const y2 = parent.y + parent.h - 12
    return {
      points: [[x, y1], [x + 30, y1], [x + 30, y2], [x, y2]],
      parentLabel: { x: x + 8, y: y1 - 6, text: '1' },
      childLabel: { x: x + 8, y: y2 + 16, text: childText },
    }
  }
  const [pcx, pcy] = center(parent)
  const [ccx, ccy] = center(child)
  const a = borderPoint(parent, ccx, ccy)
  const b = borderPoint(child, pcx, pcy)
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  const ux = (b[0] - a[0]) / len
  const uy = (b[1] - a[1]) / len
  // Labels sit a bit along the line and offset to its side so they don't overlap it
  const label = (p: [number, number], dir: 1 | -1, text: string) => ({
    x: p[0] + dir * ux * 14 - uy * 10,
    y: p[1] + dir * uy * 14 + ux * 10 + 4,
    text,
  })
  return { points: [a, b], parentLabel: label(a, 1, '1'), childLabel: label(b, -1, childText) }
}

const escapeXml = (s: string) => s.replace(/[<>&"']/g, ch => `&#${ch.charCodeAt(0)};`)

/** Standalone SVG for the PDF (pdfmake). The browser renders the same layout via a Vue template. */
export function diagramSvg(layout: DiagramLayout): string {
  const f = DIAGRAM.font
  const parts: string[] = []
  for (const e of layout.edges) {
    parts.push(`<polyline points="${e.points.map(p => p.join(',')).join(' ')}" fill="none" stroke="#52525b" stroke-width="1.2"/>`)
    for (const l of [e.parentLabel, e.childLabel]) {
      parts.push(`<text x="${l.x}" y="${l.y}" font-size="${f}" font-weight="bold" fill="#0369a1" text-anchor="middle">${escapeXml(l.text)}</text>`)
    }
  }
  for (const b of layout.boxes) {
    parts.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#ffffff" stroke="#52525b" stroke-width="1"/>`,
      `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${DIAGRAM.header}" fill="#f4f4f5" stroke="#52525b" stroke-width="1"/>`,
      `<text x="${b.x + DIAGRAM.padX}" y="${b.y + 17}" font-size="${f}" font-weight="bold" fill="#18181b">${escapeXml(b.name)}</text>`,
    )
    b.columns.forEach((c, i) => {
      const y = b.y + DIAGRAM.header + (i + 1) * DIAGRAM.row - 5
      const tag = [c.pk && 'PK', c.fk && 'FK'].filter(Boolean).join(' ')
      parts.push(`<text x="${b.x + DIAGRAM.padX}" y="${y}" font-size="${f}" fill="#18181b"${c.pk ? ' text-decoration="underline"' : ''}>${escapeXml(c.name)}</text>`)
      if (tag) parts.push(`<text x="${b.x + b.w - DIAGRAM.padX}" y="${y}" font-size="${f - 3}" fill="#0369a1" text-anchor="end">${tag}</text>`)
    })
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">${parts.join('')}</svg>`
}

// ---------- Comparison with the model solution ----------

const ident = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '')

/**
 * Maps answer tables to solution tables: same name first, then by the largest overlap of column names
 * (Jaccard ≥ 0.5). Returns answer index → solution index.
 */
export function matchTables(answer: SchemaTable[], solution: SchemaTable[]): Map<number, number> {
  const map = new Map<number, number>()
  const used = new Set<number>()
  answer.forEach((t, i) => {
    const j = solution.findIndex((s, k) => !used.has(k) && ident(s.name) !== '' && ident(s.name) === ident(t.name))
    if (j >= 0) {
      map.set(i, j)
      used.add(j)
    }
  })
  const cols = (t: SchemaTable) => new Set(t.columns.map(c => ident(c.name)).filter(Boolean))
  const pairs: { i: number, j: number, score: number }[] = []
  answer.forEach((t, i) => {
    if (map.has(i)) return
    const a = cols(t)
    solution.forEach((s, j) => {
      if (used.has(j)) return
      const b = cols(s)
      const inter = [...a].filter(x => b.has(x)).length
      const union = new Set([...a, ...b]).size
      if (union && inter / union >= 0.5) pairs.push({ i, j, score: inter / union })
    })
  })
  pairs.sort((x, y) => y.score - x.score)
  for (const p of pairs) {
    if (map.has(p.i) || used.has(p.j)) continue
    map.set(p.i, p.j)
    used.add(p.j)
  }
  return map
}

export type RelationshipFinding = {
  kind: 'ok' | 'missing' | 'extra' | 'reversed' | 'cardinality' | 'unresolved-nm'
  severity: 'ok' | 'error' | 'info'
  message: string
}

/** Junction tables of a model: the primary key consists of foreign keys to (at least) two different tables. */
function junctionTables(tables: SchemaTable[], rels: Relationship[]): { table: number, parents: [number, number] }[] {
  return tables.flatMap((t, i) => {
    const pks = t.columns.filter(c => c.pk)
    if (pks.length < 2 || !pks.every(c => c.fk)) return []
    const parents = [...new Set(rels.filter(r => r.child === i && r.parent >= 0 && r.parent !== i).map(r => r.parent))]
    return parents.length === 2 ? [{ table: i, parents: parents as [number, number] }] : []
  })
}

/**
 * Compares the relationships of an answer with the model solution. Tables are matched by name or columns
 * (names and order may differ). A relationship is the same if it connects the same two tables in the same
 * direction with the same cardinality. A missing junction table is reported as an unresolved n:m relationship
 * (info for the teacher, not an error). Informational only: grading stays with the teacher.
 */
export function compareRelationships(answer: SchemaTable[], solution: SchemaTable[]): RelationshipFinding[] {
  const map = matchTables(answer, solution)
  const solRels = relationships(solution).filter(r => r.parent >= 0)
  const ansRels = relationships(answer)
  const toSol = (i: number) => (i >= 0 ? map.get(i) ?? null : null)
  const mapped = ansRels.map(r => ({ r, parent: toSol(r.parent), child: toSol(r.child), used: false }))
  const name = (i: number) => solution[i]!.name.trim() || '?'
  const findings: RelationshipFinding[] = []

  // Junction tables without a counterpart in the answer: the n:m relationship wasn't resolved
  const matchedSol = new Set(map.values())
  const unresolved = junctionTables(solution, solRels).filter(j => !matchedSol.has(j.table))
  const coveredByNm = new Set<Relationship>()
  for (const j of unresolved) {
    for (const r of solRels) if (r.child === j.table) coveredByNm.add(r)
    findings.push({
      kind: 'unresolved-nm',
      severity: 'info',
      message: `Zwischentabelle „${name(j.table)}“ fehlt: ${name(j.parents[0])} n : m ${name(j.parents[1])} ist nicht über zwei 1:n-Beziehungen aufgelöst. Fachlich nicht falsch, bitte selbst bewerten.`,
    })
  }

  for (const s of solRels) {
    if (coveredByNm.has(s)) continue
    const label = `${name(s.parent)} ${s.cardinality ? CARDINALITY_SIDES[s.cardinality] : '–'} ${name(s.child)}`
    const same = mapped.find(m => !m.used && m.parent === s.parent && m.child === s.child)
    if (same) {
      same.used = true
      if (same.r.cardinality === s.cardinality || !s.cardinality) {
        findings.push({ kind: 'ok', severity: 'ok', message: label })
      }
      else {
        findings.push({
          kind: 'cardinality',
          severity: 'error',
          message: `${label}: angegeben ${same.r.cardinality ? CARDINALITY_SIDES[same.r.cardinality] : 'keine Kardinalität'}`,
        })
      }
      continue
    }
    const reversed = mapped.find(m => !m.used && m.parent === s.child && m.child === s.parent)
    if (reversed) {
      reversed.used = true
      findings.push({
        kind: 'reversed',
        severity: 'error',
        message: `${label}: Richtung vertauscht (Fremdschlüssel in „${reversed.r.childName || '?'}“ statt in „${name(s.child)}“)`,
      })
      continue
    }
    findings.push({ kind: 'missing', severity: 'error', message: `${label}: fehlt` })
  }

  for (const m of mapped) {
    if (m.used) continue
    findings.push({ kind: 'extra', severity: 'error', message: `Zusätzlich: ${relationshipText(m.r)}` })
  }
  return findings
}
