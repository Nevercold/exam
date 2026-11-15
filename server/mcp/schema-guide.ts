/** Content of the MCP resource exam://schema: how exam content is structured. */
export const examSchemaGuide = `# Exam content (JSON)

\`\`\`ts
type ExamContent = {
  title: string                       // 1–200 chars
  template: 'blank' | 'normalization' // 'normalization' enables extra checks (see below)
  blocks: Block[]                     // max. 100, ids unique within the exam
}

type Block =
  | { id: string, type: 'text', markdown: string }                // task text; Markdown, no HTML
  | { id: string, type: 'table', caption: string,                 // table given in the task
      table: { columns: string[], rows: string[][] } }            // every row has one cell per column
  | { id: string, type: 'schema-answer', label: string,           // student builds tables
      copyFrom: string | null,                                    // id of an EARLIER schema-answer block:
                                                                  // offers "copy tables from previous step"
                                                                  // (copies keys and cardinalities too)
      askCardinality?: boolean,                                   // true: students give a cardinality for every
                                                                  // FK and see the relational diagram; omit = off
      points?: number,                                            // max. points (0.5–100, steps of 0.5), teacher-only
      solution: SchemaTable[] | null }                            // model solution (never shown to students)
  | { id: string, type: 'freetext', label: string,                // student writes text
      maxLength: number | null, points?: number,
      solution: string | null }                                   // solution = expected reasoning

type SchemaTable = {
  name: string
  columns: { name: string, pk: boolean, fk: ForeignKey | null }[]
  rows: string[][]                                                // complete data rows
}

type ForeignKey = {
  table: string                                                   // referenced table (must exist)
  column: string                                                  // a PRIMARY KEY column of that table
  cardinality?: '1:1' | '1:n'                                     // seen from the referenced table; set it in
}                                                                 // solutions of blocks with askCardinality
\`\`\`

## Relationships and cardinalities

Relationships are derived from foreign keys only; there is no separate list. Each FK creates one relationship
"referenced table 1 : (1|n) table holding the FK". n:m relationships don't exist in the relational model: they
are resolved by a junction table whose primary key consists of two FKs (two 1:n relationships).

Example (3NF step of an order exam, block with \`"askCardinality": true\`), relationships
Abteilung 1:n Bestellung, Lieferant 1:n Bestellung, Bestellung 1:n Bestellposition, Artikel 1:n Bestellposition:

\`\`\`json
[
  { "name": "Bestellung", "columns": [
      { "name": "BestellNr", "pk": true, "fk": null },
      { "name": "Bestelldatum", "pk": false, "fk": null },
      { "name": "AbteilungNr", "pk": false, "fk": { "table": "Abteilung", "column": "AbteilungNr", "cardinality": "1:n" } },
      { "name": "LieferantNr", "pk": false, "fk": { "table": "Lieferant", "column": "LieferantNr", "cardinality": "1:n" } }
    ], "rows": [["B1", "03.11.2026", "A1", "L1"]] },
  { "name": "Abteilung", "columns": [
      { "name": "AbteilungNr", "pk": true, "fk": null },
      { "name": "Abteilungsname", "pk": false, "fk": null }
    ], "rows": [["A1", "Einkauf"]] },
  { "name": "Lieferant", "columns": [
      { "name": "LieferantNr", "pk": true, "fk": null },
      { "name": "Lieferantenname", "pk": false, "fk": null },
      { "name": "LieferantTelefon", "pk": false, "fk": null }
    ], "rows": [["L1", "Bürobedarf Nord", "0361 123456"]] },
  { "name": "Artikel", "columns": [
      { "name": "ArtikelNr", "pk": true, "fk": null },
      { "name": "Bezeichnung", "pk": false, "fk": null },
      { "name": "Preis", "pk": false, "fk": null }
    ], "rows": [["T1", "Toner", "49,90 €"]] },
  { "name": "Bestellposition", "columns": [
      { "name": "BestellNr", "pk": true, "fk": { "table": "Bestellung", "column": "BestellNr", "cardinality": "1:n" } },
      { "name": "ArtikelNr", "pk": true, "fk": { "table": "Artikel", "column": "ArtikelNr", "cardinality": "1:n" } },
      { "name": "Menge", "pk": false, "fk": null }
    ], "rows": [["B1", "T1", "2"]] }
]
\`\`\`

validate_exam warns about FKs that don't point to a primary key and about missing cardinalities in solutions of
blocks with askCardinality.

Points: set them on all answer blocks or on none (validate_exam warns about a mix). They are the maximum for the
teacher's grading (and AI grading suggestions on the verification page); students don't see them.

Block ids: short, stable, e.g. "intro", "given", "1nf-tables". Limits: 30 columns, 50 rows, 20 tables,
500 chars per cell.

## Normalization exams (template "normalization")

Context: German vocational school, Fachinformatiker Systemintegration, 2nd year, Lernfeld 8.2.
Definitions as taught:
- 1NF: every attribute atomic, no repeating groups (no multiple values in one cell).
- 2NF: 1NF and every non-key attribute depends on the whole primary key (only relevant for composite keys).
- 3NF: 2NF and no transitive dependencies (no non-key attribute depends on another non-key attribute).

Structure: text (scenario) → table (unnormalized, ≥ 8 columns, 3–5 data rows, realistic scenario such as
support tickets, workshop orders, hotel bookings) → for 1NF, 2NF, 3NF each: text (task) + schema-answer
(solution: ALL tables of this step with full data rows, PK/FK marked; copyFrom = previous step; the 3NF block
has askCardinality: true, so its solution needs a cardinality on every FK) + freetext
(solution: which problem the step fixes — repeating group, partial or transitive dependency — or why nothing
changes).
The repeating group is written as composite text in one cell, e.g.
"T01:Bremsbelag:Bosch:45,00 €:2; T02:Ölfilter:Mann:12,00 €:1".
Occasionally a "troll" exam is already normalized: then the correct answer is that nothing changes in any step
(tables repeated unchanged), with reasoning.

Use create_exam with template "normalization" to get this structure, then fill it via update_exam.
Write all content in German with proper umlauts.
`
