<script setup lang="ts">
// Same artwork as public/favicon.svg (kept inline: no extra request on slow Wi-Fi)
defineProps<{ size?: 'sm' | 'lg', iconOnly?: boolean }>()
</script>

<template>
  <span
    class="inline-flex items-center gap-2 font-bold tracking-tight"
    :class="size === 'lg' ? 'text-4xl' : 'text-xl'"
  >
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      class="shrink-0"
      :class="size === 'lg' ? 'size-14' : 'size-9'"
    >
      <rect
        x="7"
        y="7"
        width="50"
        height="50"
        rx="14"
        fill="var(--ui-primary)"
        transform="rotate(-6 32 32)"
      />
      <g
        transform="rotate(-6 32 32)"
        fill="none"
        stroke="#fff"
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 22h22M21 32h14" />
        <path d="M24 43l5 5 11-12" />
      </g>
    </svg>
    <span v-if="!iconOnly">exam</span>
  </span>
</template>
