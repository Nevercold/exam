<script setup lang="ts">
// Student exam page. Everything stays in this browser: answers are autosaved in localStorage and only
// a hash is sent to the server for the signature. If the run has ended (or the network is gone), a
// cached copy of the exam keeps the page usable; exports are then unsigned.
const route = useRoute()
const toast = useToast()
const pin = route.params.pin as string

// Full-width page instead of the centered default layout; still no heavy components
definePageMeta({ layout: false })
const { ui, t, translation } = useStudentLanguage()
useHead({ title: () => `${t.value.exam} · exam` })

type JoinResponse = { runId: string, endsAt: string | null, serverNow: string, content: StudentContent }
type JoinResult = { status: 'waiting', runId: string } | ({ status: 'running' } & JoinResponse)
type Cached = Omit<JoinResponse, 'serverNow'>

const cacheKey = `exam:run:${pin}`
const run = ref<JoinResponse | null>(null)
const offline = ref(false)
const loadError = ref<string | null>(null)
const loading = ref(true)
// The run is open but not started yet: show a waiting screen and poll
const waiting = ref(false)
let waitTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(waitTimer))

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
  clearTimeout(waitTimer)
  try {
    const res = await $fetch<JoinResult>(`/api/join/${pin}`, { query: { client } })
    if (res.status === 'waiting') {
      waiting.value = true
      // Jitter so a whole class doesn't poll in lockstep
      waitTimer = setTimeout(load, 2500 + Math.random() * 1500)
      return
    }
    waiting.value = false
    run.value = res
    offline.value = false
    writeStorage(cacheKey, { runId: res.runId, endsAt: res.endsAt, content: res.content } satisfies Cached)
  }
  catch (err) {
    const cached = readStorage<Cached>(cacheKey)
    if (cached) {
      waiting.value = false
      run.value = { ...cached, serverNow: new Date().toISOString() }
      offline.value = true
    }
    else if (waiting.value) {
      // Network hiccup while waiting: keep waiting; a cancelled run shows the error on 404
      if ((err as { statusCode?: number })?.statusCode === 404) {
        waiting.value = false
        loadError.value = t.value.cancelled
      }
      else {
        waitTimer = setTimeout(load, 5000)
      }
      return
    }
    else {
      loadError.value = errorMessage(err, t.value.loadFailed)
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
    sendHeartbeat()
  }
}

// --- presence: random anonymous id per browser, only for the head count on the projector ---
function clientId() {
  const key = 'exam:client'
  let id = readStorage<string>(key)
  if (!id || !clientIdSchema.safeParse(id).success) {
    id = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('')
    writeStorage(key, id)
  }
  return id
}
const client = import.meta.client ? clientId() : ''

// Ended by the teacher (the timer end is detected locally by the countdown)
const endedByTeacher = ref(false)
// End of the grace period in which PDFs are still signed, as reported by the server
const serverSignUntil = ref<Date | null>(null)
let heartbeat: ReturnType<typeof setInterval> | undefined
async function sendHeartbeat() {
  // Also in the cached (offline) view: after a reload past the end, this is how the page learns it ended
  if (!run.value || endedByTeacher.value) return
  try {
    const res = await $fetch<{ status: 'waiting' | 'running' | 'ended', signUntil: string | null }>('/api/presence', {
      method: 'POST',
      body: { runId: run.value.runId, clientId: client },
    })
    serverSignUntil.value = res.signUntil ? new Date(res.signUntil) : null
    if (res.status === 'ended') endedByTeacher.value = true
  }
  catch {
    // Offline for a moment: nothing to do, the next heartbeat retries
  }
}

onMounted(() => {
  load()
  // 10 s: a manual end shows up quickly; ~3 requests/s for a class of 30 is negligible
  heartbeat = setInterval(sendHeartbeat, 10_000)
})
onBeforeUnmount(() => clearInterval(heartbeat))

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
const timeFormat = computed(() => new Intl.DateTimeFormat(uiLocale(ui.value), { timeStyle: 'short' }))

