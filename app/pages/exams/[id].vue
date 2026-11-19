<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ExamSummary, RunInfo } from '~~/server/utils/exams'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })

const route = useRoute()
const toast = useToast()
const id = route.params.id as string

type ExamDetail = ExamSummary & { isOwner: boolean, draft: ExamContent, warnings: ExamWarning[] }

const { data, error } = await useFetch<ExamDetail>(`/api/exams/${id}`, { key: `exam-${id}` })
if (error.value) throw createError({ statusCode: error.value.statusCode ?? 404, statusMessage: 'Prüfung nicht gefunden', fatal: true })

const meta = ref({
  released: data.value!.released,
  unreleasedChanges: data.value!.unreleasedChanges,
  sharedWithColleagues: data.value!.sharedWithColleagues,
  draftUpdatedVia: data.value!.draftUpdatedVia,
})
const readonly = computed(() => data.value!.archived)
const state = ref<ExamContent>(structuredClone(toRaw(data.value!.draft)))
useHead({ title: () => `${state.value.title || 'Prüfung'} · exam` })
const saved = ref(JSON.stringify(state.value))
const dirty = computed(() => JSON.stringify(state.value) !== saved.value)
const warnings = computed(() => examWarnings(state.value))
const selected = ref(0)
const preview = ref(false)
const saving = ref(false)

const current = computed({
  get: () => state.value.blocks[selected.value],
  set: (b) => {
    if (b) state.value.blocks[selected.value] = b
  },
})

const BLOCK_ICONS: Record<BlockType, string> = {
  'text': 'i-lucide-text',
  'table': 'i-lucide-table',
  'schema-answer': 'i-lucide-table-properties',
  'freetext': 'i-lucide-pen-line',
}

function blockTitle(b: Block) {
  if (b.type === 'text') return b.markdown.split('\n').find(l => l.trim())?.replace(/^#+\s*/, '').slice(0, 60) || 'Text'
  if (b.type === 'table') return b.caption || 'Tabelle'
  return b.label || BLOCK_LABELS[b.type]
}

const blockHasWarning = (b: Block) => warnings.value.some(w => w.blockId === b.id)

// --- block list ---
const addItems: DropdownMenuItem[] = BLOCK_TYPES.map(type => ({
  label: BLOCK_LABELS[type],
  icon: BLOCK_ICONS[type],
  onSelect: () => {
    const at = Math.min(selected.value + 1, state.value.blocks.length)
    state.value.blocks.splice(at, 0, emptyBlock(type, newBlockId(state.value.blocks)))
    selected.value = at
    preview.value = false
  },
}))

function moveBlock(i: number, delta: -1 | 1) {
  const list = state.value.blocks
  const j = i + delta
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j]!, list[i]!]
  if (selected.value === i) selected.value = j
}

function removeBlock(i: number) {
  const [removed] = state.value.blocks.splice(i, 1)
  // Drop references to the removed block
  for (const b of state.value.blocks) if (b.type === 'schema-answer' && b.copyFrom === removed?.id) b.copyFrom = null
  selected.value = Math.max(0, Math.min(selected.value, state.value.blocks.length - 1))
}

const confirmRemoveBlock = ref<number | null>(null)
function runRemoveBlock() {
  if (confirmRemoveBlock.value !== null) removeBlock(confirmRemoveBlock.value)
  confirmRemoveBlock.value = null
}

function blockActions(i: number): DropdownMenuItem[][] {
  return [
    [
      { label: 'Nach oben', icon: 'i-lucide-arrow-up', disabled: i === 0, onSelect: () => moveBlock(i, -1) },
      { label: 'Nach unten', icon: 'i-lucide-arrow-down', disabled: i === state.value.blocks.length - 1, onSelect: () => moveBlock(i, 1) },
    ],
    [{ label: 'Löschen', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => (confirmRemoveBlock.value = i) }],
  ]
}

