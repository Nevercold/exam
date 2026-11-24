<script setup lang="ts">
// Teacher: check student PDFs (one or a whole class). The PDF is read in the browser; only the signed payload
// (hash, run, time) goes to the server. The name never leaves this browser; answers only for an AI suggestion
// the teacher asks for (/api/grade, not stored). The list with the teacher's points is kept in localStorage.
definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useHead({ title: 'PDF prüfen · exam' })

type VerifyResponse = {
  validSignature: boolean
  runFound: boolean
  withinRun: boolean
  inGracePeriod: boolean
  run: { id: string, title: string, startedAt: string | null, endsAt: string | null, endedAt: string | null } | null
  access: boolean
  snapshot: ExamContent | null
}

type Grading = { state: 'idle' | 'running' | 'done' | 'error', result?: GradingResult, error?: string }

type Result = {
  fileName: string
  embedded: EmbeddedSubmission
  hashMatches: boolean
  code: string
  server: VerifyResponse | null
  grading: Grading
  /** Points the teacher set per block; they override the AI suggestion */
  points: Record<string, number>
  /** The teacher marked this PDF as done */
  done: boolean
}

// One entry per dropped file; `failure` when the PDF has no exam data
type Item = { key: number, fileName: string, checking: boolean, failure: string | null, result: Result | null }

const items = ref<Item[]>([])
const selectedKey = ref<number | null>(null)
const dragging = ref(false)
const input = useTemplateRef<HTMLInputElement>('input')
let nextKey = 0

const selected = computed(() => items.value.find(i => i.key === selectedKey.value) ?? null)
const result = computed(() => selected.value?.result ?? null)
const failure = computed(() => selected.value?.failure ?? null)
const checking = computed(() => items.value.some(i => i.checking))

const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

const { data: ai } = await useFetch<{ enabled: boolean, model: string | null }>('/api/grade', { key: 'ai-status' })

// --- Local storage: the list survives a reload. Per teacher, because school computers are shared. Names and
// answers stay in this browser; "Leeren" removes them. ---
const { user } = useUserSession()
const storageKey = computed(() => `exam:verify:${user.value?.id}`)
let restored = false

onMounted(() => {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey.value) ?? 'null') as { items?: Item[] } | null
    if (Array.isArray(stored?.items)) {
      items.value = stored.items.map(i => reactive<Item>({
        ...i,
        key: nextKey++,
        checking: false,
        result: i.result
          ? { ...i.result, points: i.result.points ?? {}, done: !!i.result.done, grading: i.result.grading.state === 'done' ? i.result.grading : { state: 'idle' } }
          : null,
      }))
      selectedKey.value = items.value[0]?.key ?? null
    }
  }
  catch {
    // Unreadable: start with an empty list
  }
  restored = true
  refreshServer()
})

watch(items, () => {
  if (!restored) return
  try {
    const keep = items.value.filter(i => !i.checking)
    if (keep.length) localStorage.setItem(storageKey.value, JSON.stringify({ items: keep }))
    else localStorage.removeItem(storageKey.value)
  }
  catch {
    // Storage full or unavailable: the list only lives in memory
  }
}, { deep: true })

// Restored entries: fetch the run state again (points or the end may have changed since)
async function refreshServer() {
  for (const item of items.value) {
    const r = item.result
    if (!r?.embedded.signature) continue
    try {
      r.server = await $fetch<VerifyResponse>('/api/verify', { method: 'POST', body: r.embedded.signature })
    }
    catch {
      // Offline or logged out: keep the stored state
    }
  }
}

async function checkFiles(files: FileList | File[] | null | undefined) {
  const list = [...(files ?? [])].filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
  if (input.value) input.value.value = ''
  if (!list.length) return
  const added = list.map(f => reactive<Item>({ key: nextKey++, fileName: f.name, checking: true, failure: null, result: null }))
  items.value.push(...added)
  if (list.length === 1 || selectedKey.value === null) selectedKey.value = added[0]!.key
  // Sequential: keeps the verify requests and the browser's memory use small for a whole class
  for (const [i, file] of list.entries()) await check(file, added[i]!)
}

