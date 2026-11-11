<script setup lang="ts">
// Opens a run of a released exam in the waiting state; the teacher starts it on the projector view.
const props = defineProps<{ examId: string | null, title?: string }>()
const emit = defineEmits<{ close: [] }>()
const toast = useToast()

const withTimer = ref(true)
const minutes = ref(45)
const starting = ref(false)

async function start() {
  if (!props.examId) return
  starting.value = true
  try {
    const run = await $fetch<{ id: string }>(`/api/exams/${props.examId}/runs`, {
      method: 'POST',
      body: { durationMinutes: withTimer.value ? minutes.value : null },
    })
    emit('close')
    await navigateTo(`/runs/${run.id}`)
  }
  catch (err) {
    toast.add({ title: errorMessage(err, 'Vorbereiten fehlgeschlagen'), color: 'error' })
  }
  finally {
    starting.value = false
  }
}
</script>

<template>
  <UModal
    :open="!!examId"
    title="Prüfung vorbereiten"
    :description="title"
    @update:open="(v: boolean) => { if (!v) emit('close') }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <p class="text-sm text-muted">
          Die Schüler treten mit PIN oder QR-Code bei und sehen zunächst nur einen Wartebildschirm.
          Prüfung und Timer starten erst, wenn du auf der Beamer-Seite auf „Prüfung starten“ klickst.
        </p>
        <USwitch
          v-model="withTimer"
          label="Mit Timer"
          :description="`Ohne Timer beendest du die Prüfung selbst. Nach dem Ende werden PDFs noch ${SIGN_GRACE_MS / 60_000} Minuten lang signiert.`"
        />
        <UFormField
          v-if="withTimer"
          label="Dauer in Minuten"
        >
          <UInputNumber
            v-model="minutes"
            :min="1"
            :max="600"
            :step="5"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          @click="emit('close')"
        >
          Abbrechen
        </UButton>
        <UButton
          icon="i-lucide-presentation"
          :loading="starting"
          :disabled="withTimer && !minutes"
          @click="start"
        >
          Zur Beamer-Ansicht
        </UButton>
      </div>
    </template>
  </UModal>
</template>
