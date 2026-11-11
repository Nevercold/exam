<script setup lang="ts">
// Read-only rendering of tables with PK/FK markers (preview, verification page).
defineProps<{ tables: SchemaTable[] }>()
</script>

<template>
  <div class="flex flex-col gap-4">
    <p
      v-if="tables.length === 0"
      class="text-sm text-muted italic"
    >
      Keine Tabellen
    </p>
    <div
      v-for="(t, ti) in tables"
      :key="ti"
      class="flex flex-col gap-1"
    >
      <p class="font-semibold">
        {{ t.name || `Tabelle ${ti + 1} (ohne Namen)` }}
      </p>
      <div class="overflow-x-auto rounded-lg border border-default">
        <table class="text-sm border-collapse min-w-full">
          <thead class="bg-elevated">
            <tr>
              <th
                v-for="(c, ci) in t.columns"
                :key="ci"
                class="px-3 py-2 text-left font-semibold border-b border-default whitespace-nowrap"
              >
                <span :class="{ underline: c.pk }">{{ c.name || '?' }}</span>
                <UBadge
                  v-if="c.pk"
                  size="sm"
                  variant="subtle"
                  class="ml-1"
                >
                  PK
                </UBadge>
                <UBadge
                  v-if="c.fk"
                  size="sm"
                  color="info"
                  variant="subtle"
                  class="ml-1"
                >
                  FK → {{ c.fk.table }}.{{ c.fk.column }}
                </UBadge>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, r) in t.rows"
              :key="r"
              class="odd:bg-default even:bg-elevated/40"
            >
              <td
                v-for="(cell, c) in row"
                :key="c"
                class="px-3 py-2 align-top border-b border-default"
              >
                {{ cell }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