async function check(file: File, item: Item) {
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('Die Datei ist zu groß (max. 20 MB).')
    const embedded = await readEmbeddedSubmission(await file.arrayBuffer()).catch(() => null)
    if (!embedded) {
      item.failure = 'In diesem PDF wurden keine Prüfungsdaten gefunden. Es wurde nicht mit exam erstellt oder nachträglich verändert (z. B. neu gespeichert oder gedruckt).'
      return
    }
    const hash = await hashSubmission(embedded.submission)
    // Same PDF dropped twice: keep the first entry
    const twin = items.value.find(i => i.key !== item.key && i.result?.code === verificationCode(hash))
    if (twin) {
      removeItem(item.key)
      return
    }
    const hashMatches = !!embedded.signature && embedded.signature.payload.hash === hash
    let server: VerifyResponse | null = null
    if (embedded.signature) {
      server = await $fetch<VerifyResponse>('/api/verify', { method: 'POST', body: embedded.signature })
    }
    item.result = { fileName: file.name, embedded, hashMatches, code: verificationCode(hash), server, grading: { state: 'idle' }, points: {}, done: false }
  }
  catch (err) {
    item.failure = errorMessage(err, (err as Error)?.message || 'Prüfung fehlgeschlagen')
  }
  finally {
    item.checking = false
  }
}

function onDrop(e: DragEvent) {
  dragging.value = false
  checkFiles(e.dataTransfer?.files)
}

// Removing asks first once the teacher has graded or marked something (that work would be lost)
const confirmRemove = ref<{ title: string, run: () => void } | null>(null)
const hasWork = (i: Item) => !!i.result && (i.result.done || Object.keys(i.result.points).length > 0)

function askRemove(item: Item) {
  if (!hasWork(item)) return removeItem(item.key)
  confirmRemove.value = { title: `„${item.result!.embedded.submission.name}“ entfernen?`, run: () => removeItem(item.key) }
}

function askClear() {
  const clear = () => {
    items.value = []
    selectedKey.value = null
  }
  if (!items.value.some(hasWork)) return clear()
  confirmRemove.value = { title: 'Liste leeren?', run: clear }
}

function runRemove() {
  confirmRemove.value?.run()
  confirmRemove.value = null
}

function removeItem(key: number) {
  items.value = items.value.filter(i => i.key !== key)
  if (selectedKey.value === key) selectedKey.value = items.value[0]?.key ?? null
}

// --- AI grading suggestions (answers without the name go to the configured AI via our server) ---
async function grade(r: Result) {
  r.grading = { state: 'running' }
  try {
    const res = await $fetch<GradingResult>('/api/grade', {
      method: 'POST',
      body: { runId: r.embedded.submission.runId, answers: r.embedded.submission.answers },
    })
    r.grading = { state: 'done', result: res }
  }
  catch (err) {
    r.grading = { state: 'error', error: errorMessage(err, 'KI-Bewertung fehlgeschlagen') }
  }
}

const gradingAll = ref(false)
async function gradeAll() {
  gradingAll.value = true
  try {
    for (const item of items.value) {
      if (item.result && item.result.grading.state !== 'done') await grade(item.result)
    }
  }
  finally {
    gradingAll.value = false
  }
}

const gradeOf = (r: Result | null, blockId: string) => r?.grading.result?.blocks.find(b => b.id === blockId) ?? null

// Blocks with a maximum: from the run snapshot, or from the AI result if there is no snapshot
function scoredBlocks(r: Result): { id: string, label: string, maxPoints: number }[] {
  const snapshot = r.server?.snapshot
  if (snapshot) {
    return snapshot.blocks.flatMap(b => ((b.type === 'schema-answer' || b.type === 'freetext') && b.points !== undefined
      ? [{ id: b.id, label: b.label || b.id, maxPoints: b.points }]
      : []))
  }
  return r.grading.result?.blocks.flatMap(b => (b.maxPoints === null ? [] : [{ id: b.id, label: b.label, maxPoints: b.maxPoints }])) ?? []
}

