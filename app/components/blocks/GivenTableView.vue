<script setup lang="ts">
defineProps<{ table: GivenTable, caption?: string }>()
</script>

<template>
  <figure class="flex flex-col gap-2">
    <figcaption
      v-if="caption"
      class="font-medium"
    >
      {{ caption }}
    </figcaption>
    <div class="overflow-x-auto rounded-lg border border-default">
      <table class="text-sm border-collapse min-w-full">
        <thead class="bg-elevated">
          <tr>
            <th
              v-for="(col, i) in table.columns"
              :key="i"
              class="px-3 py-2 text-left font-semibold border-b border-default whitespace-nowrap"
            >
              {{ col }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, r) in table.rows"
            :key="r"
            class="odd:bg-default even:bg-elevated/40"
          >
            <td
              v-for="(cell, c) in row"
              :key="c"
              class="px-3 py-2 align-top border-b border-default min-w-24 max-w-md"
            >
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </figure>
</template>
