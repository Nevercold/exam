import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { SchemaTable, StudentContent } from '../../shared/utils/exam'
import { languageName, pointsLabel } from '../../shared/utils/exam'
import { diagramLayout, diagramSvg, relationships, relationshipText } from '../../shared/utils/relations'
import { embeddedSubmissionSchema, focusSummary, PDF_INFO_KEY, verificationCode, type EmbeddedSubmission, type SignedEnvelope, type Submission } from '../../shared/utils/submission'

// Builds the student's PDF in the browser. pdfmake and pdf-lib are loaded lazily (large bundles,
// slow school Wi-Fi). The submission JSON + signature are embedded in the PDF info dictionary so the
// verification page can recompute the hash.

const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

// Wide tables (the 1NF step often has 10+ columns) switch the PDF to landscape and shrink the font,
// with star widths so columns wrap instead of running off the page.
const WIDE_TABLE_COLUMNS = 7
// More columns than this don't fit a landscape page readably: the table is split into parts, each repeating the
// primary key columns so every row stays identifiable.
export const MAX_COLUMNS_PER_PART = 12

/**
 * pdfmake only wraps at spaces, so a long word ("Donaudampfschifffahrtsgesellschaft", an IBAN, a URL) pushes the
 * table off the page and the content is lost. Zero-width spaces inside long words give it break points without
 * changing what is shown. Only for the rendered text: the embedded submission (hash) is untouched.
 */
export const ZERO_WIDTH_SPACE = String.fromCharCode(0x200B)

export function breakable(text: string, every = 12): string {
  return text.replace(/\S{16,}/g, word => word.replace(new RegExp(`(.{${every}})(?=.)`, 'gsu'), `$1${ZERO_WIDTH_SPACE}`))
}

/** Column groups for a table: all columns, or parts of at most MAX_COLUMNS_PER_PART incl. the repeated PK columns. */
export function columnParts(columns: { pk: boolean }[]): number[][] {
  const all = columns.map((_, i) => i)
  if (columns.length <= MAX_COLUMNS_PER_PART) return [all]
  const keys = all.filter(i => columns[i]!.pk).slice(0, MAX_COLUMNS_PER_PART - 1)
  const rest = all.filter(i => !keys.includes(i))
  const size = MAX_COLUMNS_PER_PART - keys.length
  const parts: number[][] = []
  for (let i = 0; i < rest.length; i += size) parts.push([...keys, ...rest.slice(i, i + size)])
  return parts
}

function tablePart(t: SchemaTable, cols: number[]): Content {
  const wide = cols.length > WIDE_TABLE_COLUMNS
  return {
    table: {
      headerRows: 1,
      widths: wide ? cols.map(() => '*') : undefined,
      body: [
        cols.map((ci) => {
          const c = t.columns[ci]!
          return {
            stack: [
              { text: breakable(c.name || '?'), bold: true, decoration: c.pk ? 'underline' as const : undefined },
              ...(c.pk ? [{ text: 'PK', fontSize: 7, color: '#047857' }] : []),
              // Roboto has no arrow glyph
              ...(c.fk ? [{ text: breakable(`FK: ${c.fk.table}.${c.fk.column}${c.fk.cardinality ? ` (${c.fk.cardinality})` : ''}`), fontSize: 7, color: '#0369a1' }] : []),
            ],
            fillColor: '#f4f4f5',
          }
        }),
        ...t.rows.map(r => cols.map(ci => ({ text: breakable(r[ci] ?? '') }))),
      ],
    },
    layout: { hLineColor: '#d4d4d8', vLineColor: '#d4d4d8' },
    fontSize: cols.length > 10 ? 7 : wide ? 8 : 9,
  }
}

