<script setup lang="ts">
// Relational model as a diagram (boxes, lines with 1/n) plus the relationships as text.
// Text is rendered through the template (escaped); the PDF uses diagramSvg() with the same layout.
const props = defineProps<{ tables: SchemaTable[], lang?: UiLang }>()
const tx = computed(() => UI_TEXT[props.lang ?? 'de'])

const layout = computed(() => diagramLayout(props.tables))
const rels = computed(() => relationships(props.tables))
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-if="layout.boxes.length"
      class="overflow-x-auto rounded-lg border border-default bg-white p-2"
    >
      <svg
        :width="layout.width"
        :height="layout.height"
        :viewBox="`0 0 ${layout.width} ${layout.height}`"
        class="block mx-auto"
        role="img"
        :aria-label="tx.relationalModel"
        font-family="inherit"
      >
        <g
          v-for="(e, i) in layout.edges"
          :key="`e${i}`"
        >
          <polyline
            :points="e.points.map(p => p.join(',')).join(' ')"
            fill="none"
            stroke="#52525b"
            stroke-width="1.2"
          />
          <text
            v-for="(l, li) in [e.parentLabel, e.childLabel]"
            :key="li"
            :x="l.x"
            :y="l.y"
            :font-size="DIAGRAM.font"
            font-weight="bold"
            fill="#0369a1"
            text-anchor="middle"
          >{{ l.text }}</text>
        </g>
        <g
          v-for="(b, i) in layout.boxes"
          :key="`b${i}`"
        >
          <rect
            :x="b.x"
            :y="b.y"
            :width="b.w"
            :height="b.h"
            fill="#ffffff"
            stroke="#52525b"
          />
          <rect
            :x="b.x"
            :y="b.y"
            :width="b.w"
            :height="DIAGRAM.header"
            fill="#f4f4f5"
            stroke="#52525b"
          />
          <text
            :x="b.x + DIAGRAM.padX"
            :y="b.y + 17"
            :font-size="DIAGRAM.font"
            font-weight="bold"
            fill="#18181b"
          >{{ b.name }}</text>
          <template
            v-for="(c, ci) in b.columns"
            :key="ci"
          >
            <text
              :x="b.x + DIAGRAM.padX"
              :y="b.y + DIAGRAM.header + (ci + 1) * DIAGRAM.row - 5"
              :font-size="DIAGRAM.font"
              fill="#18181b"
              :text-decoration="c.pk ? 'underline' : undefined"
            >{{ c.name }}</text>
            <text
              v-if="c.pk || c.fk"
              :x="b.x + b.w - DIAGRAM.padX"
              :y="b.y + DIAGRAM.header + (ci + 1) * DIAGRAM.row - 5"
              :font-size="DIAGRAM.font - 3"
              fill="#0369a1"
              text-anchor="end"
            >{{ [c.pk && 'PK', c.fk && 'FK'].filter(Boolean).join(' ') }}</text>
          </template>
        </g>
      </svg>
    </div>
    <div class="text-sm">
      <p class="font-medium mb-1">
        {{ tx.relationships }}
      </p>
      <p
        v-if="rels.length === 0"
        class="text-muted italic"
      >
        {{ tx.noRelationships }}
      </p>
      <ul
        v-else
        class="flex flex-col gap-0.5"
      >
        <li
          v-for="(r, i) in rels"
          :key="i"
          :class="{ 'text-warning': !r.cardinality }"
        >
          {{ relationshipText(r, lang) }}
        </li>
      </ul>
    </div>
  </div>
</template>