// --- save / release ---
async function save() {
  const parsed = examContentSchema.safeParse(state.value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    const blockIndex = issue.path[0] === 'blocks' ? Number(issue.path[1]) : -1
    if (blockIndex >= 0) selected.value = blockIndex
    toast.add({ title: 'Bitte prüfen', description: issue.message, color: 'warning', icon: 'i-lucide-triangle-alert' })
    return false
  }
  saving.value = true
  try {
    const res = await $fetch<{ unreleasedChanges: boolean }>(`/api/exams/${id}`, { method: 'PUT', body: parsed.data })
    saved.value = JSON.stringify(state.value)
    meta.value.unreleasedChanges = res.unreleasedChanges
    meta.value.draftUpdatedVia = 'editor'
    toast.add({ title: 'Gespeichert', icon: 'i-lucide-check', color: 'success' })
    return true
  }
  catch (err) {
    toast.add({ title: errorMessage(err, 'Speichern fehlgeschlagen'), color: 'error' })
    return false
  }
  finally {
    saving.value = false
  }
}

const releasing = ref(false)
async function release() {
  if (dirty.value && !await save()) return
  releasing.value = true
  try {
    await $fetch(`/api/exams/${id}/release`, { method: 'POST' })
    meta.value.released = true
    meta.value.unreleasedChanges = false
    toast.add({ title: 'Freigegeben', description: 'Neue Durchgänge verwenden jetzt diese Version.', icon: 'i-lucide-circle-check', color: 'success' })
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
  finally {
    releasing.value = false
  }
}

defineShortcuts({
  meta_s: { usingInput: true, handler: () => !readonly.value && save() },
})

onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm('Ungespeicherte Änderungen verwerfen?')) return false
})
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) e.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