function schemaTablesContent(tables: SchemaTable[]): Content[] {
  if (tables.length === 0) return [{ text: 'Keine Tabellen angegeben', italics: true, color: '#71717a' }]
  return tables.map((t, ti) => {
    const name = breakable(t.name.trim() || `Tabelle ${ti + 1} (ohne Namen)`)
    if (t.columns.length === 0) {
      return { stack: [{ text: name, bold: true, margin: [0, 6, 0, 3] }, { text: 'Keine Spalten', italics: true, color: '#71717a' }] }
    }
    const parts = columnParts(t.columns)
    return {
      stack: parts.flatMap((cols, pi) => [
        {
          text: parts.length > 1 ? `${name} (Teil ${pi + 1} von ${parts.length}, ${t.columns.length} Spalten)` : name,
          bold: true,
          margin: [0, 6, 0, 3] as [number, number, number, number],
        },
        tablePart(t, cols),
      ]),
      unbreakable: t.rows.length < 15 && parts.length === 1,
    }
  })
}

// Diagram (fits a portrait page) plus the relationships as text, which stays readable when the diagram gets dense
function relationalModelContent(tables: SchemaTable[]): Content[] {
  const layout = diagramLayout(tables)
  const rels = relationships(tables)
  return [
    { text: 'Relationenmodell', bold: true, margin: [0, 10, 0, 4] },
    { svg: diagramSvg(layout), fit: [500, 600] },
    { text: 'Beziehungen', bold: true, margin: [0, 8, 0, 2] },
    rels.length
      ? { ul: rels.map(r => ({ text: breakable(relationshipText(r), 40), color: r.cardinality ? undefined : '#b45309' })) }
      : { text: 'Keine Fremdschlüssel, daher keine Beziehungen', italics: true, color: '#71717a' },
  ]
}