// The teacher's points win over the AI suggestion
function pointsOf(r: Result, blockId: string): number | null {
  return r.points[blockId] ?? gradeOf(r, blockId)?.points ?? null
}

function setPoints(r: Result, blockId: string, value: number | null | undefined) {
  const { [blockId]: _, ...rest } = r.points
  r.points = value === null || value === undefined || Number.isNaN(value) ? rest : { ...rest, [blockId]: value }
}

/** Sum over scored blocks; `complete` once every block has points (only then percent and grade are shown) */
function scoreOf(r: Result) {
  const blocks = scoredBlocks(r)
  if (!blocks.length) return null
  const values = blocks.map(b => pointsOf(r, b.id))
  if (values.every(v => v === null)) return null
  return {
    total: values.reduce<number>((s, v) => s + (v ?? 0), 0),
    max: blocks.reduce((s, b) => s + b.maxPoints, 0),
    complete: values.every(v => v !== null),
    edited: blocks.some(b => b.id in r.points),
  }
}
const showPoints = computed(() => !!ai.value?.enabled || items.value.some(i => i.result && scoredBlocks(i.result).length))
const formatPoints = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 })
// Share of the maximum for the grade key; empty without a maximum
const formatPercent = (total: number | null | undefined, max: number | null | undefined) =>
  total != null && max ? `${(total / max * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %` : ''
// "85 %, Note 2" for the overview
const formatScore = (total: number | null | undefined, max: number | null | undefined) => {
  const grade = ihkGrade(total, max)
  return grade ? `${formatPercent(total, max)}, Note ${grade.grade}` : formatPercent(total, max)
}

// --- CSV for the grade book (semicolon + BOM: opens correctly in German Excel) ---
function exportCsv() {
  const done = items.value.flatMap(i => (i.result ? [i.result] : []))
  const blockCols = done.map(scoredBlocks).find(b => b.length) ?? []
  // Leading = + - @ would be read as a formula by spreadsheet apps
  const esc = (v: string) => `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`
  const header = ['Name', 'Datei', 'Signatur', 'Prüfcode', 'Seite verlassen', 'Fertig', ...blockCols.map(b => `${b.label} (max. ${formatPoints(b.maxPoints)})`), 'Punkte', 'Maximal', 'Prozent', 'Note (IHK)']
  const lines = done.map((r) => {
    const s = scoreOf(r)
    // Percent and grade only once every task has points
    const g = s?.complete ? s : null
    return [
      r.embedded.submission.name,
      r.fileName,
      verdictOf(r).title,
      r.code,
      r.embedded.submission.focus ? focusSummary(r.embedded.submission.focus) : '',
      r.done ? 'ja' : 'nein',
      ...blockCols.map((b) => {
        const p = pointsOf(r, b.id)
        return p === null ? '' : formatPoints(p)
      }),
      s ? formatPoints(s.total) : '',
      s ? formatPoints(s.max) : '',
      formatPercent(g?.total, g?.max),
      ihkGrade(g?.total, g?.max)?.grade ?? '',
    ].map(v => esc(String(v))).join(';')
  })
  const csv = String.fromCharCode(0xFEFF) + [header.map(esc).join(';'), ...lines].join('\r\n')
  const title = done[0]?.embedded.submission.examTitle ?? 'Pruefung'
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), pdfFilename(title, 'Ergebnisse').replace(/\.pdf$/, '.csv'))
}

type Verdict = { color: 'success' | 'warning' | 'error', icon: string, title: string, description: string }
const verdict = computed<Verdict | null>(() => (result.value ? verdictOf(result.value) : null))