// After the end, PDFs are still signed during the grace period
const signUntil = computed(() => serverSignUntil.value
  ?? (run.value?.endsAt ? new Date(new Date(run.value.endsAt).getTime() + SIGN_GRACE_MS) : null))
const endedText = computed(() => signUntil.value && signUntil.value > new Date()
  ? t.value.endedSignUntil(timeFormat.value.format(signUntil.value))
  : t.value.endedUnsigned)

// --- task translation (off unless the student switches it on; only languages this exam has) ---
const translationCodes = computed(() => Object.keys(run.value?.content.translations ?? {}))
const activeTranslation = computed(() => (translation.value && translationCodes.value.includes(translation.value) ? translation.value : null))
function blockTranslation(blockId: string) {
  const code = activeTranslation.value
  const text = code ? run.value?.content.translations?.[code]?.blocks[blockId] : undefined
  return code && text ? { code, text } : null
}
const titleTranslation = computed(() => {
  const code = activeTranslation.value
  return code ? run.value?.content.translations?.[code]?.title.trim() || null : null
})

// --- export ---
const nameError = computed(() => {
  if (studentNameSchema.safeParse(name.value).success) return undefined
  return name.value.trim().length > 100 ? t.value.nameTooLong : t.value.nameTooShort
})
const nameTouched = ref(false)
const exporting = ref(false)
const lastExport = ref<{ signed: boolean, at: Date, code: string } | null>(null)

// FKs without cardinality in blocks that ask for it: warn before exporting, never block (time may be up)
const missingCardinalities = computed(() => (run.value?.content.blocks ?? []).flatMap((b) => {
  if (b.type !== 'schema-answer' || !b.askCardinality) return []
  const tables = answers.value[b.id]
  if (!Array.isArray(tables)) return []
  return tables.flatMap(table => table.columns
    .filter(c => c.fk && !c.fk.cardinality)
    .map(c => `${b.label || t.value.tables}: ${table.name.trim() || '?'}.${c.name.trim() || '?'} → ${c.fk!.table || '?'}`))
}))
const confirmMissing = ref(false)

