<script setup lang="ts">
// Teacher: check one student PDF. The PDF is read in the browser; only the signed payload (hash, run,
// time) goes to the server. Name and answers never leave this page.
definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useHead({ title: 'PDF prüfen · exam' })

type VerifyResponse = {
  validSignature: boolean
  runFound: boolean
  withinRun: boolean
  run: { id: string, title: string, startedAt: string, endsAt: string | null, endedAt: string | null } | null
  access: boolean
  snapshot: ExamContent | null
}

type Result = {
  fileName: string
  embedded: EmbeddedSubmission
  hashMatches: boolean
  code: string
  server: VerifyResponse | null
}

const toast = useToast()
const result = ref<Result | null>(null)
const failure = ref<string | null>(null)
const checking = ref(false)
const dragging = ref(false)
const input = useTemplateRef<HTMLInputElement>('input')

const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

async function check(file: File | undefined) {
  if (!file) return
  checking.value = true
  result.value = null
  failure.value = null
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('Die Datei ist zu groß (max. 20 MB).')
    const embedded = await readEmbeddedSubmission(await file.arrayBuffer()).catch(() => null)
    if (!embedded) {
      failure.value = 'In diesem PDF wurden keine Prüfungsdaten gefunden. Es wurde nicht mit exam erstellt oder nachträglich verändert (z. B. neu gespeichert oder gedruckt).'
      return
    }
    const hash = await hashSubmission(embedded.submission)
    const hashMatches = !!embedded.signature && embedded.signature.payload.hash === hash
    let server: VerifyResponse | null = null
    if (embedded.signature) {
      server = await $fetch<VerifyResponse>('/api/verify', { method: 'POST', body: embedded.signature })
    }
    result.value = { fileName: file.name, embedded, hashMatches, code: verificationCode(hash), server }
  }
  catch (err) {
    toast.add({ title: errorMessage(err, (err as Error)?.message || 'Prüfung fehlgeschlagen'), color: 'error' })
  }
  finally {
    checking.value = false
    if (input.value) input.value.value = ''
  }
}

function onDrop(e: DragEvent) {
  dragging.value = false
  check(e.dataTransfer?.files[0])
}

type Verdict = { color: 'success' | 'warning' | 'error', icon: string, title: string, description: string }
const verdict = computed<Verdict | null>(() => {
  const r = result.value
  if (!r) return null
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
  return { color: 'success', icon: 'i-lucide-shield-check', title: 'Signatur gültig', description: 'Das PDF wurde während der Prüfung erstellt und seitdem nicht verändert.' }
})

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
    }))
  }
  // No access or unsigned: show answers only (structure from the submission itself)
  return Object.entries(answers).map(([id, answer]) => ({
    id,
    type: (Array.isArray(answer) ? 'schema-answer' : 'freetext') as AnswerBlockType,
    label: id,
    answer,
    solution: undefined,
  }))
})

const asTables = (v: unknown) => schemaTablesSchema.safeParse(v).data ?? []
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
      <div class="max-w-6xl w-full mx-auto flex flex-col gap-6">
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
          <span class="font-medium">PDF eines Schülers hierher ziehen oder auswählen</span>
          <span class="text-sm text-muted">Das PDF wird nur in deinem Browser gelesen, Name und Antworten werden nicht hochgeladen.</span>
          <input
            ref="input"
            type="file"
            accept="application/pdf,.pdf"
            class="sr-only"
            @change="check(($event.target as HTMLInputElement).files?.[0])"
          >
        </label>

        <UAlert
          v-if="failure"
          color="error"
          variant="subtle"
          icon="i-lucide-file-x"
          title="Keine Prüfungsdaten"
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
                <dd>
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
                <BlocksSchemaTablesView
                  v-if="row.type === 'schema-answer'"
                  :tables="asTables(row.answer)"
                />
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
                <BlocksSchemaTablesView
                  v-else-if="row.type === 'schema-answer'"
                  :tables="asTables(row.solution)"
                />
                <p
                  v-else
                  class="whitespace-pre-wrap"
                >
                  {{ asText(row.solution) }}
                </p>
              </div>
            </div>
          </section>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
