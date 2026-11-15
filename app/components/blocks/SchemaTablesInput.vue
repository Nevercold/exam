<script setup lang="ts">
// Builds relational tables: name, columns with PK/FK, data rows.
// Used by students (answers) and teachers (solutions). Scrolls horizontally on small screens.
const tables = defineModel<SchemaTable[]>({ required: true })
defineProps<{ disabled?: boolean, askCardinality?: boolean }>()

function addTable() {
  tables.value.push({ name: '', columns: [{ name: '', pk: true, fk: null }], rows: [['']] })
}

function removeTable(ti: number) {
  tables.value.splice(ti, 1)
}

function moveTable(ti: number, delta: -1 | 1) {
  const j = ti + delta
  if (j < 0 || j >= tables.value.length) return
  ;[tables.value[ti], tables.value[j]] = [tables.value[j]!, tables.value[ti]!]
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
  const child = t.name.trim() || 'diese Tabelle'
  return CARDINALITIES.map(value => ({ value, label: `${parent} ${value.replace(':', ' : ')} ${child}` }))
}

function toggleFk(c: SchemaColumn) {
  c.fk = c.fk ? null : { table: '', column: '' }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-for="(t, ti) in tables"
      :key="ti"
      class="rounded-xl border border-default bg-default p-3 flex flex-col gap-3"
    >
      <div class="flex items-center gap-2">
        <UInput
          v-model="t.name"
          placeholder="Tabellenname"
          :disabled="disabled"
          :maxlength="100"
          class="flex-1 min-w-0 font-semibold"
          :aria-label="`Name von Tabelle ${ti + 1}`"
        />
        <div
          v-if="!disabled"
          class="flex shrink-0"
        >
          <UButton
            icon="i-lucide-arrow-up"
            size="sm"
            color="neutral"
            variant="ghost"
            :disabled="ti === 0"
            aria-label="Tabelle nach oben"
            @click="moveTable(ti, -1)"
          />
          <UButton
            icon="i-lucide-arrow-down"
            size="sm"
            color="neutral"
            variant="ghost"
            :disabled="ti === tables.length - 1"
            aria-label="Tabelle nach unten"
            @click="moveTable(ti, 1)"
          />
          <UButton
            icon="i-lucide-trash-2"
            size="sm"
            color="error"
            variant="ghost"
            aria-label="Tabelle löschen"
            @click="removeTable(ti)"
          />
        </div>
      </div>

      <div class="overflow-x-auto -mx-3 px-3">
        <table class="border-separate border-spacing-1">
          <thead>
            <tr>
              <th
                v-for="(c, ci) in t.columns"
                :key="ci"
                class="align-top min-w-36"
              >
                <div class="flex flex-col gap-1">
                  <UInput
                    v-model="c.name"
                    size="sm"
                    placeholder="Spalte"
                    :disabled="disabled"
                    :maxlength="100"
                    :aria-label="`Spaltenname ${ci + 1}`"
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
                            Fremdschlüssel „{{ c.name || '?' }}“
                          </p>
                          <template v-if="c.fk">
                            <USelect
                              :model-value="c.fk.table || undefined"
                              :items="tableNames"
                              placeholder="Tabelle"
                              @update:model-value="setFkTable(c, $event as string)"
                            />
                            <USelect
                              :model-value="c.fk.column || undefined"
                              :items="columnsOf(c.fk.table)"
                              placeholder="Spalte"
                              :disabled="!c.fk.table"
                              @update:model-value="c.fk!.column = $event as string"
                            />
                            <template v-if="askCardinality">
                              <USelect
                                :model-value="c.fk.cardinality"
                                :items="cardinalityItems(t, c)"
                                placeholder="Kardinalität"
                                :disabled="!c.fk.table"
                                aria-label="Kardinalität"
                                @update:model-value="c.fk!.cardinality = $event as Cardinality"
                              />
                              <p class="text-xs text-muted">
                                1 : n heißt: Zu einem Datensatz in „{{ c.fk.table || '?' }}“ gehören beliebig viele in „{{ t.name.trim() || 'dieser Tabelle' }}“.
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
                            {{ c.fk ? 'Kein Fremdschlüssel' : 'Als Fremdschlüssel markieren' }}
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
                    <UDropdownMenu
                      v-if="!disabled"
                      :items="[[
                        { label: 'Nach links', icon: 'i-lucide-arrow-left', disabled: ci === 0, onSelect: () => moveColumn(t, ci, -1) },
                        { label: 'Nach rechts', icon: 'i-lucide-arrow-right', disabled: ci === t.columns.length - 1, onSelect: () => moveColumn(t, ci, 1) },
                      ], [
                        { label: 'Spalte löschen', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => removeColumn(t, ci) },
                      ]]"
                    >
                      <UButton
                        icon="i-lucide-ellipsis"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        aria-label="Spaltenaktionen"
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
                  :disabled="t.columns.length >= LIMITS.columns"
                  aria-label="Spalte hinzufügen"
                  @click="addColumn(t)"
                />
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
                  size="sm"
                  :disabled="disabled"
                  :maxlength="LIMITS.cell"
                  :aria-label="`Zeile ${ri + 1}, ${t.columns[ci]?.name || `Spalte ${ci + 1}`}`"
                  class="w-full"
                />
              </td>
              <td v-if="!disabled">
                <UButton
                  icon="i-lucide-x"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  aria-label="Zeile löschen"
                  @click="removeRow(t, ri)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <UButton
        v-if="!disabled"
        icon="i-lucide-plus"
        size="sm"
        color="neutral"
        variant="soft"
        class="self-start"
        :disabled="t.rows.length >= LIMITS.rows || t.columns.length === 0"
        @click="addRow(t)"
      >
        Zeile
      </UButton>
    </div>

    <UButton
      v-if="!disabled"
      icon="i-lucide-table-2"
      variant="outline"
      class="self-start"
      :disabled="tables.length >= LIMITS.tables"
      @click="addTable"
    >
      Tabelle hinzufügen
    </UButton>
  </div>
</template>