async function exportPdf(force = false) {
  nameTouched.value = true
  if (!run.value || nameError.value) {
    document.getElementById('student-name')?.focus()
    return
  }
  if (!force && missingCardinalities.value.length) {
    confirmMissing.value = true
    return
  }
  confirmMissing.value = false
  exporting.value = true
  try {
    const submission: Submission = {
      v: SUBMISSION_VERSION,
      runId: run.value.runId,
      examTitle: run.value.content.title,
      name: name.value.trim(),
      answers: sanitizeAnswers(run.value.content.blocks, answers.value),
      exportedAt: new Date().toISOString(),
      // Noted on the PDF so the teacher knows a translation was shown
      ...(activeTranslation.value ? { translation: activeTranslation.value } : {}),
    }
    const hash = await hashSubmission(submission)

    let envelope: SignedEnvelope | null = null
    try {
      envelope = await $fetch<SignedEnvelope>('/api/sign', { method: 'POST', body: { runId: submission.runId, hash } })
    }
    catch (err) {
      toast.add({
        title: t.value.unsignedToast,
        description: errorMessage(err, t.value.serverUnreachable),
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
    toast.add({ title: t.value.pdfFailed, description: t.value.tryAgain, color: 'error' })
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
      <div class="px-4 sm:px-6 py-2 flex items-center gap-3">
        <AppLogo
          icon-only
          class="shrink-0"
        />
        <p class="flex-1 min-w-0 font-semibold truncate">
          {{ run?.content.title ?? t.exam }}
        </p>
        <StudentLanguageMenu :translations="translationCodes" />
        <UBadge
          v-if="endedByTeacher || remaining !== null"
          :color="endedByTeacher || expired ? 'error' : lowTime ? 'warning' : 'neutral'"
          variant="subtle"
          size="lg"
          :icon="endedByTeacher || expired ? 'i-lucide-timer-off' : 'i-lucide-timer'"
          class="tabular-nums shrink-0"
        >
          {{ endedByTeacher && !expired ? t.ended : expired ? t.timeUp : remaining }}
        </UBadge>
        <UButton
          v-if="run"
          icon="i-lucide-file-down"
          :loading="exporting"
          class="shrink-0"
          @click="exportPdf()"
        >
          <span class="hidden sm:inline">{{ t.exportPdf }}</span>
        </UButton>
      </div>
    </header>

    <main class="flex-1 w-full px-4 sm:px-6 py-6 flex flex-col gap-8">
      <div
        v-if="loading"
        class="flex justify-center py-24"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-8 animate-spin text-muted"
        />
      </div>

      <div
        v-else-if="waiting"
        class="flex flex-col items-center gap-4 py-24 text-center"
        aria-live="polite"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-12 animate-spin text-primary"
        />
        <p class="text-xl font-semibold">
          {{ t.waitingTitle }}
        </p>
        <p class="text-muted max-w-xs">
          {{ t.waitingText }}
        </p>
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
            {{ t.otherPin }}
          </UButton>
        </div>
      </UCard>

      <template v-else-if="run">
        <UAlert
          v-if="offline && !endedByTeacher"
          icon="i-lucide-wifi-off"
          color="warning"
          variant="subtle"
          :title="t.offlineTitle"
          :description="t.offlineText(SIGN_GRACE_MS / 60_000)"
          :actions="[{ label: t.reconnect, icon: 'i-lucide-refresh-cw', onClick: load }]"
        />
        <UAlert
          v-else-if="expired || endedByTeacher"
          icon="i-lucide-timer-off"
          color="error"
          variant="subtle"
          :title="endedByTeacher && !expired ? t.endedByTeacher : t.timeIsUp"
          :description="endedText"
        />

        <div v-if="titleTranslation">
          <h1 class="text-2xl font-bold">
            {{ run.content.title }}
          </h1>
          <p
            class="text-info"
            :lang="activeTranslation!"
            :dir="isRtl(activeTranslation!) ? 'rtl' : 'ltr'"
          >
            {{ titleTranslation }}
          </p>
        </div>

        <UFormField
          :label="t.yourName"
          :description="t.yourNameHelp"
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
          :lang="ui"
          :translation="blockTranslation(block.id)"
        />

        <UCard class="mt-4">
          <div class="flex flex-col gap-3">
            <h2 class="font-semibold text-highlighted">
              {{ t.submission }}
            </h2>
            <p class="text-sm text-muted">
              {{ t.submissionText(SIGN_GRACE_MS / 60_000, signUntil ? timeFormat.format(signUntil) : null) }}
            </p>
            <UButton
              icon="i-lucide-file-down"
              size="xl"
              block
              :loading="exporting"
              @click="exportPdf()"
            >
              {{ t.exportPdf }}
            </UButton>
            <UAlert
              v-if="lastExport"
              :icon="lastExport.signed ? 'i-lucide-shield-check' : 'i-lucide-shield-off'"
              :color="lastExport.signed ? 'success' : 'warning'"
              variant="subtle"
              :title="lastExport.signed ? t.signedCreated : t.unsignedCreated"
              :description="t.exportedInfo(lastExport.code, timeFormat.format(lastExport.at))"
            />
            <p
              v-if="lastSaved"
              class="text-xs text-muted"
            >
              {{ t.savedLocally(timeFormat.format(lastSaved)) }}
            </p>
          </div>
        </UCard>
      </template>
    </main>

    <UModal
      v-model:open="confirmMissing"
      :title="t.missingCardTitle"
      :description="t.missingCardText"
    >
      <template #body>
        <ul class="text-sm flex flex-col gap-1 list-disc pl-5">
          <li
            v-for="(m, i) in missingCardinalities"
            :key="i"
          >
            {{ m }}
          </li>
        </ul>
      </template>
      <template #footer>
        <div class="flex flex-wrap justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            @click="confirmMissing = false"
          >
            {{ t.complete }}
          </UButton>
          <UButton
            color="warning"
            icon="i-lucide-file-down"
            @click="exportPdf(true)"
          >
            {{ t.exportAnyway }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
