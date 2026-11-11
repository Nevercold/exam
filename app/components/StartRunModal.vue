<script setup lang="ts">
// Starts a run of a released exam: with a timer (minutes) or ended manually.
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
    toast.add({ title: errorMessage(err, 'Start fehlgeschlagen'), color: 'error' })
  }
  finally {
    starting.value = false
  }
}
</script>

<template>
  <UModal
    :open="!!examId"
    title="Prüfung starten"
    :description="title"
    @update:open="(v: boolean) => { if (!v) emit('close') }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <USwitch
          v-model="withTimer"
          label="Mit Timer"
          description="Ohne Timer beendest du die Prüfung selbst. Danach erstellte PDFs sind nicht signiert."
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
          icon="i-lucide-play"
          :loading="starting"
          :disabled="withTimer && !minutes"
          @click="start"
        >
          Starten
        </UButton>
      </div>
    </template>
  </UModal>
</template>