function verdictOf(r: Result): Verdict {
  if (!r.embedded.signature) {
    return { color: 'warning', icon: 'i-lucide-shield-off', title: 'Nicht signiert', description: 'Das PDF wurde ohne Signatur erstellt, z. B. nach dem Ende der Prüfung oder ohne Verbindung zum Server.' }
  }
  if (!r.hashMatches || !r.server?.validSignature) {
    return { color: 'error', icon: 'i-lucide-shield-x', title: 'Signatur ungültig', description: 'Der Inhalt passt nicht zur Signatur. Das PDF wurde nach der Signatur verändert.' }
  }
  if (!r.server.runFound) {
    return { color: 'error', icon: 'i-lucide-shield-x', title: 'Durchgang unbekannt', description: 'Die Signatur ist gültig, aber der Durchgang existiert auf diesem Server nicht.' }
  }
  if (!r.server.withinRun) {
    return { color: 'warning', icon: 'i-lucide-shield-alert', title: 'Signiert außerhalb der Prüfungszeit', description: 'Die Signatur ist gültig, liegt aber nicht im Zeitraum des Durchgangs.' }
  }
  if (r.server.inGracePeriod) {
    return { color: 'success', icon: 'i-lucide-shield-check', title: 'Signatur gültig (in der Nachfrist)', description: `Das PDF wurde in den ${SIGN_GRACE_MS / 60_000} Minuten nach Prüfungsende erstellt und seitdem nicht verändert. Antworten können nach dem Ende noch geändert worden sein.` }
  }
  return { color: 'success', icon: 'i-lucide-shield-check', title: 'Signatur gültig', description: 'Das PDF wurde während der Prüfung erstellt und seitdem nicht verändert.' }
}

// Blocks to show side by side: answers from the PDF, solutions from the run snapshot (if accessible)
const rows = computed(() => {
  const r = result.value
  if (!r) return []
  const snapshot = r.server?.snapshot ?? null
  const blocks = snapshot?.blocks.filter(isAnswerBlock) ?? []
  const answers = r.embedded.submission.answers
  if (blocks.length) {
    return blocks.map(b => ({
      id: b.id,
      type: b.type as AnswerBlockType,
      label: (b as { label: string }).label || b.id,
      answer: answers[b.id],
      solution: (b as { solution: unknown }).solution,
      askCardinality: b.type === 'schema-answer' && !!b.askCardinality,
      maxPoints: (b as { points?: number }).points ?? null,
    }))
  }
  // No access or unsigned: show answers only (structure from the submission itself)
  return Object.entries(answers).map(([id, answer]) => ({
    id,
    type: (Array.isArray(answer) ? 'schema-answer' : 'freetext') as AnswerBlockType,
    label: id,
    answer,
    solution: undefined,
    askCardinality: asTables(answer).some(t => t.columns.some(c => c.fk?.cardinality)),
    maxPoints: gradeOf(r, id)?.maxPoints ?? null,
  }))
})

function asTables(v: unknown) {
  return schemaTablesSchema.safeParse(v).data ?? []
}

// Informational comparison of relationships; grading stays with the teacher
function comparison(row: { answer: unknown, solution: unknown }) {
  const solution = asTables(row.solution)
  return solution.length ? compareRelationships(asTables(row.answer), solution) : []
}
const FINDING_ICONS = { ok: 'i-lucide-check', error: 'i-lucide-x', info: 'i-lucide-info' } as const
const FINDING_COLORS = { ok: 'text-success', error: 'text-error', info: 'text-info' } as const
const asText = (v: unknown) => (typeof v === 'string' ? v : '')
</script>

