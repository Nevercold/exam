<script setup lang="ts">
// Teacher: translate all task texts of an exam into one language. Original (German) on the left, translation on
// the right. Table contents and solutions are not translated.
const translation = defineModel<Translation>({ required: true })
const props = defineProps<{ content: ExamContent, code: string, disabled?: boolean }>()
const emit = defineEmits<{ remove: [] }>()

const dir = computed(() => (isRtl(props.code) ? 'rtl' : 'ltr'))
const items = computed(() => props.content.blocks.filter(b => translatableText(b).trim()))

const KIND: Record<BlockType, string> = {
  'text': 'Aufgabentext',
  'table': 'Beschriftung der Tabelle',
  'schema-answer': 'Beschriftung des Antwortblocks',
  'freetext': 'Beschriftung des Antwortblocks',
}

function setBlock(id: string, value: string) {
  // Empty texts are dropped instead of stored as ""
  translation.value.blocks = value
    ? { ...translation.value.blocks, [id]: value }
    : Object.fromEntries(Object.entries(translation.value.blocks).filter(([k]) => k !== id))
}

const confirmRemove = ref(false)
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">
          Übersetzung: {{ languageName(code) }}
          <span class="text-muted font-normal">({{ languageName(code, code) }}, {{ code }})</span>
        </h2>
        <p class="text-sm text-muted max-w-2xl">
          Schüler können die Übersetzung selbst einschalten; sie steht dann unter dem deutschen Text. Antworten und PDF
          bleiben deutsch. Tabelleninhalte und Musterlösungen werden nicht übersetzt.
        </p>
      </div>
      <UButton
        v-if="!disabled"
        icon="i-lucide-trash-2"
        color="error"
        variant="soft"
        size="sm"
        @click="confirmRemove = true"
      >
        Sprache entfernen
      </UButton>
    </div>
    <UAlert
      v-if="confirmRemove"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`Alle Texte auf ${languageName(code)} löschen?`"
      :actions="[
        { label: 'Löschen', color: 'error', onClick: () => emit('remove') },
        { label: 'Abbrechen', color: 'neutral', variant: 'ghost', onClick: () => { confirmRemove = false } },
      ]"
    />

    <div class="grid lg:grid-cols-2 gap-x-6 gap-y-2 items-start">
      <p class="text-xs uppercase tracking-wide text-muted">
        Titel (Deutsch)
      </p>
      <p class="text-xs uppercase tracking-wide text-muted hidden lg:block">
        Übersetzung
      </p>
      <p class="font-semibold">
        {{ content.title }}
      </p>
      <UInput
        v-model="translation.title"
        :maxlength="LIMITS.title"
        :disabled="disabled"
        :dir="dir"
        :lang="code"
        :aria-label="`Titel auf ${languageName(code)}`"
        class="w-full mb-4"
      />

      <template
        v-for="b in items"
        :key="b.id"
      >
        <div class="min-w-0 lg:col-start-1 flex flex-col gap-1 pt-4 border-t border-default">
          <p class="text-xs uppercase tracking-wide text-muted">
            {{ KIND[b.type] }} <span class="font-mono normal-case">· {{ b.id }}</span>
          </p>
          <BlocksMarkdownView
            v-if="b.type === 'text'"
            :source="b.markdown"
            class="text-sm"
          />
          <p
            v-else
            class="font-medium"
          >
            {{ translatableText(b) }}
          </p>
        </div>
        <div class="min-w-0 lg:pt-4 lg:border-t border-default">
          <UTextarea
            v-if="b.type === 'text'"
            :model-value="translation.blocks[b.id] ?? ''"
            :rows="4"
            autoresize
            :maxlength="LIMITS.markdown"
            :disabled="disabled"
            :dir="dir"
            :lang="code"
            :placeholder="`Markdown auf ${languageName(code)}`"
            class="w-full"
            @update:model-value="setBlock(b.id, $event as string)"
          />
          <UInput
            v-else
            :model-value="translation.blocks[b.id] ?? ''"
            :maxlength="LIMITS.label"
            :disabled="disabled"
            :dir="dir"
            :lang="code"
            class="w-full"
            :aria-label="`${KIND[b.type]} auf ${languageName(code)}`"
            @update:model-value="setBlock(b.id, $event as string)"
          />
        </div>
      </template>
    </div>
  </div>
</template>