export function buildDocDefinition(opts: {
  content: StudentContent
  submission: Submission
  envelope: SignedEnvelope | null
  hash: string
  /** Teacher's preview from the editor: marked as such instead of "not signed" */
  preview?: boolean
}): TDocumentDefinitions {
  const { content, submission, envelope, hash, preview } = opts
  const code = verificationCode(hash)
  const mark = preview ? 'VORSCHAU' : 'NICHT SIGNIERT'

  const body: Content[] = [
    { text: content.title, style: 'title' },
    {
      table: {
        widths: ['auto', '*'],
        body: [
          ['Name', { text: submission.name, bold: true }],
          ['Erstellt', dateTime.format(new Date(submission.exportedAt))],
          ['Prüfcode', { text: code, font: 'Roboto', bold: true }],
          ['Signatur', envelope
            ? { text: `signiert am ${dateTime.format(new Date(envelope.payload.signedAt))}`, color: '#047857' }
            : preview
              ? { text: 'VORSCHAU aus dem Editor (keine Abgabe, nicht signiert)', color: '#b91c1c', bold: true }
              : { text: 'NICHT SIGNIERT (erstellt außerhalb der Prüfungszeit oder ohne Verbindung)', color: '#b91c1c', bold: true }],
          // The PDF stays German; this tells the teacher a translation of the tasks was shown
          ...(submission.translation ? [['Übersetzung', `Aufgaben angezeigt mit Übersetzung: ${languageName(submission.translation)}`]] : []),
          ...(submission.focus && !preview
            ? [['Seite verlassen', submission.focus.left
                ? { text: `${focusSummary(submission.focus)} (während der Prüfung)`, color: '#b45309' }
                : 'nicht verlassen (während der Prüfung)']]
            : []),
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 12],
    },
  ]

  for (const block of content.blocks) {
    if (block.type === 'schema-answer') {
      const raw = submission.answers[block.id]
      const tables = Array.isArray(raw) ? raw as SchemaTable[] : []
      body.push(
        { text: `${block.label || 'Tabellen'}${block.points ? ` (${pointsLabel(block.points)})` : ''}`, style: 'heading', headlineLevel: 1 },
        ...schemaTablesContent(tables),
      )
      if (block.askCardinality && tables.length) body.push(...relationalModelContent(tables))
    }
    else if (block.type === 'freetext') {
      const text = submission.answers[block.id]
      body.push(
        { text: `${block.label || 'Antwort'}${block.points ? ` (${pointsLabel(block.points)})` : ''}`, style: 'heading', headlineLevel: 1 },
        typeof text === 'string' && text.trim()
          ? { text: breakable(text, 40) }
          : { text: 'Keine Antwort', italics: true, color: '#71717a' },
      )
    }
  }

  const maxColumns = Math.max(0, ...Object.values(submission.answers)
    .flatMap(a => (Array.isArray(a) ? (a as SchemaTable[]).map(t => t.columns.length) : [])))

  return {
    pageSize: 'A4',
    pageOrientation: maxColumns > WIDE_TABLE_COLUMNS ? 'landscape' : 'portrait',
    pageMargins: [40, 50, 40, 50],
    info: { title: `${content.title} – ${submission.name}`, author: submission.name, creator: 'exam' },
    watermark: envelope ? undefined : { text: mark, color: '#b91c1c', opacity: 0.12, bold: true },
    header: (page: number) => page > 1
      ? { text: `${content.title} – ${submission.name}`, fontSize: 8, color: '#71717a', margin: [40, 20, 40, 0] }
      : null,
    footer: (page: number, pages: number) => ({
      columns: [
        { text: envelope ? `Prüfcode ${code}` : `Prüfcode ${code} · ${mark}`, color: envelope ? '#71717a' : '#b91c1c' },
        { text: `Seite ${page} von ${pages}`, alignment: 'right' },
      ],
      fontSize: 8,
      color: '#71717a',
      margin: [40, 20, 40, 0],
    }),
    content: body,
    // No heading alone at the bottom of a page
    pageBreakBefore: (node, nodes) => node.headlineLevel === 1 && nodes.getFollowingNodesOnPage().length === 0,
    styles: {
      title: { fontSize: 18, bold: true, margin: [0, 0, 0, 8] },
      heading: { fontSize: 12, bold: true, margin: [0, 14, 0, 4] },
    },
    defaultStyle: { fontSize: 10, lineHeight: 1.25 },
  }
}

export async function createSubmissionPdf(opts: Parameters<typeof buildDocDefinition>[0]): Promise<Blob> {
  const [{ default: pdfMake }, { default: vfs }, { PDFDocument, PDFDict, PDFName, PDFHexString }] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
    import('pdf-lib'),
  ])
  pdfMake.addVirtualFileSystem(vfs)
  const raw = await pdfMake.createPdf(buildDocDefinition(opts)).getBuffer()

  const doc = await PDFDocument.load(raw)
  const info = doc.context.lookup(doc.context.trailerInfo.Info, PDFDict)
  const embedded: EmbeddedSubmission = { submission: opts.submission, signature: opts.envelope }
  info.set(PDFName.of(PDF_INFO_KEY), PDFHexString.fromText(JSON.stringify(embedded)))
  const bytes = await doc.save()
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

/** Reads the embedded submission from a PDF. Returns null if there is none (not an exam PDF or re-saved). */
export async function readEmbeddedSubmission(file: ArrayBuffer): Promise<EmbeddedSubmission | null> {
  const { PDFDocument, PDFDict, PDFName, PDFHexString, PDFString } = await import('pdf-lib')
  const doc = await PDFDocument.load(file, { updateMetadata: false })
  const info = doc.context.lookup(doc.context.trailerInfo.Info)
  if (!(info instanceof PDFDict)) return null
  const value = info.lookup(PDFName.of(PDF_INFO_KEY))
  if (!(value instanceof PDFHexString) && !(value instanceof PDFString)) return null
  try {
    const parsed = embeddedSubmissionSchema.safeParse(JSON.parse(value.decodeText()))
    return parsed.success ? parsed.data : null
  }
  catch {
    return null
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** "Kim Muster" + "Normalisierung" → "Normalisierung_Kim_Muster.pdf" (safe for school cloud uploads). */
export function pdfFilename(title: string, name: string) {
  const clean = (s: string) => s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
    .replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)
  return `${clean(title) || 'Pruefung'}_${clean(name) || 'Abgabe'}.pdf`
}
