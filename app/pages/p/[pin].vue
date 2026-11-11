<script setup lang="ts">
// Student exam page. Everything stays in this browser: answers are autosaved in localStorage and only
// a hash is sent to the server for the signature. If the run has ended (or the network is gone), a
// cached copy of the exam keeps the page usable; exports are then unsigned.
const route = useRoute()
const toast = useToast()
const pin = route.params.pin as string

// Full-width page instead of the centered default layout; still no heavy components
definePageMeta({ layout: false })
useHead({ title: 'Prüfung · exam' })

type JoinResponse = { runId: string, endsAt: string | null, serverNow: string, content: StudentContent }
type Cached = Omit<JoinResponse, 'serverNow'>

const cacheKey = `exam:run:${pin}`
const run = ref<JoinResponse | null>(null)
const offline = ref(false)
const loadError = ref<string | null>(null)
const loading = ref(true)

const name = ref('')
const answers = ref<Answers>({})
const lastSaved = ref<Date | null>(null)

function readStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : null
  }
  catch {
    return null
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  }
  catch {
    return false
  }
}

async function load() {
  loading.value = true
  try {
    const res = await $fetch<JoinResponse>(`/api/join/${pin}`)
    run.value = res
    offline.value = false
    writeStorage(cacheKey, { runId: res.runId, endsAt: res.endsAt, content: res.content } satisfies Cached)
  }
  catch (err) {
    const cached = readStorage<Cached>(cacheKey)
    if (cached) {
      run.value = { ...cached, serverNow: new Date().toISOString() }
      offline.value = true
    }
    else {
      loadError.value = errorMessage(err, 'Die Prüfung konnte nicht geladen werden.')
    }
  }
  finally {
    loading.value = false
  }
  if (run.value) {
    const stored = readStorage<{ name: string, answers: Answers }>(`exam:answers:${run.value.runId}`)
    if (stored) {
      name.value = stored.name ?? ''
      answers.value = sanitizeAnswers(run.value.content.blocks, stored.answers)
    }
  }
}

onMounted(load)

// --- autosave ---
let saveTimer: ReturnType<typeof setTimeout> | undefined
watch([name, answers], () => {
  if (!run.value) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (writeStorage(`exam:answers:${run.value!.runId}`, { name: name.value, answers: answers.value })) lastSaved.value = new Date()
  }, 500)
}, { deep: true })

// --- countdown ---
const { label: remaining, remainingMs, expired } = useCountdown(() => run.value?.endsAt, () => run.value?.serverNow)
const lowTime = computed(() => remainingMs.value !== null && remainingMs.value < 5 * 60_000)
const timeFormat = new Intl.DateTimeFormat('de-DE', { timeStyle: 'short' })

// --- export ---
const nameError = computed(() => {
  const r = studentNameSchema.safeParse(name.value)
  return r.success ? undefined : r.error.issues[0]?.message
})
const nameTouched = ref(false)
const exporting = ref(false)
const lastExport = ref<{ signed: boolean, at: Date, code: string } | null>(null)

