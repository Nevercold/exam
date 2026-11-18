<script setup lang="ts">
// Builds relational tables: name, columns with PK/FK, data rows.
// Used by students (answers) and teachers (solutions). Scrolls horizontally on small screens.
const tables = defineModel<SchemaTable[]>({ required: true })
const props = defineProps<{ disabled?: boolean, askCardinality?: boolean, lang?: UiLang }>()
// Students may switch to English; teachers always get German
const tx = computed(() => UI_TEXT[props.lang ?? 'de'])

const root = useTemplateRef<HTMLElement>('root')
// The data attribute may land on the input or on its wrapper, depending on the component
function focus(selector: string) {
  nextTick(() => {
    const el = root.value?.querySelector<HTMLElement>(selector)
    ;(el instanceof HTMLInputElement ? el : el?.querySelector('input'))?.focus()
  })
}

// New tables start without columns: the "Spalten anlegen" field is the obvious next step
function addTable() {
  if (tables.value.length >= LIMITS.tables) return
  tables.value.push({ name: '', columns: [], rows: [] })
  focus(`[data-table-name="${tables.value.length - 1}"]`)
}

// One click deletes, with "Rückgängig" in case it was an accident (a lost table costs a student minutes)
const toast = useToast()
function removeTable(ti: number) {
  const [removed] = tables.value.splice(ti, 1)
  pendingColumns.value = {}
  if (!removed) return
  toast.add({
    title: tx.value.tableDeleted(removed.name.trim() || String(ti + 1)),
    color: 'neutral',
    icon: 'i-lucide-trash-2',
    duration: 8000,
    actions: [{
      label: tx.value.undo,
      icon: 'i-lucide-undo-2',
      color: 'primary',
      variant: 'soft',
      onClick: () => { tables.value.splice(Math.min(ti, tables.value.length), 0, removed) },
    }],
  })
}

function moveTable(ti: number, delta: -1 | 1) {
  const j = ti + delta
  if (j < 0 || j >= tables.value.length) return
  ;[tables.value[ti], tables.value[j]] = [tables.value[j]!, tables.value[ti]!]
  pendingColumns.value = {}
}

// "KundenNr, Name, Ort" + Enter creates three columns at once
const pendingColumns = ref<Record<number, string>>({})
function submitColumns(t: SchemaTable, ti: number) {
  const names = splitColumnNames(pendingColumns.value[ti] ?? '')
  if (!names.length) return
  addColumns(t, names)
  pendingColumns.value[ti] = ''
}

// Enter in the last row adds the next row (like a spreadsheet)
function onCellEnter(t: SchemaTable, ti: number, ri: number) {
  if (ri === t.rows.length - 1) addRow(t)
  focus(`[data-cell="${ti}-${ri + 1}-0"]`)
}

function addColumn(t: SchemaTable) {
  if (t.columns.length >= LIMITS.columns) return
  t.columns.push({ name: '', pk: false, fk: null })
  for (const r of t.rows) r.push('')
}

function removeColumn(t: SchemaTable, ci: number) {
  t.columns.splice(ci, 1)
  for (const r of t.rows) r.splice(ci, 1)
}

function moveColumn(t: SchemaTable, ci: number, delta: -1 | 1) {
  const j = ci + delta
  if (j < 0 || j >= t.columns.length) return
  ;[t.columns[ci], t.columns[j]] = [t.columns[j]!, t.columns[ci]!]
  for (const r of t.rows) [r[ci], r[j]] = [r[j]!, r[ci]!]
}

function addRow(t: SchemaTable) {
  if (t.rows.length >= LIMITS.rows) return
  t.rows.push(t.columns.map(() => ''))
}

function removeRow(t: SchemaTable, ri: number) {
  t.rows.splice(ri, 1)
}

// --- foreign keys ---
const tableNames = computed(() => [...new Set(tables.value.map(t => t.name.trim()).filter(Boolean))])

