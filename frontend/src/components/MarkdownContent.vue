<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { computed } from 'vue'

import { parseAnswerSegments } from '@/services/ragCitations'

const props = defineProps<{
  content: string
  sourceIds?: string[]
  selectedSourceId?: string | null
  citationControlsId?: string
}>()
const emit = defineEmits<{ citation: [sourceId: string] }>()
const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
})

// Knowledge snapshots must never trigger remote image loads.
markdown.disable('image')

markdown.renderer.rules.text = (tokens, index) => {
  const text = tokens[index]?.content ?? ''
  let linkDepth = 0
  for (let tokenIndex = 0; tokenIndex < index; tokenIndex += 1) {
    if (tokens[tokenIndex]?.type === 'link_open') linkDepth += 1
    else if (tokens[tokenIndex]?.type === 'link_close') linkDepth -= 1
  }
  if (linkDepth > 0) return markdown.utils.escapeHtml(text)
  const sourceIds = new Set(props.sourceIds ?? [])
  return parseAnswerSegments(text, sourceIds)
    .map((segment) => {
      if (segment.type === 'text') return markdown.utils.escapeHtml(segment.text)
      const sourceId = markdown.utils.escapeHtml(segment.sourceId)
      const label = markdown.utils.escapeHtml(segment.text)
      const selected = props.selectedSourceId === segment.sourceId
      const controls = props.citationControlsId
        ? ` aria-controls="${markdown.utils.escapeHtml(props.citationControlsId)}"`
        : ''
      return `<button type="button" class="cite-btn${selected ? ' selected' : ''}" data-citation-source-id="${sourceId}" aria-label="查看证据 ${sourceId}" aria-pressed="${selected}"${controls}>${label}</button>`
    })
    .join('')
}

const rendered = computed(() => markdown.render(props.content))

function handleClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return
  const citation = event.target.closest<HTMLButtonElement>('button[data-citation-source-id]')
  const sourceId = citation?.dataset.citationSourceId
  if (sourceId) emit('citation', sourceId)
}
</script>

<template>
  <!-- markdown-it escapes raw HTML and rejects unsafe URL schemes with this configuration. -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="markdown-content" @click="handleClick" v-html="rendered"></div>
</template>
