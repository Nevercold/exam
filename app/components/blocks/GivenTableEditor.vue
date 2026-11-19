<script setup lang="ts">
// Teacher: edit a given table cell by cell or paste it from a spreadsheet (tab-separated, first line = header).
const table = defineModel<GivenTable>({ required: true })
defineProps<{ disabled?: boolean }>()

const pasteOpen = ref(false)
const pasteText = ref('')
const pasteError = ref<string>()

function addColumn() {
  if (table.value.columns.length >= LIMITS.columns) return
  table.value.columns.push(`Spalte ${table.value.columns.length + 1}`)
  for (const r of table.value.rows) r.push('')
}

function removeColumn(ci: number) {
  table.value.columns.splice(ci, 1)
  for (const r of table.value.rows) r.splice(ci, 1)
}

// Asks first unless the column has no data
const confirmColumn = ref<number | null>(null)
function askRemoveColumn(ci: number) {
  if (table.value.rows.every(r => !r[ci]?.trim())) return removeColumn(ci)
  confirmColumn.value = ci
}
function runRemoveColumn() {
  if (confirmColumn.value !== null) removeColumn(confirmColumn.value)
  confirmColumn.value = null
}

function moveColumn(ci: number, delta: -1 | 1) {
  const j = ci + delta
  const cols = table.value.columns
  if (j < 0 || j >= cols.length) return
  ;[cols[ci], cols[j]] = [cols[j]!, cols[ci]!]
  for (const r of table.value.rows) [r[ci], r[j]] = [r[j]!, r[ci]!]
}

function addRow() {
  if (table.value.rows.length >= LIMITS.rows) return
  table.value.rows.push(table.value.columns.map(() => ''))
}

function applyPaste() {
  const lines = pasteText.value.replace(/\r/g, '').split('\n').filter(l => l.trim())
  const [header, ...rows] = lines.map(l => l.split('\t').map(c => c.trim()))
  if (!header || header.length < 1) return (pasteError.value = 'Keine Daten erkannt')
  if (header.length > LIMITS.columns || rows.length > LIMITS.rows) {
    return (pasteError.value = `Maximal ${LIMITS.columns} Spalten und ${LIMITS.rows} Zeilen`)
  }
  table.value = {
    columns: header,
    rows: rows.map(r => header.map((_, i) => r[i] ?? '')),
  }
  pasteOpen.value = false
  pasteText.value = ''
  pasteError.value = undefined
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="overflow-x-auto">
      <table class="border-separate border-spacing-1">
        <thead>
          <tr>
            <th
              v-for="(_, ci) in table.columns"
              :key="ci"
              class="min-w-44"
            >
              <div class="flex items-center gap-0.5">
                <UInput
                  v-model="table.columns[ci]"
                  size="sm"
                  :disabled="disabled"
                  :maxlength="LIMITS.cell"
                  class="flex-1 min-w-24 font-semibold"
                  :aria-label="`Spaltenname ${ci + 1}`"
                />
                <template v-if="!disabled">
                  <UButton
                    icon="i-lucide-arrow-left"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="ci === 0"
                    aria-label="Spalte nach links"
                    title="Nach links"
                    @click="moveColumn(ci, -1)"
                  />
                  <UButton
                    icon="i-lucide-arrow-right"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="ci === table.columns.length - 1"
                    aria-label="Spalte nach rechts"
                    title="Nach rechts"
                    @click="moveColumn(ci, 1)"
                  />
                </template>
                <UButton
                  v-if="!disabled"
                  icon="i-lucide-x"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="table.columns.length <= 1"
                  aria-label="Spalte löschen"
                  @click="askRemoveColumn(ci)"
                />
              </div>
            </th>
            <th v-if="!disabled">
              <UButton
                icon="i-lucide-plus"
                size="sm"
                color="neutral"
                variant="outline"
                aria-label="Spalte hinzufügen"
                @click="addColumn"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, ri) in table.rows"
            :key="ri"
          >
            <td
              v-for="(_, ci) in row"
              :key="ci"
            >
              <UTextarea
                v-model="row[ci]"
                size="sm"
                :rows="1"
                autoresize
                :disabled="disabled"
                :maxlength="LIMITS.cell"
                class="w-full"
                :aria-label="`Zeile ${ri + 1}, ${table.columns[ci]}`"
              />
            </td>
            <td v-if="!disabled">
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Zeile löschen"
                @click="table.rows.splice(ri, 1)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="!disabled"
      class="flex flex-wrap gap-2"
    >
      <UButton
        icon="i-lucide-plus"
        size="sm"
        color="neutral"
        variant="soft"
        @click="addRow"
      >
        Zeile
      </UButton>
      <UButton
        icon="i-lucide-clipboard-paste"
        size="sm"
        color="neutral"
        variant="soft"
        @click="pasteOpen = !pasteOpen"
      >
        Aus Tabellenkalkulation einfügen
      </UButton>
    </div>

    <div
      v-if="pasteOpen"
      class="flex flex-col gap-2 rounded-lg border border-default p-3"
    >
      <UFormField
        label="Zellen aus Excel/LibreOffice einfügen"
        help="Erste Zeile = Spaltennamen. Ersetzt die ganze Tabelle."
        :error="pasteError"
      >
        <UTextarea
          v-model="pasteText"
          :rows="5"
          class="w-full font-mono"
        />
      </UFormField>
      <UButton
        size="sm"
        class="self-start"
        :disabled="!pasteText.trim()"
        @click="applyPaste"
      >
        Übernehmen
      </UButton>
    </div>

    <UModal
      :open="confirmColumn !== null"
      :title="`Spalte „${table.columns[confirmColumn ?? 0] || (confirmColumn ?? 0) + 1}“ löschen?`"
      description="Alle Einträge darin gehen verloren."
      @update:open="!$event && (confirmColumn = null)"
    >
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            @click="confirmColumn = null"
          >
            Abbrechen
          </UButton>
          <UButton
            color="error"
            icon="i-lucide-trash-2"
            @click="runRemoveColumn"
          >
            Löschen
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