<template>
  <UDashboardPanel id="verify">
    <template #header>
      <UDashboardNavbar title="PDF prüfen">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="w-full flex flex-col gap-6">
        <label
          class="shrink-0 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors"
          :class="dragging ? 'border-primary bg-primary/5' : 'border-default hover:bg-elevated/50'"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
        >
          <UIcon
            :name="checking ? 'i-lucide-loader-circle' : 'i-lucide-file-search'"
            class="size-10 text-muted"
            :class="{ 'animate-spin': checking }"
          />
          <span class="font-medium">PDFs hierher ziehen oder auswählen (auch alle einer Klasse auf einmal)</span>
          <span class="text-sm text-muted">
            Die PDFs werden nur in deinem Browser gelesen, Namen werden nicht hochgeladen.<template v-if="ai?.enabled">
              Für einen KI-Vorschlag gehen die Antworten ohne Namen an die eingerichtete KI.
            </template>
          </span>
          <input
            ref="input"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            class="sr-only"
            @change="checkFiles(($event.target as HTMLInputElement).files)"
          >
        </label>

        <!-- Overview of all checked PDFs -->
        <UCard
          v-if="items.length"
          :ui="{ body: 'p-0 sm:p-0' }"
        >
          <template #header>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-semibold flex-1 min-w-0">
                {{ items.length }} {{ items.length === 1 ? 'PDF' : 'PDFs' }}
              </h2>
              <UButton
                v-if="ai?.enabled"
                icon="i-lucide-sparkles"
                size="sm"
                variant="soft"
                :loading="gradingAll"
                :disabled="checking || !items.some(i => i.result && i.result.grading.state !== 'done')"
                @click="gradeAll"
              >
                Alle mit KI bewerten
              </UButton>
              <UButton
                icon="i-lucide-download"
                size="sm"
                color="neutral"
                variant="soft"
                :disabled="checking || !items.some(i => i.result)"
                @click="exportCsv"
              >
                CSV
              </UButton>
              <UButton
                icon="i-lucide-x"
                size="sm"
                color="neutral"
                variant="ghost"
                @click="askClear"
              >
                Leeren
              </UButton>
            </div>
          </template>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-left text-muted">
                <tr class="border-b border-default">
                  <th class="w-0 pl-2 py-2">
                    <span class="sr-only">Fertig</span>
                  </th>
                  <th class="px-4 py-2 font-medium">
                    Name
                  </th>
                  <th class="px-4 py-2 font-medium">
                    Signatur
                  </th>
                  <th class="px-4 py-2 font-medium hidden sm:table-cell">
                    Prüfcode
                  </th>
                  <th class="px-4 py-2 font-medium">
                    Verlassen
                  </th>
                  <th
                    v-if="showPoints"
                    class="px-4 py-2 font-medium"
                  >
                    Punkte
                  </th>
                  <th class="w-0" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in items"
                  :key="item.key"
                  class="border-b border-default last:border-0 cursor-pointer"
                  :class="item.key === selectedKey ? 'bg-primary/10' : 'hover:bg-elevated/50'"
                  @click="selectedKey = item.key"
                >
                  <td class="pl-2 py-2">
                    <UButton
                      v-if="item.result"
                      :icon="item.result.done ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                      size="xs"
                      :color="item.result.done ? 'primary' : 'neutral'"
                      variant="ghost"
                      :aria-label="item.result.done ? 'Als nicht fertig markieren' : 'Als fertig markieren'"
                      :aria-pressed="item.result.done"
                      @click.stop="item.result.done = !item.result.done"
                    />
                  </td>
                  <td class="px-4 py-2">
                    <span
                      v-if="item.result"
                      class="font-medium"
                      :class="{ 'text-muted line-through decoration-muted': item.result.done }"
                    >{{ item.result.embedded.submission.name }}</span>
                    <span
                      v-else
                      class="text-muted truncate"
                    >{{ item.fileName }}</span>
                  </td>
                  <td class="px-4 py-2">
                    <UIcon
                      v-if="item.checking"
                      name="i-lucide-loader-circle"
                      class="size-4 animate-spin text-muted"
                    />
                    <UBadge
                      v-else-if="item.result"
                      :color="verdictOf(item.result).color"
                      :icon="verdictOf(item.result).icon"
                      variant="subtle"
                    >
                      {{ verdictOf(item.result).title }}
                    </UBadge>
                    <UBadge
                      v-else
                      color="error"
                      icon="i-lucide-file-x"
                      variant="subtle"
                    >
                      Keine Prüfungsdaten
                    </UBadge>
                  </td>
                  <td class="px-4 py-2 font-mono hidden sm:table-cell">
                    {{ item.result?.code }}
                  </td>
                  <td class="px-4 py-2 whitespace-nowrap">
                    <span
                      v-if="item.result?.embedded.submission.focus"
                      :class="item.result.embedded.submission.focus.left ? 'text-warning font-medium' : 'text-muted'"
                      :title="focusSummary(item.result.embedded.submission.focus)"
                    >
                      <UIcon
                        name="i-lucide-eye-off"
                        class="size-3.5 align-[-2px]"
                      />
                      {{ item.result.embedded.submission.focus.left }}×
                    </span>
                  </td>
                  <td
                    v-if="showPoints"
                    class="px-4 py-2 tabular-nums whitespace-nowrap"
                  >
                    <template v-if="item.result">
                      <UIcon
                        v-if="item.result.grading.state === 'running'"
                        name="i-lucide-loader-circle"
                        class="size-4 animate-spin text-muted"
                      />
                      <span
                        v-else-if="item.result.grading.state === 'error' && !scoreOf(item.result)"
                        class="text-error"
                        :title="item.result.grading.error"
                      >Fehler</span>
                      <template v-else-if="scoreOf(item.result)">
                        {{ formatPoints(scoreOf(item.result)!.total) }} / {{ formatPoints(scoreOf(item.result)!.max) }}
                        <span
                          v-if="scoreOf(item.result)!.complete"
                          class="text-muted whitespace-nowrap"
                        >({{ formatScore(scoreOf(item.result)!.total, scoreOf(item.result)!.max) }})</span>
                        <span
                          v-else
                          class="text-warning"
                          title="Noch nicht alle Aufgaben bewertet"
                        >(unvollständig)</span>
                        <UIcon
                          v-if="scoreOf(item.result)!.edited"
                          name="i-lucide-pencil"
                          class="size-3.5 align-[-2px] text-muted"
                          title="Von dir angepasst"
                        />
                      </template>
                      <span
                        v-else-if="item.result.grading.state === 'done'"
                        class="text-muted"
                      >ohne Punkte</span>
                    </template>
                  </td>
                  <td class="px-2 py-2">
                    <UButton
                      icon="i-lucide-trash-2"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      aria-label="Aus der Liste entfernen"
                      @click.stop="askRemove(item)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>

        <UAlert
          v-if="failure"
          color="error"
          variant="subtle"
          icon="i-lucide-file-x"
          :title="`Keine Prüfungsdaten: ${selected?.fileName}`"
          :description="failure"
        />

        <template v-if="result && verdict">
          <UAlert
            :color="verdict.color"
            variant="subtle"
            :icon="verdict.icon"
            :title="verdict.title"
            :description="verdict.description"
          />

          <UCard>
            <dl class="grid sm:grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              <dt class="text-muted">
                Name
              </dt>
              <dd class="font-semibold">
                {{ result.embedded.submission.name }}
              </dd>
              <dt class="text-muted">
                Prüfung
              </dt>
              <dd>{{ result.embedded.submission.examTitle }}</dd>
              <template v-if="result.embedded.submission.translation">
                <dt class="text-muted">
                  Übersetzung
                </dt>
                <dd>Aufgaben mit Übersetzung angezeigt: {{ languageName(result.embedded.submission.translation) }}</dd>
              </template>
              <template v-if="result.embedded.submission.focus">
                <dt class="text-muted">
                  Seite verlassen
                </dt>
                <dd :class="{ 'text-warning font-medium': result.embedded.submission.focus.left }">
                  {{ focusSummary(result.embedded.submission.focus) }}
                  <span class="text-muted font-normal">(während der Prüfung, im Browser gemessen: ein Hinweis, kein Beweis)</span>
                </dd>
              </template>
              <dt class="text-muted">
                Prüfcode
              </dt>
              <dd class="font-mono">
                {{ result.code }} <span class="text-muted font-sans">(muss mit dem Code im PDF übereinstimmen)</span>
              </dd>
              <template v-if="result.embedded.signature">
                <dt class="text-muted">
                  Signiert
                </dt>
                <dd>{{ dateTime.format(new Date(result.embedded.signature.payload.signedAt)) }}</dd>
              </template>
              <template v-if="result.server?.run">
                <dt class="text-muted">
                  Durchgang
                </dt>
                <dd v-if="!result.server.run.startedAt">
                  nie gestartet
                </dd>
                <dd v-else>
                  {{ dateTime.format(new Date(result.server.run.startedAt)) }}
                  <template v-if="result.server.run.endedAt || result.server.run.endsAt">
                    bis {{ dateTime.format(new Date((result.server.run.endedAt ?? result.server.run.endsAt)!)) }}
                  </template>
                </dd>
              </template>
              <dt class="text-muted">
                Datei
              </dt>
              <dd class="truncate">
                {{ result.fileName }}
              </dd>
            </dl>
          </UCard>

          <UAlert
            v-if="result.server?.runFound && !result.server.access"
            color="neutral"
            variant="subtle"
            icon="i-lucide-lock"
            title="Keine Musterlösung"
            description="Die Prüfung gehört einer anderen Lehrkraft und ist nicht geteilt."
          />

          <!-- Grading of this PDF: AI suggestion, points (AI or teacher), done -->
          <div class="flex flex-wrap items-center gap-3 rounded-lg border border-default p-3">
            <UButton
              v-if="ai?.enabled && result.server?.access !== false"
              icon="i-lucide-sparkles"
              variant="soft"
              :loading="result.grading.state === 'running'"
              @click="grade(result)"
            >
              {{ result.grading.state === 'done' ? 'KI-Vorschlag neu erstellen' : 'KI-Vorschlag erstellen' }}
            </UButton>
            <p
              v-if="scoreOf(result)"
              class="font-semibold"
            >
              {{ scoreOf(result)!.edited ? 'Punkte' : 'Vorschlag' }}: {{ formatPoints(scoreOf(result)!.total) }} von {{ formatPoints(scoreOf(result)!.max) }} Punkten
              <template v-if="scoreOf(result)!.complete">
                ({{ formatPercent(scoreOf(result)!.total, scoreOf(result)!.max) }})
                <template v-if="ihkGrade(scoreOf(result)!.total, scoreOf(result)!.max)">
                  · IHK-Note {{ ihkGrade(scoreOf(result)!.total, scoreOf(result)!.max)!.grade }}
                  ({{ ihkGrade(scoreOf(result)!.total, scoreOf(result)!.max)!.label }})
                </template>
              </template>
              <span
                v-else
                class="text-warning font-normal"
              >(noch nicht alle Aufgaben bewertet)</span>
            </p>
            <p
              v-else-if="result.grading.state === 'done'"
              class="font-semibold"
            >
              Vorschlag erstellt (die Prüfung hat keine Punkte)
            </p>
            <p
              v-if="result.grading.state === 'error'"
              class="text-error text-sm"
            >
              {{ result.grading.error }}
            </p>
            <UButton
              class="ms-auto"
              :icon="result.done ? 'i-lucide-circle-check' : 'i-lucide-circle'"
              :color="result.done ? 'primary' : 'neutral'"
              :variant="result.done ? 'solid' : 'outline'"
              :aria-pressed="result.done"
              @click="result.done = !result.done"
            >
              Fertig
            </UButton>
            <p
              v-if="ai?.enabled && result.server?.access !== false"
              class="text-xs text-muted basis-full"
            >
              Nur ein Vorschlag von {{ ai.model }}: Die KI kann sich irren. Die Bewertung liegt bei dir, du kannst die Punkte bei jeder Aufgabe ändern.
            </p>
          </div>

          <section
            v-for="row in rows"
            :key="row.id"
            class="flex flex-col gap-3"
          >
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 class="text-lg font-semibold flex-1 min-w-0">
                {{ row.label }}
              </h2>
              <div
                v-if="row.maxPoints !== null"
                class="flex items-center gap-2 text-sm"
              >
                <UInputNumber
                  :model-value="pointsOf(result, row.id) ?? undefined"
                  :min="0"
                  :max="row.maxPoints"
                  :step="0.5"
                  :format-options="{ maximumFractionDigits: 1 }"
                  locale="de-DE"
                  placeholder="–"
                  class="w-32"
                  :aria-label="`Punkte für ${row.label}`"
                  @update:model-value="setPoints(result, row.id, $event)"
                />
                <span class="text-muted whitespace-nowrap">/ {{ formatPoints(row.maxPoints) }} Punkte</span>
                <UButton
                  v-if="row.id in result.points && gradeOf(result, row.id)?.points != null && result.points[row.id] !== gradeOf(result, row.id)!.points"
                  icon="i-lucide-undo-2"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :aria-label="`KI-Vorschlag übernehmen (${formatPoints(gradeOf(result, row.id)!.points!)})`"
                  :title="`KI-Vorschlag übernehmen (${formatPoints(gradeOf(result, row.id)!.points!)})`"
                  @click="setPoints(result, row.id, null)"
                />
              </div>
            </div>
            <div
              class="grid gap-4"
              :class="row.solution !== undefined ? 'lg:grid-cols-2' : ''"
            >
              <div class="min-w-0 flex flex-col gap-2">
                <p class="text-xs uppercase tracking-wide text-muted">
                  Antwort
                </p>
                <template v-if="row.type === 'schema-answer'">
                  <BlocksSchemaTablesView :tables="asTables(row.answer)" />
                  <BlocksRelationDiagram
                    v-if="row.askCardinality && asTables(row.answer).length"
                    :tables="asTables(row.answer)"
                  />
                </template>
                <p
                  v-else
                  class="whitespace-pre-wrap"
                  :class="{ 'text-muted italic': !asText(row.answer).trim() }"
                >
                  {{ asText(row.answer).trim() || 'Keine Antwort' }}
                </p>
              </div>
              <div
                v-if="row.solution !== undefined"
                class="min-w-0 flex flex-col gap-2 rounded-lg bg-elevated/50 p-3"
              >
                <p class="text-xs uppercase tracking-wide text-muted">
                  Musterlösung
                </p>
                <p
                  v-if="row.solution === null"
                  class="text-muted italic"
                >
                  Keine Musterlösung hinterlegt
                </p>
                <template v-else-if="row.type === 'schema-answer'">
                  <BlocksSchemaTablesView :tables="asTables(row.solution)" />
                  <BlocksRelationDiagram
                    v-if="row.askCardinality && asTables(row.solution).length"
                    :tables="asTables(row.solution)"
                  />
                </template>
                <p
                  v-else
                  class="whitespace-pre-wrap"
                >
                  {{ asText(row.solution) }}
                </p>
              </div>
            </div>
            <div
              v-if="row.type === 'schema-answer' && row.askCardinality && comparison(row).length"
              class="rounded-lg border border-default p-3 text-sm flex flex-col gap-1"
            >
              <p class="font-medium">
                Beziehungen im Vergleich zur Musterlösung
              </p>
              <p class="text-xs text-muted mb-1">
                Tabellen werden über Namen oder Spalten zugeordnet. Nur ein Hinweis, die Bewertung liegt bei dir.
              </p>
              <p
                v-for="(f, i) in comparison(row)"
                :key="i"
                class="flex gap-2"
              >
                <UIcon
                  :name="FINDING_ICONS[f.severity]"
                  class="size-4 shrink-0 mt-0.5"
                  :class="FINDING_COLORS[f.severity]"
                />
                {{ f.message }}
              </p>
            </div>
            <div
              v-if="gradeOf(result, row.id)"
              class="rounded-lg bg-info/10 p-3 text-sm flex gap-2"
            >
              <UIcon
                name="i-lucide-sparkles"
                class="size-4 shrink-0 mt-0.5 text-info"
              />
              <p>
                <strong v-if="gradeOf(result, row.id)!.points !== null">
                  KI: {{ formatPoints(gradeOf(result, row.id)!.points!) }} / {{ formatPoints(gradeOf(result, row.id)!.maxPoints!) }} Punkte.
                </strong>
                <strong v-else>KI:</strong>
                {{ gradeOf(result, row.id)!.comment }}
              </p>
            </div>
          </section>
        </template>
      </div>

      <UModal
        :open="!!confirmRemove"
        :title="confirmRemove?.title"
        description="Deine Punkte und Fertig-Markierungen gehen dabei verloren."
        @update:open="!$event && (confirmRemove = null)"
      >
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              @click="confirmRemove = null"
            >
              Abbrechen
            </UButton>
            <UButton
              color="error"
              icon="i-lucide-trash-2"
              @click="runRemove"
            >
              Entfernen
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
