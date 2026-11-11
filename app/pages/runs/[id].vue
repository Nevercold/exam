<script setup lang="ts">
import { renderSVG } from 'uqr'
import type { RunInfo } from '~~/server/utils/exams'

// Projector view of a run: waiting (PIN/QR, start button) → running (PIN/QR for late joiners, countdown,
// end button) → ended. Never shows exam content or solutions.
definePageMeta({ layout: 'projector', middleware: 'auth' })

const route = useRoute()
const toast = useToast()
const id = route.params.id as string

type RunView = RunInfo & { present: number, serverNow: string }
const { data: run, error, refresh } = await useFetch<RunView>(`/api/runs/${id}`, { key: `run-${id}` })
if (error.value) throw createError({ statusCode: error.value.statusCode ?? 404, statusMessage: 'Durchgang nicht gefunden', fatal: true })

useHead({ title: () => `PIN ${run.value?.pin} · exam` })

// Set after mount to avoid a hydration mismatch (the server doesn't know the public origin reliably)
const origin = ref<URL | null>(null)
onMounted(() => (origin.value = new URL(window.location.origin)))
const joinUrl = computed(() => origin.value ? `${origin.value.origin}/p/${run.value?.pin}` : '')
const joinHost = computed(() => origin.value?.host ?? '')
// SVG is generated locally by uqr from our own URL, no user input.
// border 4 = the quiet zone the QR spec asks for: scanners need it, and the rounded corners of the box
// stay clear of the finder patterns. crispEdges: no anti-aliased seams between modules when scaled.
const qrSvg = computed(() => joinUrl.value
  ? renderSVG(joinUrl.value, { border: 4 }).replace('<svg ', '<svg shape-rendering="crispEdges" ')
  : '')

const { label: remaining, expired } = useCountdown(() => run.value?.endsAt, () => run.value?.serverNow)
const status = computed(() => (run.value?.status === 'running' && expired.value ? 'ended' : run.value?.status))

// Timer end is detected locally; the poll keeps the head count fresh
watch(expired, v => v && refresh())
let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => (poll = setInterval(() => status.value !== 'ended' && refresh(), 5_000)))
onBeforeUnmount(() => clearInterval(poll))

const starting = ref(false)
async function startRun() {
  starting.value = true
  try {
    run.value = await $fetch<RunView>(`/api/runs/${id}/start`, { method: 'POST' })
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
  finally {
    starting.value = false
  }
}

const confirmEnd = ref(false)
const ending = ref(false)
async function endRun() {
  ending.value = true
  try {
    run.value = await $fetch<RunView>(`/api/runs/${id}/end`, { method: 'POST' })
    confirmEnd.value = false
    toast.add({ title: 'Prüfung beendet', color: 'success' })
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
  finally {
    ending.value = false
  }
}

const timeFormat = new Intl.DateTimeFormat('de-DE', { timeStyle: 'short' })

// Grace period after the end: re-evaluated every 15 s so the text flips when it's over
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 15_000)))
onBeforeUnmount(() => clearInterval(clock))
const signOpen = computed(() => !!run.value?.signUntil && new Date(run.value.signUntil).getTime() > now.value)
</script>