async function exportPdf() {
  nameTouched.value = true
  if (!run.value || nameError.value) {
    document.getElementById('student-name')?.focus()
    return
  }
  exporting.value = true
  try {
    const submission: Submission = {
      v: SUBMISSION_VERSION,
      runId: run.value.runId,
      examTitle: run.value.content.title,
      name: name.value.trim(),
      answers: sanitizeAnswers(run.value.content.blocks, answers.value),
      exportedAt: new Date().toISOString(),
    }
    const hash = await hashSubmission(submission)

    let envelope: SignedEnvelope | null = null
    try {
      envelope = await $fetch<SignedEnvelope>('/api/sign', { method: 'POST', body: { runId: submission.runId, hash } })
    }
    catch (err) {
      toast.add({
        title: 'PDF wird ohne Signatur erstellt',
        description: errorMessage(err, 'Der Server ist nicht erreichbar.'),
        color: 'warning',
        icon: 'i-lucide-shield-off',
        duration: 10_000,
      })
    }

    const blob = await createSubmissionPdf({ content: run.value.content, submission, envelope, hash })
    downloadBlob(blob, pdfFilename(submission.examTitle, submission.name))
    lastExport.value = { signed: !!envelope, at: new Date(), code: verificationCode(hash) }
  }
  catch (err) {
    console.error(err)
    toast.add({ title: 'PDF konnte nicht erstellt werden', description: 'Bitte erneut versuchen.', color: 'error' })
  }
  finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="w-full min-h-dvh flex flex-col">
    <!-- Sticky bar: title, timer, export -->
    <header class="sticky top-0 z-10 border-b border-default bg-default/90 backdrop-blur">
      <div class="max-w-4xl mx-auto px-4 py-2 flex items-center gap-3">
        <AppLogo
          icon-only
          class="shrink-0"
        />
        <p class="flex-1 min-w-0 font-semibold truncate">
          {{ run?.content.title ?? 'Prüfung' }}
        </p>
        <UBadge
          v-if="remaining !== null"
          :color="expired ? 'error' : lowTime ? 'warning' : 'neutral'"
          variant="subtle"
          size="lg"
          icon="i-lucide-timer"
          class="tabular-nums shrink-0"
        >
          {{ expired ? 'Zeit abgelaufen' : remaining }}
        </UBadge>
        <UButton
          v-if="run"
          icon="i-lucide-file-down"
          :loading="exporting"
          class="shrink-0"
          @click="exportPdf"
        >
          <span class="hidden sm:inline">PDF exportieren</span>
        </UButton>
      </div>
    </header>

    <main class="flex-1 w-full max-w-4xl mx-auto px-4 py-6 flex flex-col gap-8">
      <div
        v-if="loading"
        class="flex justify-center py-24"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-8 animate-spin text-muted"
        />
      </div>

      <UCard
        v-else-if="loadError"
        class="self-center max-w-sm mt-12"
      >
        <div class="flex flex-col items-center gap-4 text-center">
          <UIcon
            name="i-lucide-circle-x"
            class="size-10 text-error"
          />
          <p>{{ loadError }}</p>
          <UButton
            to="/"
            variant="soft"
          >
            Andere PIN eingeben
          </UButton>
        </div>
      </UCard>

      <template v-else-if="run">
        <UAlert
          v-if="offline"
          icon="i-lucide-wifi-off"
          color="warning"
          variant="subtle"
          title="Prüfung beendet oder Server nicht erreichbar"
          description="Du kannst weiterarbeiten, aber ein jetzt erstelltes PDF ist nicht signiert."
          :actions="[{ label: 'Erneut verbinden', icon: 'i-lucide-refresh-cw', onClick: load }]"
        />
        <UAlert
          v-else-if="expired"
          icon="i-lucide-timer-off"
          color="error"
          variant="subtle"
          title="Die Zeit ist abgelaufen"
          description="PDFs, die du jetzt erstellst, sind nicht signiert."
        />

        <UFormField
          label="Dein Name"
          description="Vor- und Nachname, steht auf deinem PDF"
          :error="nameTouched ? nameError : undefined"
          required
          :ui="{ label: 'font-semibold text-highlighted' }"
        >
          <UInput
            id="student-name"
            v-model="name"
            size="xl"
            :maxlength="100"
            autocomplete="name"
            class="w-full"
            @blur="nameTouched = true"
          />
        </UFormField>

        <BlocksStudentBlock
          v-for="block in run.content.blocks"
          :key="block.id"
          v-model:answers="answers"
          :block="block"
          :blocks="run.content.blocks"
        />

        <UCard class="mt-4">
          <div class="flex flex-col gap-3">
            <h2 class="font-semibold text-highlighted">
              Abgabe
            </h2>
            <p class="text-sm text-muted">
              Erstelle am Ende ein PDF und lade es selbst in der Schulcloud hoch. Du kannst mehrmals exportieren;
              es zählt das zuletzt hochgeladene PDF. Signiert wird nur, solange die Prüfung läuft<template v-if="run.endsAt">
                (bis {{ timeFormat.format(new Date(run.endsAt)) }} Uhr)
              </template>.
            </p>
            <UButton
              icon="i-lucide-file-down"
              size="xl"
              block
              :loading="exporting"
              @click="exportPdf"
            >
              PDF exportieren
            </UButton>
            <UAlert
              v-if="lastExport"
              :icon="lastExport.signed ? 'i-lucide-shield-check' : 'i-lucide-shield-off'"
              :color="lastExport.signed ? 'success' : 'warning'"
              variant="subtle"
              :title="lastExport.signed ? 'Signiertes PDF erstellt' : 'PDF ohne Signatur erstellt'"
              :description="`Prüfcode ${lastExport.code} · ${timeFormat.format(lastExport.at)} Uhr. Jetzt in der Schulcloud hochladen.`"
            />
            <p
              v-if="lastSaved"
              class="text-xs text-muted"
            >
              Zwischengespeichert in diesem Browser um {{ timeFormat.format(lastSaved) }} Uhr
            </p>
          </div>
        </UCard>
      </template>
    </main>
  </div>
</template>