function columnsOf(name: string | undefined) {
  const target = tables.value.find(t => t.name.trim().toLowerCase() === name?.trim().toLowerCase())
  return target ? [...new Set(target.columns.map(c => c.name.trim()).filter(Boolean))] : []
}

function setFkTable(c: SchemaColumn, table: string) {
  const cols = columnsOf(table)
  // Pre-select the column with the same name, the common case (KundenNr → Kunde.KundenNr)
  const same = cols.find(n => n.toLowerCase() === c.name.trim().toLowerCase())
  const cardinality = c.fk?.cardinality
  c.fk = { table, column: same ?? cols[0] ?? '', ...(cardinality ? { cardinality } : {}) }
}

// Labels name the actual tables, so the direction is unambiguous: "Abteilung 1 : n Bestellung"
function cardinalityItems(t: SchemaTable, c: SchemaColumn) {
  const parent = c.fk?.table || '?'
  const child = t.name.trim() || tx.value.thisTable
  return CARDINALITIES.map(value => ({ value, label: `${parent} ${value.replace(':', ' : ')} ${child}` }))
}

function toggleFk(c: SchemaColumn) {
  c.fk = c.fk ? null : { table: '', column: '' }
}
</script>

<template>
  <div
    ref="root"
    class="flex flex-col gap-4"
  >
    <!-- Empty state: explain the three steps once -->
    <div
      v-if="tables.length === 0 && !disabled"
      class="rounded-xl border-2 border-dashed border-default p-4 flex flex-col gap-3"
    >
      <p class="font-medium text-highlighted">
        {{ tx.howToTitle }}
      </p>
      <ol class="text-sm text-muted list-decimal pl-5 flex flex-col gap-1">
        <li
          v-for="([strong, rest], i) in tx.howTo"
          :key="i"
        >
          <strong class="text-default">{{ strong }}</strong> {{ rest }}
        </li>
      </ol>
      <p class="text-sm text-muted">
        {{ tx.howToMore }}
      </p>
    </div>

    <div
      v-for="(t, ti) in tables"
      :key="ti"
      class="rounded-xl border border-default bg-default p-3 flex flex-col gap-3"
    >
      <!-- DOM order = tab order: name → columns field → table actions (shown top right). Tab from the name must
           never land on "Tabelle löschen". -->
      <div class="grid grid-cols-[1fr_auto] items-center gap-2">
        <UInput
          v-model="t.name"
          :data-table-name="ti"
          :placeholder="tx.tableName"
          :disabled="disabled"
          :maxlength="100"
          class="col-start-1 row-start-1 min-w-0 font-semibold"
          :class="{ 'col-span-2': disabled }"
          :aria-label="tx.tableNameAria(ti + 1)"
          @keydown.enter.prevent="focus(`[data-new-columns='${ti}']`)"
        />

        <!-- Add columns: several at once, separated by commas -->
        <div
          v-if="!disabled"
          class="col-span-2 row-start-2 flex flex-col sm:flex-row gap-2"
        >
          <UInput
            v-model="pendingColumns[ti]"
            :data-new-columns="ti"
            :placeholder="t.columns.length ? tx.columnsMore : tx.columnsFirst"
            :maxlength="1000"
            :disabled="t.columns.length >= LIMITS.columns"
            class="flex-1 min-w-0"
            :aria-label="tx.columnsAria(ti + 1)"
            @keydown.enter.prevent="submitColumns(t, ti)"
          />
          <UButton
            icon="i-lucide-columns-3"
            :variant="t.columns.length ? 'soft' : 'solid'"
            :disabled="!pendingColumns[ti]?.trim() || t.columns.length >= LIMITS.columns"
            class="shrink-0 justify-center"
            @click="submitColumns(t, ti)"
          >
            {{ t.columns.length ? tx.addColumns : tx.createColumns }}
          </UButton>
        </div>

        <div
          v-if="!disabled"
          class="col-start-2 row-start-1 flex"
        >
          <UButton
            icon="i-lucide-arrow-up"
            size="sm"
            color="neutral"
            variant="ghost"
            :disabled="ti === 0"
            :aria-label="tx.tableUp"
            @click="moveTable(ti, -1)"
          />
          <UButton
            icon="i-lucide-arrow-down"
            size="sm"
            color="neutral"
            variant="ghost"
            :disabled="ti === tables.length - 1"
            :aria-label="tx.tableDown"
            @click="moveTable(ti, 1)"
          />
          <UButton
            icon="i-lucide-trash-2"
            size="sm"
            color="error"
            variant="ghost"
            :aria-label="tx.deleteTable"
            @click="removeTable(ti)"
          />
        </div>
      </div>
      <p
        v-if="t.columns.length === 0"
        class="text-sm text-muted"
      >
        {{ tx.noColumnsYet }}
      </p>
      <p
        v-else-if="!disabled"
        class="text-xs text-muted"
      >
        {{ tx.keyLegend }}
      </p>

      <div
        v-if="t.columns.length"
        class="overflow-x-auto -mx-3 px-3"
      >
        <table class="border-separate border-spacing-1">
          <thead>
            <tr>
              <th
                v-for="(c, ci) in t.columns"
                :key="ci"
                class="align-top min-w-44"
              >
                <div class="flex flex-col gap-1">
                  <UInput
                    v-model="c.name"
                    :data-col-name="`${ti}-${ci}`"
                    size="sm"
                    :placeholder="tx.columnName"
                    :disabled="disabled"
                    :maxlength="100"
                    :aria-label="tx.columnNameAria(ci + 1)"
                    :ui="{ base: c.pk ? 'font-bold underline' : 'font-medium' }"
                  />
                  <div class="flex items-center gap-0.5">
                    <UButton
                      size="xs"
                      :variant="c.pk ? 'solid' : 'outline'"
                      :color="c.pk ? 'primary' : 'neutral'"
                      :disabled="disabled"
                      :aria-pressed="c.pk"
                      @click="c.pk = !c.pk"
                    >
                      PK
                    </UButton>
                    <UPopover>
                      <UButton
                        size="xs"
                        :variant="c.fk ? 'solid' : 'outline'"
                        :color="c.fk ? 'info' : 'neutral'"
                        :disabled="disabled"
                      >
                        FK
                      </UButton>
                      <template #content>
                        <div class="p-3 flex flex-col gap-2 w-72 max-w-[calc(100vw-2rem)]">
                          <p class="text-sm font-medium">
                            {{ tx.foreignKey(c.name || '?') }}
                          </p>
                          <template v-if="c.fk">
                            <USelect
                              :model-value="c.fk.table || undefined"
                              :items="tableNames"
                              :placeholder="tx.table"
                              @update:model-value="setFkTable(c, $event as string)"
                            />
                            <USelect
                              :model-value="c.fk.column || undefined"
                              :items="columnsOf(c.fk.table)"
                              :placeholder="tx.column"
                              :disabled="!c.fk.table"
                              @update:model-value="c.fk!.column = $event as string"
                            />
                            <template v-if="askCardinality">
                              <USelect
                                :model-value="c.fk.cardinality"
                                :items="cardinalityItems(t, c)"
                                :placeholder="tx.cardinality"
                                :disabled="!c.fk.table"
                                :aria-label="tx.cardinality"
                                @update:model-value="c.fk!.cardinality = $event as Cardinality"
                              />
                              <p class="text-xs text-muted">
                                {{ tx.cardinalityHelp(c.fk.table || '?', t.name.trim() || tx.thisTable) }}
                              </p>
                            </template>
                          </template>
                          <UButton
                            size="sm"
                            :color="c.fk ? 'error' : 'primary'"
                            variant="soft"
                            block
                            @click="toggleFk(c)"
                          >
                            {{ c.fk ? tx.noForeignKey : tx.markForeignKey }}
                          </UButton>
                        </div>
                      </template>
                    </UPopover>
                    <span
                      v-if="c.fk?.table"
                      class="text-xs text-info truncate max-w-24"
                      :title="`${c.fk.table}.${c.fk.column}`"
                    >→ {{ c.fk.table }}<template v-if="askCardinality"> ({{ c.fk.cardinality ?? '?' }})</template></span>
                    <span class="flex-1" />
                    <!-- Visible for the mouse (students didn't find it in the menu); keyboard users get the same
                         actions in the menu, so these stay out of the tab order between the column fields -->
                    <template v-if="!disabled">
                      <UButton
                        icon="i-lucide-arrow-left"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        tabindex="-1"
                        :disabled="ci === 0"
                        :aria-label="tx.moveLeft"
                        :title="tx.moveLeft"
                        @click="moveColumn(t, ci, -1)"
                      />
                      <UButton
                        icon="i-lucide-arrow-right"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        tabindex="-1"
                        :disabled="ci === t.columns.length - 1"
                        :aria-label="tx.moveRight"
                        :title="tx.moveRight"
                        @click="moveColumn(t, ci, 1)"
                      />
                    </template>
                    <UDropdownMenu
                      v-if="!disabled"
                      :items="[[
                        { label: tx.moveLeft, icon: 'i-lucide-arrow-left', disabled: ci === 0, onSelect: () => moveColumn(t, ci, -1) },
                        { label: tx.moveRight, icon: 'i-lucide-arrow-right', disabled: ci === t.columns.length - 1, onSelect: () => moveColumn(t, ci, 1) },
                      ], [
                        { label: tx.deleteColumn, icon: 'i-lucide-trash-2', color: 'error', onSelect: () => removeColumn(t, ci) },
                      ]]"
                    >
                      <UButton
                        icon="i-lucide-ellipsis"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        :aria-label="tx.columnActions"
                      />
                    </UDropdownMenu>
                  </div>
                </div>
              </th>
              <th
                v-if="!disabled"
                class="align-top"
              >
                <UButton
                  icon="i-lucide-plus"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  class="whitespace-nowrap"
                  :disabled="t.columns.length >= LIMITS.columns"
                  @click="addColumn(t); focus(`[data-col-name='${ti}-${t.columns.length - 1}']`)"
                >
                  {{ tx.addColumn }}
                </UButton>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, ri) in t.rows"
              :key="ri"
            >
              <td
                v-for="(_, ci) in row"
                :key="ci"
              >
                <UInput
                  v-model="row[ci]"
                  :data-cell="`${ti}-${ri}-${ci}`"
                  size="sm"
                  :disabled="disabled"
                  :maxlength="LIMITS.cell"
                  :aria-label="tx.cellAria(ri + 1, t.columns[ci]?.name || `${tx.column} ${ci + 1}`)"
                  class="w-full"
                  @keydown.enter.prevent="onCellEnter(t, ti, ri)"
                />
              </td>
              <td v-if="!disabled">
                <UButton
                  icon="i-lucide-x"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :aria-label="tx.deleteRow"
                  @click="removeRow(t, ri)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <UButton
        v-if="!disabled && t.columns.length"
        icon="i-lucide-plus"
        size="sm"
        color="neutral"
        variant="soft"
        class="self-start"
        :disabled="t.rows.length >= LIMITS.rows"
        @click="addRow(t); focus(`[data-cell='${ti}-${t.rows.length - 1}-0']`)"
      >
        {{ tx.addRow }}
      </UButton>
    </div>

    <UButton
      v-if="!disabled"
      icon="i-lucide-table-2"
      :variant="tables.length ? 'outline' : 'solid'"
      class="self-start"
      :disabled="tables.length >= LIMITS.tables"
      @click="addTable"
    >
      {{ tx.addTable }}
    </UButton>
  </div>
</template>
