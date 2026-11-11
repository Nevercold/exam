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
      solution: SchemaTable[] | null }                            // model solution (never shown to students)
  | { id: string, type: 'freetext', label: string,                // student writes text
      maxLength: number | null, solution: string | null }         // solution = expected reasoning

type SchemaTable = {
  name: string
  columns: { name: string, pk: boolean, fk: { table: string, column: string } | null }[]
  rows: string[][]                                                // complete data rows
}
\`\`\`

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
(solution: ALL tables of this step with full data rows, PK/FK marked; copyFrom = previous step) + freetext
(solution: which problem the step fixes — repeating group, partial or transitive dependency — or why nothing
changes).
The repeating group is written as composite text in one cell, e.g.
"T01:Bremsbelag:Bosch:45,00 €:2; T02:Ölfilter:Mann:12,00 €:1".
Occasionally a "troll" exam is already normalized: then the correct answer is that nothing changes in any step
(tables repeated unchanged), with reasoning.

Use create_exam with template "normalization" to get this structure, then fill it via update_exam.
Write all content in German with proper umlauts.
`
