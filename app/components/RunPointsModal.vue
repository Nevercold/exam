<script setup lang="ts">
// Sets the maximum points of one run afterwards. Changes only this run (its snapshot), not the exam.
import type { RunPointsView } from '~~/server/utils/runs'

const props = defineProps<{ runId: string | null }>()
const emit = defineEmits<{ close: [] }>()
const toast = useToast()

const view = ref<RunPointsView | null>(null)
const points = ref<Record<string, number | null>>({})
const loading = ref(false)
const saving = ref(false)

watch(() => props.runId, async (id) => {
  view.value = null
  if (!id) return
  loading.value = true
  try {
    apply(await $fetch<RunPointsView>(`/api/runs/${id}/points`))
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
    emit('close')
  }
  finally {
    loading.value = false
  }
}, { immediate: true })

function apply(v: RunPointsView) {
  view.value = v
  points.value = Object.fromEntries(v.blocks.map(b => [b.id, b.points]))
}

async function save() {
  if (!props.runId) return
  saving.value = true
  try {
    apply(await $fetch<RunPointsView>(`/api/runs/${props.runId}/points`, { method: 'PUT', body: { points: points.value } }))
    toast.add({ title: 'Punkte gespeichert', description: 'Gilt ab sofort für „PDF prüfen“ und die KI-Bewertung dieses Durchgangs.', icon: 'i-lucide-circle-check', color: 'success' })
    emit('close')
  }
  catch (err) {
    toast.add({ title: errorMessage(err, 'Speichern fehlgeschlagen'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :open="!!runId"
    title="Punkte des Durchgangs"
    :description="view?.title"
    @update:open="(v: boolean) => { if (!v) emit('close') }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <p class="text-sm text-muted">
          Ändert nur diesen Durchgang, nicht die Prüfung. Bereits abgegebene PDFs bleiben gültig, die Punkte sind
          nicht Teil der Signatur. Auf schon exportierten PDFs stehen weiter die alten Punkte.
        </p>
        <UIcon
          v-if="loading"
          name="i-lucide-loader-circle"
          class="size-5 animate-spin text-muted"
        />
        <p
          v-else-if="view && !view.blocks.length"
          class="text-sm text-muted"
        >
          Dieser Durchgang hat keine Antwortblöcke.
        </p>
        <UFormField
          v-for="b in view?.blocks"
          :key="b.id"
          :label="b.label"
        >
          <UInputNumber
            :model-value="points[b.id] ?? undefined"
            :min="0.5"
            :max="100"
            :step="0.5"
            placeholder="keine"
            class="w-full sm:max-w-56"
            @update:model-value="points[b.id] = $event ?? null"
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
          icon="i-lucide-save"
          :loading="saving"
          :disabled="!view?.blocks.length"
          @click="save"
        >
          Speichern
        </UButton>
      </div>
    </template>
  </UModal>
</template>
