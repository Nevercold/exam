<script setup lang="ts">
// Teacher: edits one block including its model solution.
const block = defineModel<Block>({ required: true })
const props = defineProps<{ blocks: Block[], index: number, disabled?: boolean }>()

const preview = ref(false)

const earlierSchemaBlocks = computed(() => props.blocks.slice(0, props.index)
  .filter(b => b.type === 'schema-answer')
  .map(b => ({ label: b.label || b.id, value: b.id })))

// Reka's Select doesn't allow an empty string as item value
const NONE = '__none__'
const copyFromItems = computed(() => [{ label: 'Keine Übernahme', value: NONE }, ...earlierSchemaBlocks.value])

function copySolutionFromSource() {
  if (block.value.type !== 'schema-answer' || !block.value.copyFrom) return
  const source = props.blocks.find(b => b.id === (block.value as { copyFrom: string }).copyFrom)
  if (source?.type === 'schema-answer' && source.solution) block.value.solution = copySchemaTables(toRaw(source.solution))
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- text -->
    <template v-if="block.type === 'text'">
      <div class="flex items-center justify-between">
        <span class="text-sm text-muted">Markdown: **fett**, *kursiv*, ## Überschrift, - Liste</span>
        <USwitch
          v-model="preview"
          label="Vorschau"
        />
      </div>
      <BlocksMarkdownView
        v-if="preview"
        :source="block.markdown"
        class="rounded-lg border border-default p-4"
      />
      <UTextarea
        v-else
        v-model="block.markdown"
        :rows="8"
        autoresize
        :maxlength="LIMITS.markdown"
        :disabled="disabled"
        class="w-full"
      />
    </template>

    <!-- given table -->
    <template v-else-if="block.type === 'table'">
      <UFormField label="Beschriftung">
        <UInput
          v-model="block.caption"
          :maxlength="LIMITS.label"
          :disabled="disabled"
          placeholder="z. B. Unnormalisierte Tabelle"
          class="w-full"
        />
      </UFormField>
      <BlocksGivenTableEditor
        v-model="block.table"
        :disabled="disabled"
      />
    </template>

    <!-- schema answer -->
    <template v-else-if="block.type === 'schema-answer'">
      <div class="grid sm:grid-cols-2 gap-4">
        <UFormField
          label="Beschriftung"
          help="Steht über dem Antwortfeld und im PDF"
        >
          <UInput
            v-model="block.label"
            :maxlength="LIMITS.label"
            :disabled="disabled"
            placeholder="z. B. Tabellen in 1NF"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Übernahme anbieten aus"
          help="Schüler können die Tabellen aus diesem Block übernehmen"
        >
          <USelect
            :model-value="block.copyFrom ?? NONE"
            :items="copyFromItems"
            :disabled="disabled || earlierSchemaBlocks.length === 0"
            class="w-full"
            @update:model-value="(block as { copyFrom: string | null }).copyFrom = $event === NONE ? null : $event as string"
          />
        </UFormField>
      </div>
      <USwitch
        :model-value="!!block.askCardinality"
        :disabled="disabled"
        label="Kardinalitäten abfragen"
        description="Schüler geben bei jedem Fremdschlüssel 1:1 oder 1:n an; darunter erscheint das Relationenmodell als Diagramm."
        @update:model-value="(block as { askCardinality?: boolean }).askCardinality = $event || undefined"
      />

      <USeparator label="Musterlösung (nur für Lehrkräfte sichtbar)" />
      <template v-if="block.solution">
        <BlocksSchemaTablesInput
          v-model="block.solution"
          :disabled="disabled"
          :ask-cardinality="!!block.askCardinality"
        />
        <BlocksRelationDiagram
          v-if="block.askCardinality && block.solution.length"
          :tables="block.solution"
        />
        <div
          v-if="!disabled"
          class="flex flex-wrap gap-2"
        >
          <UButton
            v-if="block.copyFrom"
            icon="i-lucide-copy"
            size="sm"
            color="neutral"
            variant="soft"
            @click="copySolutionFromSource"
          >
            Lösung aus vorherigem Schritt übernehmen
          </UButton>
          <UButton
            icon="i-lucide-trash-2"
            size="sm"
            color="error"
            variant="soft"
            @click="block.solution = null"
          >
            Musterlösung entfernen
          </UButton>
        </div>
      </template>
      <div
        v-else-if="!disabled"
        class="flex flex-wrap gap-2"
      >
        <UButton
          icon="i-lucide-plus"
          variant="soft"
          @click="block.solution = []"
        >
          Musterlösung anlegen
        </UButton>
        <UButton
          v-if="block.copyFrom"
          icon="i-lucide-copy"
          color="neutral"
          variant="soft"
          @click="copySolutionFromSource"
        >
          Aus vorherigem Schritt übernehmen
        </UButton>
      </div>
    </template>

    <!-- freetext -->
    <template v-else-if="block.type === 'freetext'">
      <div class="grid sm:grid-cols-[1fr_12rem] gap-4">
        <UFormField label="Beschriftung">
          <UInput
            v-model="block.label"
            :maxlength="LIMITS.label"
            :disabled="disabled"
            placeholder="z. B. Begründung 1NF"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Max. Zeichen"
          help="leer = 20.000"
        >
          <UInputNumber
            :model-value="block.maxLength ?? undefined"
            :min="10"
            :max="LIMITS.freetext"
            :disabled="disabled"
            class="w-full"
            @update:model-value="(block as { maxLength: number | null }).maxLength = $event ?? null"
          />
        </UFormField>
      </div>
      <UFormField label="Musterlösung (nur für Lehrkräfte sichtbar)">
        <UTextarea
          :model-value="block.solution ?? ''"
          :rows="3"
          autoresize
          :maxlength="LIMITS.freetext"
          :disabled="disabled"
          class="w-full"
          @update:model-value="(block as { solution: string | null }).solution = ($event as string) || null"
        />
      </UFormField>
    </template>
  </div>
</template>
