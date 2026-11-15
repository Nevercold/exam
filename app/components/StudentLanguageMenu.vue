<script setup lang="ts">
// Student language menu: interface (Deutsch/English) and, if the exam has any, the task translation.
// The translation is off by default and must be switched on by the student.
const props = defineProps<{ translations?: string[] }>()
const { ui, t, translation, setUi, setTranslation } = useStudentLanguage()

const active = computed(() => (translation.value && props.translations?.includes(translation.value) ? translation.value : null))
// Native name first ("українська"), German name for the teacher looking over the shoulder
const label = (code: string) => {
  const native = languageName(code, code)
  const german = languageName(code)
  return native.toLowerCase() === german.toLowerCase() ? native : `${native} (${german})`
}
const buttonText = computed(() => [ui.value.toUpperCase(), active.value?.toUpperCase()].filter(Boolean).join(' + '))
</script>

<template>
  <UPopover :content="{ align: 'end' }">
    <UButton
      icon="i-lucide-languages"
      color="neutral"
      variant="soft"
      class="shrink-0"
      :aria-label="t.language"
    >
      <span class="text-xs font-semibold">{{ buttonText }}</span>
    </UButton>
    <template #content>
      <div class="p-3 flex flex-col gap-4 w-72 max-w-[calc(100vw-2rem)]">
        <div class="flex flex-col gap-1.5">
          <p class="text-xs font-medium text-muted uppercase tracking-wide">
            Oberfläche / Interface
          </p>
          <div class="flex gap-2">
            <UButton
              v-for="l in (['de', 'en'] as const)"
              :key="l"
              :variant="ui === l ? 'solid' : 'outline'"
              :color="ui === l ? 'primary' : 'neutral'"
              size="sm"
              class="flex-1 justify-center"
              :aria-pressed="ui === l"
              @click="setUi(l)"
            >
              {{ l === 'de' ? 'Deutsch' : 'English' }}
            </UButton>
          </div>
        </div>

        <div
          v-if="translations?.length"
          class="flex flex-col gap-1.5"
        >
          <p class="text-xs font-medium text-muted uppercase tracking-wide">
            {{ t.taskTranslation }}
          </p>
          <UButton
            :variant="!active ? 'solid' : 'outline'"
            :color="!active ? 'primary' : 'neutral'"
            size="sm"
            :aria-pressed="!active"
            @click="setTranslation(null)"
          >
            {{ t.translationOff }}
          </UButton>
          <UButton
            v-for="code in translations"
            :key="code"
            :variant="active === code ? 'solid' : 'outline'"
            :color="active === code ? 'primary' : 'neutral'"
            size="sm"
            :aria-pressed="active === code"
            :lang="code"
            @click="setTranslation(code)"
          >
            {{ label(code) }}
          </UButton>
          <p class="text-xs text-muted">
            {{ t.translationHelp }}
          </p>
        </div>
      </div>
    </template>
  </UPopover>
</template>
