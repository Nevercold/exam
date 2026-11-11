<script setup lang="ts">
import { renderSVG } from 'uqr'
import type { RunInfo } from '~~/server/utils/exams'

// Projector view of a run: PIN, QR code, countdown, end button. Never shows solutions.
definePageMeta({ layout: 'projector', middleware: 'auth' })

const route = useRoute()
const toast = useToast()
const id = route.params.id as string

type RunView = RunInfo & { serverNow: string }
const { data: run, error, refresh } = await useFetch<RunView>(`/api/runs/${id}`, { key: `run-${id}` })
if (error.value) throw createError({ statusCode: error.value.statusCode ?? 404, statusMessage: 'Durchgang nicht gefunden', fatal: true })

useHead({ title: () => `PIN ${run.value?.pin} · exam` })

// Set after mount to avoid a hydration mismatch (the server doesn't know the public origin reliably)
const origin = ref<URL | null>(null)
onMounted(() => (origin.value = new URL(window.location.origin)))
const joinUrl = computed(() => origin.value ? `${origin.value.origin}/p/${run.value?.pin}` : '')
const joinHost = computed(() => origin.value?.host ?? '')
// SVG is generated locally by uqr from our own URL, no user input
const qrSvg = computed(() => joinUrl.value ? renderSVG(joinUrl.value, { border: 1 }) : '')

const { label: remaining, expired } = useCountdown(() => run.value?.endsAt, () => run.value?.serverNow)
const active = computed(() => !!run.value?.active && !expired.value)

// Timer end is detected locally; refresh to get the server state
watch(expired, v => v && refresh())
let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => (poll = setInterval(() => run.value?.active && refresh(), 30_000)))
onBeforeUnmount(() => clearInterval(poll))

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
        v-if="active"
        icon="i-lucide-square"
        color="error"
        variant="soft"
        size="lg"
        @click="confirmEnd = true"
      >
        Beenden
      </UButton>
    </header>

    <main
      v-if="active"
      class="flex-1 min-h-0 overflow-auto flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-20 p-6"
    >
      <div class="shrink-0 flex flex-col items-center gap-3">
        <!-- eslint-disable vue/no-v-html -- QR SVG generated locally from our own URL -->
        <div
          class="size-64 lg:size-80 rounded-2xl bg-white p-3 [&>svg]:size-full"
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
          Nur während der Prüfung erstellte PDFs sind signiert.
        </p>
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
        Prüfung beendet
      </p>
      <p class="text-muted max-w-md">
        Ab jetzt erstellte PDFs sind nicht signiert. Bitte jetzt exportieren und in der Schulcloud hochladen.
      </p>
      <UButton
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
      title="Prüfung beenden?"
      description="Danach werden keine PDFs mehr signiert. Das lässt sich nicht rückgängig machen."
    >
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            @click="confirmEnd = false"
          >
            Abbrechen
          </UButton>
          <UButton
            color="error"
            icon="i-lucide-square"
            :loading="ending"
            @click="endRun"
          >
            Beenden
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
