<script setup lang="ts">
// Teacher: check student PDFs (one or a whole class). The PDF is read in the browser; only the signed payload
// (hash, run, time) goes to the server. The name never leaves this page; answers only for an AI suggestion
// the teacher asks for (/api/grade, not stored).
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
    item.result = { fileName: file.name, embedded, hashMatches, code: verificationCode(hash), server, grading: { state: 'idle' } }
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
const formatPoints = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 })

// --- CSV for the grade book (semicolon + BOM: opens correctly in German Excel) ---
function exportCsv() {
  const done = items.value.flatMap(i => (i.result ? [i.result] : []))
  const blockCols = done.find(r => r.grading.result)?.grading.result?.blocks.filter(b => b.maxPoints !== null) ?? []
  // Leading = + - @ would be read as a formula by spreadsheet apps
  const esc = (v: string) => `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`
  const header = ['Name', 'Datei', 'Signatur', 'Prüfcode', ...blockCols.map(b => `${b.label} (max. ${formatPoints(b.maxPoints!)})`), 'KI-Punkte', 'Maximal']
  const lines = done.map((r) => {
    const g = r.grading.result
    return [
      r.embedded.submission.name,
      r.fileName,
      verdictOf(r).title,
      r.code,
      ...blockCols.map((b) => {
        const p = g?.blocks.find(x => x.id === b.id)?.points
        return p === null || p === undefined ? '' : formatPoints(p)
      }),
      g?.total !== null && g?.total !== undefined ? formatPoints(g.total) : '',
      g?.max !== null && g?.max !== undefined ? formatPoints(g.max) : '',
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
                @click="items = []; selectedKey = null"
              >
                Leeren
              </UButton>
            </div>
          </template>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-left text-muted">
                <tr class="border-b border-default">
                  <th class="px-4 py-2 font-medium">
                    Name
                  </th>
                  <th class="px-4 py-2 font-medium">
                    Signatur
                  </th>
                  <th class="px-4 py-2 font-medium hidden sm:table-cell">
                    Prüfcode
                  </th>
                  <th
                    v-if="ai?.enabled"
                    class="px-4 py-2 font-medium"
                  >
                    KI-Punkte
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
                  <td class="px-4 py-2">
                    <span
                      v-if="item.result"
                      class="font-medium"
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
                  <td
                    v-if="ai?.enabled"
                    class="px-4 py-2 tabular-nums whitespace-nowrap"
                  >
                    <template v-if="item.result">
                      <UIcon
                        v-if="item.result.grading.state === 'running'"
                        name="i-lucide-loader-circle"
                        class="size-4 animate-spin text-muted"
                      />
                      <span
                        v-else-if="item.result.grading.state === 'error'"
                        class="text-error"
                        :title="item.result.grading.error"
                      >Fehler</span>
                      <template v-else-if="item.result.grading.result?.total != null">
                        {{ formatPoints(item.result.grading.result.total) }} / {{ formatPoints(item.result.grading.result.max!) }}
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
                      @click.stop="removeItem(item.key)"
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

          <!-- AI suggestion for this PDF -->
          <div
            v-if="ai?.enabled && result.server?.access !== false"
            class="flex flex-wrap items-center gap-3 rounded-lg border border-default p-3"
          >
            <UButton
              icon="i-lucide-sparkles"
              variant="soft"
              :loading="result.grading.state === 'running'"
              @click="grade(result)"
            >
              {{ result.grading.state === 'done' ? 'KI-Vorschlag neu erstellen' : 'KI-Vorschlag erstellen' }}
            </UButton>
            <p
              v-if="result.grading.result"
              class="font-semibold"
            >
              <template v-if="result.grading.result.total !== null">
                Vorschlag: {{ formatPoints(result.grading.result.total) }} von {{ formatPoints(result.grading.result.max!) }} Punkten
              </template>
              <template v-else>
                Vorschlag erstellt (die Prüfung hat keine Punkte)
              </template>
            </p>
            <p
              v-else-if="result.grading.state === 'error'"
              class="text-error text-sm"
            >
              {{ result.grading.error }}
            </p>
            <p class="text-xs text-muted basis-full">
              Nur ein Vorschlag von {{ ai.model }}: Die KI kann sich irren. Die Bewertung liegt bei dir.
            </p>
          </div>

          <section
            v-for="row in rows"
            :key="row.id"
            class="flex flex-col gap-3"
          >
            <h2 class="text-lg font-semibold">
              {{ row.label }}
            </h2>
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
    </template>
  </UDashboardPanel>
</template>
