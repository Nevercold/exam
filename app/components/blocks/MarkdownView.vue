<script setup lang="ts">
import MarkdownIt from 'markdown-it'

const props = defineProps<{ source: string }>()

// html: false escapes raw HTML; markdown-it's link validation blocks javascript: URLs.
const md = new MarkdownIt({ html: false, linkify: false, breaks: true })
const html = computed(() => md.render(props.source))
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- rendered with html: false, see above -->
  <div
    class="markdown"
    v-html="html"
  />
</template>

<style scoped>
.markdown :deep(h1) { font-size: 1.5rem; font-weight: 700; margin: 1rem 0 0.5rem; }
.markdown :deep(h2) { font-size: 1.25rem; font-weight: 600; margin: 1rem 0 0.5rem; }
.markdown :deep(h3) { font-size: 1.1rem; font-weight: 600; margin: 0.75rem 0 0.25rem; }
.markdown :deep(p) { margin: 0.5rem 0; }
.markdown :deep(ul) { list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
.markdown :deep(ol) { list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
.markdown :deep(code) { font-family: var(--font-mono); background: var(--ui-bg-elevated); padding: 0 0.25rem; border-radius: 0.25rem; }
.markdown :deep(pre) { background: var(--ui-bg-elevated); padding: 0.75rem; border-radius: 0.5rem; overflow-x: auto; }
.markdown :deep(a) { color: var(--ui-primary); text-decoration: underline; }
.markdown :deep(table) { border-collapse: collapse; margin: 0.5rem 0; }
.markdown :deep(th), .markdown :deep(td) { border: 1px solid var(--ui-border); padding: 0.25rem 0.5rem; }
.markdown > :deep(:first-child) { margin-top: 0; }
</style>
