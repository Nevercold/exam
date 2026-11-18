<script setup lang="ts">
// Projector controls to extend the timer: quick buttons plus a custom number of minutes.
defineProps<{ loading?: boolean }>()
const emit = defineEmits<{ extend: [minutes: number] }>()

const open = ref(false)
const custom = ref(20)
function submitCustom() {
  if (!Number.isInteger(custom.value) || custom.value < 1 || custom.value > 120) return
  emit('extend', custom.value)
  open.value = false
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-center gap-2">
    <span class="text-muted">Zeit verlängern:</span>
    <UButton
      v-for="m in [5, 10, 15]"
      :key="m"
      color="neutral"
      variant="outline"
      size="lg"
      :disabled="loading"
      @click="emit('extend', m)"
    >
      +{{ m }} min
    </UButton>
    <UPopover v-model:open="open">
      <UButton
        color="neutral"
        variant="outline"
        size="lg"
        :disabled="loading"
      >
        Andere …
      </UButton>
      <template #content>
        <!-- Enter/Esc must not reach the projector's global shortcuts -->
        <form
          class="p-3 flex items-end gap-2"
          @submit.prevent="submitCustom"
        >
          <UFormField label="Minuten">
            <UInputNumber
              v-model="custom"
              :min="1"
              :max="120"
              class="w-28"
              autofocus
              @keydown.enter.stop
              @keydown.esc.stop
            />
          </UFormField>
          <UButton
            type="submit"
            icon="i-lucide-timer"
            :loading="loading"
          >
            Verlängern
          </UButton>
        </form>
      </template>
    </UPopover>
  </div>
</template>
