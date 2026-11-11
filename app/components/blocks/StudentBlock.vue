<script setup lang="ts">
// Student: one block of the exam. Answer blocks write into `answers[block.id]`.
const props = defineProps<{ block: StudentBlock, blocks: StudentBlock[], disabled?: boolean }>()
const answers = defineModel<Answers>('answers', { required: true })

const tables = computed({
  get: () => (answers.value[props.block.id] as SchemaTable[] | undefined) ?? [],
  set: v => (answers.value[props.block.id] = v),
})
const text = computed({
  get: () => (answers.value[props.block.id] as string | undefined) ?? '',
  set: v => (answers.value[props.block.id] = v),
})

// Ensure the array exists so nested edits in SchemaTablesInput are reactive
if (props.block.type === 'schema-answer' && !Array.isArray(answers.value[props.block.id])) {
  answers.value[props.block.id] = []
}

const hints = computed(() => props.block.type === 'schema-answer' ? schemaHints(tables.value) : [])

const source = computed(() => {
  if (props.block.type !== 'schema-answer' || !props.block.copyFrom) return null
  const b = props.blocks.find(x => x.id === (props.block as { copyFrom: string }).copyFrom)
  return b?.type === 'schema-answer' ? b : null
})

const confirmCopy = ref(false)
function copyFromSource() {
  if (!source.value) return
  const from = answers.value[source.value.id]
  tables.value = Array.isArray(from) ? structuredClone(toRaw(from)) : []
  confirmCopy.value = false
}
function requestCopy() {
  if (tables.value.length === 0) copyFromSource()
  else confirmCopy.value = true
}

const maxLength = computed(() => (props.block.type === 'freetext' ? props.block.maxLength : null) ?? LIMITS.freetext)
</script>

<template>
  <section class="flex flex-col gap-3">
    <BlocksMarkdownView
      v-if="block.type === 'text'"
      :source="block.markdown"
    />

    <BlocksGivenTableView
      v-else-if="block.type === 'table'"
      :table="block.table"
      :caption="block.caption"
    />

    <template v-else-if="block.type === 'schema-answer'">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-semibold text-highlighted">
          {{ block.label || 'Deine Tabellen' }}
        </h3>
        <UButton
          v-if="source && !disabled"
          icon="i-lucide-copy"
          size="sm"
          color="neutral"
          variant="soft"
          @click="requestCopy"
        >
          Tabellen aus „{{ source.label || 'vorherigem Schritt' }}“ übernehmen
        </UButton>
      </div>
      <UAlert
        v-if="confirmCopy"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Deine Tabellen in diesem Schritt werden ersetzt."
        :actions="[
          { label: 'Ersetzen', color: 'warning', onClick: copyFromSource },
          { label: 'Abbrechen', color: 'neutral', variant: 'ghost', onClick: () => { confirmCopy = false } },
        ]"
      />
      <BlocksSchemaTablesInput
        v-model="tables"
        :disabled="disabled"
      />
      <ul
        v-if="hints.length && !disabled"
        class="text-sm flex flex-col gap-1 rounded-lg bg-warning/10 p-3"
        aria-live="polite"
      >
        <li
          v-for="(h, i) in hints"
          :key="i"
          class="flex gap-2"
        >
          <UIcon
            name="i-lucide-info"
            class="size-4 shrink-0 mt-0.5 text-warning"
          />
          {{ h.message }}
        </li>
      </ul>
    </template>

    <template v-else-if="block.type === 'freetext'">
      <UFormField
        :label="block.label || 'Deine Antwort'"
        :help="`${text.length} / ${maxLength} Zeichen`"
        :ui="{ label: 'font-semibold text-highlighted' }"
      >
        <UTextarea
          v-model="text"
          :rows="4"
          autoresize
          :maxlength="maxLength"
          :disabled="disabled"
          class="w-full"
        />
      </UFormField>
    </template>
  </section>
</template>