<template>
  <div class="flex-1 min-h-0 flex flex-col">
    <header class="shrink-0 flex items-center gap-4 px-6 py-4">
      <UButton
        :to="`/exams/${run!.examId}`"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        aria-label="Zurück zur Prüfung"
      />
      <h1 class="flex-1 min-w-0 text-2xl font-bold truncate">
        {{ run!.title }}
      </h1>
      <UButton
        v-if="status !== 'ended'"
        :icon="status === 'waiting' ? 'i-lucide-x' : 'i-lucide-square'"
        color="error"
        variant="soft"
        size="lg"
        @click="confirmEnd = true"
      >
        {{ status === 'waiting' ? 'Abbrechen' : 'Beenden' }}
      </UButton>
    </header>

    <main
      v-if="status !== 'ended'"
      class="flex-1 min-h-0 overflow-auto flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-20 p-6"
    >
      <div class="shrink-0 flex flex-col items-center gap-3">
        <!-- eslint-disable vue/no-v-html -- QR SVG generated locally from our own URL -->
        <div
          class="size-[min(70vw,24rem)] lg:size-[min(60vh,26rem)] rounded-xl overflow-hidden bg-white shadow-lg [&>svg]:size-full"
          v-html="qrSvg"
        />
        <!-- eslint-enable vue/no-v-html -->
        <p class="text-muted">
          {{ joinHost }}
        </p>
      </div>
      <div class="shrink-0 flex flex-col items-center gap-6 text-center">
        <div>
          <p class="text-muted uppercase tracking-widest text-base">
            PIN
          </p>
          <p class="text-7xl lg:text-9xl font-bold tabular-nums tracking-wider">
            {{ run!.pin.slice(0, 3) }}&thinsp;{{ run!.pin.slice(3) }}
          </p>
        </div>

        <div
          class="flex items-center gap-2 text-2xl font-semibold"
          aria-live="polite"
        >
          <UIcon
            name="i-lucide-users"
            class="size-7 text-primary"
          />
          <span class="tabular-nums">{{ run!.present }}</span>
          <span class="text-muted font-normal text-lg">{{ run!.present === 1 ? 'Person verbunden' : 'Personen verbunden' }}</span>
        </div>

        <!-- waiting: start button -->
        <template v-if="status === 'waiting'">
          <p class="text-muted max-w-md">
            Jetzt beitreten. Die Aufgaben erscheinen, sobald die Prüfung startet.
          </p>
          <UButton
            icon="i-lucide-play"
            size="xl"
            :loading="starting"
            class="text-xl px-8 py-4"
            @click="startRun"
          >
            Prüfung starten
          </UButton>
          <p class="text-sm text-muted">
            {{ run!.durationMinutes ? `Timer: ${run!.durationMinutes} Minuten ab Start` : 'Ohne Timer – endet, wenn du auf „Beenden“ klickst' }}
          </p>
        </template>

        <!-- running: countdown -->
        <template v-else>
          <div v-if="remaining !== null">
            <p class="text-muted uppercase tracking-widest text-base">
              Verbleibend
            </p>
            <p class="text-5xl lg:text-6xl font-semibold tabular-nums">
              {{ remaining }}
            </p>
            <p class="text-muted mt-1">
              bis {{ timeFormat.format(new Date(run!.endsAt!)) }} Uhr
            </p>
          </div>
          <p
            v-else
            class="text-muted"
          >
            Ohne Timer – endet, wenn du auf „Beenden“ klickst.
          </p>
          <p class="max-w-md text-base text-muted">
            Am Ende: PDF exportieren und in der Schulcloud hochladen.
            Signiert wird bis {{ SIGN_GRACE_MS / 60_000 }} Minuten nach Prüfungsende.
          </p>
        </template>
      </div>
    </main>

    <main
      v-else
      class="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <UIcon
        name="i-lucide-flag"
        class="size-16 text-primary"
      />
      <p class="text-4xl font-bold">
        {{ run!.startedAt ? 'Prüfung beendet' : 'Abgebrochen' }}
      </p>
      <p
        v-if="run!.startedAt"
        class="text-muted max-w-md"
      >
        <template v-if="signOpen">
          Jetzt PDF exportieren und in der Schulcloud hochladen.
          PDFs werden noch bis <strong class="text-highlighted">{{ timeFormat.format(new Date(run!.signUntil!)) }} Uhr</strong> signiert.
        </template>
        <template v-else>
          Ab jetzt erstellte PDFs sind nicht signiert.
        </template>
      </p>
      <UButton
        v-if="run!.startedAt"
        to="/verify"
        icon="i-lucide-shield-check"
        variant="soft"
        class="mt-4"
      >
        PDFs prüfen
      </UButton>
    </main>

    <UModal
      v-model:open="confirmEnd"
      :title="status === 'waiting' ? 'Durchgang abbrechen?' : 'Prüfung beenden?'"
      :description="status === 'waiting'
        ? 'Die PIN wird ungültig. Für einen neuen Versuch die Prüfung erneut vorbereiten.'
        : `Die Schüler haben danach noch ${SIGN_GRACE_MS / 60_000} Minuten, um ein signiertes PDF zu exportieren. Das lässt sich nicht rückgängig machen.`"
    >
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            @click="confirmEnd = false"
          >
            Zurück
          </UButton>
          <UButton
            color="error"
            icon="i-lucide-square"
            :loading="ending"
            @click="endRun"
          >
            {{ status === 'waiting' ? 'Abbrechen' : 'Beenden' }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
