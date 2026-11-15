<script setup lang="ts">
// Student: one block of the exam. Answer blocks write into `answers[block.id]`.
// `translation`: the block's text in the language the student switched on, shown below the German original.
const props = defineProps<{
  block: StudentBlock
  blocks: StudentBlock[]
  disabled?: boolean
  lang?: UiLang
  translation?: { code: string, text: string } | null
}>()
const answers = defineModel<Answers>('answers', { required: true })
const tx = computed(() => UI_TEXT[props.lang ?? 'de'])

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

const askCardinality = computed(() => props.block.type === 'schema-answer' && !!props.block.askCardinality)
const hints = computed(() => props.block.type === 'schema-answer'
  ? schemaHints(tables.value, { askCardinality: askCardinality.value, lang: props.lang })
  : [])

const source = computed(() => {
  if (props.block.type !== 'schema-answer' || !props.block.copyFrom) return null
  const b = props.blocks.find(x => x.id === (props.block as { copyFrom: string }).copyFrom)
  return b?.type === 'schema-answer' ? b : null
})

const confirmCopy = ref(false)
function copyFromSource() {
  if (!source.value) return
  const from = answers.value[source.value.id]
  tables.value = Array.isArray(from) ? copySchemaTables(toRaw(from)) : []
  confirmCopy.value = false
}
function requestCopy() {
  if (tables.value.length === 0) copyFromSource()
  else confirmCopy.value = true
}

const maxLength = computed(() => (props.block.type === 'freetext' ? props.block.maxLength : null) ?? LIMITS.freetext)
const points = computed(() => (props.block.type === 'schema-answer' || props.block.type === 'freetext') && props.block.points
  ? ` (${pointsLabel(props.block.points, props.lang)})`
  : '')

const tr = computed(() => (props.translation?.text.trim() ? props.translation : null))
const trAttrs = computed(() => tr.value ? { lang: tr.value.code, dir: isRtl(tr.value.code) ? 'rtl' : 'ltr' } : {})
const trLabel = computed(() => tr.value ? tx.value.translationLabel(languageName(tr.value.code, tr.value.code)) : '')
</script>

<template>
  <section class="flex flex-col gap-3">
    <template v-if="block.type === 'text'">
      <BlocksMarkdownView :source="block.markdown" />
      <div
        v-if="tr"
        class="rounded-lg border-s-4 border-info bg-info/5 px-4 py-3"
      >
        <p class="text-xs font-medium text-info mb-1">
          {{ trLabel }}
        </p>
        <BlocksMarkdownView
          :source="tr.text"
          v-bind="trAttrs"
        />
      </div>
    </template>

    <template v-else-if="block.type === 'table'">
      <BlocksGivenTableView
        :table="block.table"
        :caption="block.caption"
      />
      <p
        v-if="tr"
        class="text-sm text-info -mt-1"
        v-bind="trAttrs"
      >
        {{ tr.text }}
      </p>
    </template>

    <template v-else-if="block.type === 'schema-answer'">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="font-semibold text-highlighted">
            {{ block.label || tx.yourTables }}
            <span
              v-if="points"
              class="font-normal text-muted"
            >{{ points }}</span>
          </h3>
          <p
            v-if="tr"
            class="text-sm text-info"
            v-bind="trAttrs"
          >
            {{ tr.text }}
          </p>
        </div>
        <UButton
          v-if="source && !disabled"
          icon="i-lucide-copy"
          size="sm"
          color="neutral"
          variant="soft"
          @click="requestCopy"
        >
          {{ tx.copyFrom(source.label || tx.previousStep) }}
        </UButton>
      </div>
      <UAlert
        v-if="confirmCopy"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="tx.replaceWarning"
        :actions="[
          { label: tx.replace, color: 'warning', onClick: copyFromSource },
          { label: tx.cancel, color: 'neutral', variant: 'ghost', onClick: () => { confirmCopy = false } },
        ]"
      />
      <BlocksSchemaTablesInput
        v-model="tables"
        :disabled="disabled"
        :ask-cardinality="askCardinality"
        :lang="lang"
      />
      <BlocksRelationDiagram
        v-if="askCardinality && tables.length"
        :tables="tables"
        :lang="lang"
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
        :label="`${block.label || tx.yourAnswer}${points}`"
        :description="tr?.text"
        :help="tx.characters(text.length, maxLength)"
        :ui="{ label: 'font-semibold text-highlighted', description: 'text-info' }"
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