// --- sharing, copy, runs ---
async function setShared(value: boolean) {
  try {
    await $fetch(`/api/exams/${id}`, { method: 'PATCH', body: { sharedWithColleagues: value } })
    meta.value.sharedWithColleagues = value
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}

async function duplicate() {
  try {
    const res = await $fetch<{ id: string }>(`/api/exams/${id}/duplicate`, { method: 'POST' })
    await navigateTo(`/exams/${res.id}`)
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}

const startOpen = ref(false)
const runsOpen = ref(false)
const pointsRunId = ref<string | null>(null)
const { data: runs, refresh: refreshRuns } = useLazyFetch<RunInfo[]>(`/api/exams/${id}/runs`, { immediate: false, default: () => [] })
watch(runsOpen, open => open && refreshRuns())
const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
const RUN_STATUS_LABELS = { waiting: 'wartet auf Start', running: 'läuft', ended: 'beendet' } as const

// --- translations of the task texts ---
const translating = ref<string | null>(null)
const translationCodes = computed(() => Object.keys(state.value.translations ?? {}))
const languageItems = computed(() => LANGUAGE_CODES
  .filter(c => !translationCodes.value.includes(c))
  .map(c => ({ label: `${languageName(c)} (${c})`, value: c }))
  .sort((a, b) => a.label.localeCompare(b.label, 'de')))

function addLanguage(code: string | undefined) {
  if (!code) return
  state.value.translations = { ...state.value.translations, [code]: { title: '', blocks: {} } }
  translating.value = code
  preview.value = false
}

function removeLanguage(code: string) {
  const rest = Object.fromEntries(Object.entries(state.value.translations ?? {}).filter(([c]) => c !== code))
  // No empty object: keeps exams without translations byte-identical to before
  state.value.translations = Object.keys(rest).length ? rest : undefined
  translating.value = null
}

// --- preview ---
const previewContent = computed(() => {
  const r = examContentSchema.safeParse(state.value)
  return r.success ? toStudentContent(r.data) : null
})
const previewAnswers = ref<Answers>({})
const previewTranslation = ref<string>('__off__')
const previewEnglish = ref(false)
const previewTranslationItems = computed(() => [
  { label: 'Keine Übersetzung', value: '__off__' },
  ...translationCodes.value.map(c => ({ label: languageName(c), value: c })),
])
function previewBlockTranslation(blockId: string) {
  const code = previewTranslation.value
  const text = code !== '__off__' ? previewContent.value?.translations?.[code]?.blocks[blockId] : undefined
  return text ? { code, text } : null
}

// Export the preview (with whatever was typed into it) as the PDF students would get, marked "VORSCHAU"
const exportingPreview = ref(false)
async function exportPreview() {
  const content = previewContent.value
  if (!content) return
  exportingPreview.value = true
  try {
    const submission: Submission = {
      v: SUBMISSION_VERSION,
      runId: 'vorschau',
      examTitle: content.title,
      name: 'Vorschau',
      answers: sanitizeAnswers(content.blocks, previewAnswers.value),
      exportedAt: new Date().toISOString(),
      ...(previewTranslation.value !== '__off__' ? { translation: previewTranslation.value } : {}),
    }
    const hash = await hashSubmission(submission)
    const blob = await createSubmissionPdf({ content, submission, envelope: null, hash, preview: true })
    downloadBlob(blob, pdfFilename(content.title, 'Vorschau'))
  }
  catch (err) {
    console.error(err)
    toast.add({ title: 'PDF konnte nicht erstellt werden', color: 'error' })
  }
  finally {
    exportingPreview.value = false
  }
}
</script>

<template>
  <UDashboardPanel
    id="exam-editor"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <UDashboardNavbar :title="state.title || 'Prüfung'">
        <template #leading>
          <UDashboardSidebarCollapse />
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/exams"
            aria-label="Zurück zur Übersicht"
          />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-history"
            color="neutral"
            variant="ghost"
            @click="runsOpen = true"
          >
            <span class="hidden lg:inline">Durchgänge</span>
          </UButton>
          <UButton
            :icon="preview ? 'i-lucide-pencil' : 'i-lucide-eye'"
            color="neutral"
            variant="outline"
            @click="preview = !preview"
          >
            <span class="hidden sm:inline">{{ preview ? 'Bearbeiten' : 'Vorschau' }}</span>
          </UButton>
          <template v-if="!readonly">
            <UTooltip text="Speichern (⌘/Strg + S)">
              <UButton
                icon="i-lucide-save"
                color="neutral"
                variant="outline"
                :loading="saving"
                :disabled="!dirty"
                @click="save"
              >
                <span class="hidden sm:inline">Speichern</span>
              </UButton>
            </UTooltip>
            <UButton
              icon="i-lucide-circle-check"
              :loading="releasing"
              :disabled="!dirty && meta.released && !meta.unreleasedChanges"
              @click="release"
            >
              <span class="hidden sm:inline">Freigeben</span>
            </UButton>
          </template>
          <UTooltip :text="meta.released ? 'Freigegebene Version starten' : 'Erst freigeben, dann starten'">
            <UButton
              icon="i-lucide-play"
              color="success"
              :disabled="!meta.released || readonly"
              @click="startOpen = true"
            >
              <span class="hidden sm:inline">Starten</span>
            </UButton>
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="shrink-0 flex flex-col lg:flex-row min-h-full">
        <!-- Left: meta + block list -->
        <aside class="lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-default p-4 flex flex-col gap-4">
          <UAlert
            v-if="readonly"
            icon="i-lucide-archive"
            color="neutral"
            variant="subtle"
            title="Archiviert"
            description="Zum Bearbeiten in der Übersicht wiederherstellen oder kopieren."
            :actions="[{ label: 'Kopieren', icon: 'i-lucide-copy', onClick: duplicate }]"
          />
          <UAlert
            v-else-if="!meta.released || meta.unreleasedChanges || dirty"
            :icon="meta.draftUpdatedVia === 'mcp' ? 'i-lucide-bot' : 'i-lucide-pencil-line'"
            color="warning"
            variant="subtle"
            :title="meta.draftUpdatedVia === 'mcp' && !dirty ? 'Entwurf (von KI geändert)' : 'Entwurf'"
            :description="meta.released
              ? 'Änderungen gelten erst nach „Freigeben“. Laufende und neue Durchgänge nutzen bis dahin die freigegebene Version.'
              : 'Prüfe Inhalt und Musterlösungen und gib die Prüfung dann frei.'"
          />

          <UFormField label="Titel">
            <UInput
              v-model="state.title"
              :maxlength="LIMITS.title"
              :disabled="readonly"
              class="w-full"
            />
          </UFormField>

          <USwitch
            v-if="data!.isOwner"
            :model-value="meta.sharedWithColleagues"
            label="Mit dem Kollegium teilen"
            description="Alle Lehrkräfte können sie dann sehen (inkl. Lösung), bearbeiten und starten."
            :disabled="readonly"
            @update:model-value="setShared"
          />
          <p
            v-else
            class="text-sm text-muted"
          >
            Geteilt von {{ data!.owner.name }}
          </p>

          <div class="flex flex-col gap-2">
            <p class="text-sm font-medium">
              Übersetzungen der Aufgaben
            </p>
            <div
              v-if="translationCodes.length"
              class="flex flex-wrap gap-1.5"
            >
              <UButton
                v-for="code in translationCodes"
                :key="code"
                size="xs"
                icon="i-lucide-languages"
                :variant="translating === code ? 'solid' : 'soft'"
                :color="translating === code ? 'primary' : 'neutral'"
                @click="translating = code; preview = false"
              >
                {{ languageName(code) }}
              </UButton>
            </div>
            <USelectMenu
              v-if="!readonly && translationCodes.length < MAX_TRANSLATIONS"
              :items="languageItems"
              value-key="value"
              placeholder="Sprache hinzufügen …"
              :search-input="{ placeholder: 'Sprache suchen' }"
              icon="i-lucide-plus"
              size="sm"
              class="w-full"
              :model-value="undefined"
              @update:model-value="addLanguage($event as string | undefined)"
            />
            <p class="text-xs text-muted">
              Schüler können eine Übersetzung selbst einschalten; sie steht unter dem deutschen Text.
            </p>
          </div>

          <ul
            v-if="warnings.length"
            class="text-sm flex flex-col gap-1 rounded-lg bg-warning/10 p-3"
          >
            <li
              v-for="(w, i) in warnings"
              :key="i"
              class="flex gap-2"
            >
              <UIcon
                name="i-lucide-triangle-alert"
                class="size-4 shrink-0 mt-0.5 text-warning"
              />
              {{ w.message }}
            </li>
          </ul>

          <USeparator />

          <div class="flex items-center justify-between">
            <h2 class="font-semibold">
              Blöcke <span class="text-muted font-normal">({{ state.blocks.length }})</span>
            </h2>
            <UDropdownMenu
              v-if="!readonly"
              :items="addItems"
              :content="{ align: 'end' }"
            >
              <UButton
                icon="i-lucide-plus"
                size="sm"
              >
                Block
              </UButton>
            </UDropdownMenu>
          </div>

          <ol class="flex flex-col gap-1">
            <li
              v-for="(block, i) in state.blocks"
              :key="block.id"
              class="group flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer"
              :class="selected === i && !preview && !translating ? 'bg-elevated' : 'hover:bg-elevated/50'"
              @click="selected = i; preview = false; translating = null"
            >
              <span class="text-xs text-muted w-5 text-right tabular-nums">{{ i + 1 }}</span>
              <UIcon
                :name="BLOCK_ICONS[block.type]"
                class="size-4 shrink-0 text-muted"
              />
              <span class="flex-1 truncate text-sm">{{ blockTitle(block) }}</span>
              <UIcon
                v-if="blockHasWarning(block)"
                name="i-lucide-triangle-alert"
                class="size-4 text-warning shrink-0"
              />
              <UDropdownMenu
                v-if="!readonly"
                :items="blockActions(i)"
                :content="{ align: 'end' }"
              >
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  aria-label="Aktionen"
                  @click.stop
                />
              </UDropdownMenu>
            </li>
          </ol>
        </aside>

        <!-- Right: preview or selected block -->
        <section class="flex-1 min-w-0 p-4 sm:p-6">
          <template v-if="preview">
            <UAlert
              icon="i-lucide-eye"
              color="info"
              variant="subtle"
              title="Vorschau aus Sicht der Schüler (ohne Lösungen)"
              description="Eingaben hier werden nicht gespeichert. Mit „Als PDF exportieren“ siehst du das PDF, das Schüler damit abgeben würden."
              class="mb-4"
            />
            <div
              v-if="previewContent"
              class="flex flex-wrap items-center gap-3 mb-6"
            >
              <USelect
                v-if="translationCodes.length"
                v-model="previewTranslation"
                :items="previewTranslationItems"
                icon="i-lucide-languages"
                size="sm"
                class="w-56"
                aria-label="Übersetzung in der Vorschau"
              />
              <USwitch
                v-model="previewEnglish"
                label="Oberfläche auf Englisch"
                size="sm"
              />
              <span class="flex-1" />
              <UButton
                icon="i-lucide-file-down"
                size="sm"
                variant="soft"
                :loading="exportingPreview"
                @click="exportPreview"
              >
                Als PDF exportieren
              </UButton>
            </div>
            <div
              v-if="previewContent"
              class="flex flex-col gap-8"
            >
              <h1 class="text-2xl font-bold">
                {{ previewContent.title }}
              </h1>
              <BlocksStudentBlock
                v-for="block in previewContent.blocks"
                :key="block.id"
                v-model:answers="previewAnswers"
                :block="block"
                :blocks="previewContent.blocks"
                :lang="previewEnglish ? 'en' : 'de'"
                :translation="previewBlockTranslation(block.id)"
              />
            </div>
            <p
              v-else
              class="text-muted"
            >
              Die Prüfung enthält noch Fehler. Speichere, um sie angezeigt zu bekommen.
            </p>
          </template>
          <BlocksTranslationEditor
            v-else-if="translating && state.translations?.[translating]"
            :key="translating"
            :model-value="state.translations[translating]!"
            :content="state"
            :code="translating"
            :disabled="readonly"
            @update:model-value="state.translations![translating!] = $event"
            @remove="removeLanguage(translating)"
          />
          <template v-else-if="current">
            <div class="flex items-center gap-2 mb-4 text-sm text-muted">
              <UIcon :name="BLOCK_ICONS[current.type]" />
              {{ BLOCK_LABELS[current.type] }}
              <span class="font-mono text-xs">· {{ current.id }}</span>
            </div>
            <BlocksBlockEditor
              :key="current.id"
              v-model="current"
              :blocks="state.blocks"
              :index="selected"
              :disabled="readonly"
            />
          </template>
          <UEmpty
            v-else
            icon="i-lucide-blocks"
            title="Noch keine Blöcke"
            description="Füge über „+ Block“ Text, Tabellen und Antwortfelder hinzu."
            class="mt-12"
          />
        </section>
      </div>

      <StartRunModal
        :exam-id="startOpen ? id : null"
        :title="state.title"
        @close="startOpen = false"
      />

      <UModal
        v-model:open="runsOpen"
        title="Durchgänge"
        description="Jeder Start erzeugt einen Durchgang mit eigener PIN."
      >
        <template #body>
          <p
            v-if="!runs.length"
            class="text-sm text-muted"
          >
            Noch keine Durchgänge.
          </p>
          <ul class="flex flex-col divide-y divide-default">
            <li
              v-for="run in runs"
              :key="run.id"
              class="py-2 flex items-center gap-3"
            >
              <UBadge
                :color="run.status === 'running' ? 'success' : run.status === 'waiting' ? 'warning' : 'neutral'"
                variant="subtle"
              >
                {{ RUN_STATUS_LABELS[run.status] }}
              </UBadge>
              <span class="flex-1 text-sm">{{ dateTime.format(new Date(run.startedAt ?? run.createdAt)) }}</span>
              <span class="font-mono text-sm text-muted">{{ run.pin }}</span>
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-award"
                aria-label="Punkte anpassen"
                title="Punkte anpassen"
                @click="pointsRunId = run.id"
              />
              <UButton
                :to="`/runs/${run.id}`"
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-arrow-right"
                aria-label="Öffnen"
              />
            </li>
          </ul>
        </template>
      </UModal>

      <RunPointsModal
        :run-id="pointsRunId"
        @close="pointsRunId = null"
      />

      <UModal
        :open="confirmRemoveBlock !== null"
        :title="`„${state.blocks[confirmRemoveBlock ?? 0] ? blockTitle(state.blocks[confirmRemoveBlock ?? 0]!) : ''}“ löschen?`"
        description="Der Block wird samt Inhalt aus dem Entwurf entfernt."
        @update:open="!$event && (confirmRemoveBlock = null)"
      >
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              @click="confirmRemoveBlock = null"
            >
              Abbrechen
            </UButton>
            <UButton
              color="error"
              icon="i-lucide-trash-2"
              @click="runRemoveBlock"
            >
              Löschen
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
