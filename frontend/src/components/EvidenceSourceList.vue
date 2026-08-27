<script setup lang="ts">
import type { EvidenceSource } from '@/types/evidence'
import type { RagSource } from '@/types/rag'

defineProps<{
  sources: EvidenceSource[]
  identityPrefix?: string
  selectedSourceId?: string | null
  snapshotMode?: boolean
}>()

const isCodeSource = (source: EvidenceSource) =>
  source.chunk_type === 'code' ||
  (source.language !== null && source.start_line !== null && source.end_line !== null)

const isKnowledgeSource = (source: EvidenceSource) => source.source_type === 'knowledge_entry'

function sourceType(source: EvidenceSource): string {
  if (isKnowledgeSource(source)) return 'KNOWLEDGE · 知识'
  return isCodeSource(source) ? 'CODE · 代码' : 'DOCUMENT · 文档'
}

function sourceTitle(source: EvidenceSource): string {
  return source.knowledge_question || source.document_name || source.relative_path || '未知来源'
}

function sourceLocation(source: EvidenceSource): string {
  if (isKnowledgeSource(source)) {
    return source.section_title || `知识片段 ${source.chunk_index + 1}`
  }
  if (source.page_number !== null) return `第 ${source.page_number} 页`
  if (source.start_line !== null && source.end_line !== null) {
    return `第 ${source.start_line}–${source.end_line} 行`
  }
  return `Chunk ${source.chunk_index}`
}

function sourceLocationWithPath(source: EvidenceSource): string {
  const location = sourceLocation(source)
  if (
    !isKnowledgeSource(source) &&
    source.relative_path &&
    source.relative_path !== source.document_name
  ) {
    return `${source.relative_path} · ${location}`
  }
  return location
}

function retrievalMetadata(source: EvidenceSource): { label: string; value: string }[] {
  const ragSource = source as Partial<RagSource>
  const metadata: { label: string; value: string }[] = []
  if (ragSource.retrieval_rank !== null && ragSource.retrieval_rank !== undefined) {
    metadata.push({ label: '检索排名', value: String(ragSource.retrieval_rank) })
  }
  if (ragSource.retrieval_score !== null && ragSource.retrieval_score !== undefined) {
    metadata.push({ label: '检索分数', value: ragSource.retrieval_score.toFixed(3) })
  }
  if (ragSource.rerank_score !== null && ragSource.rerank_score !== undefined) {
    metadata.push({ label: '重排分数', value: ragSource.rerank_score.toFixed(3) })
  } else if (ragSource.score !== undefined) {
    metadata.push({ label: '相关分数', value: ragSource.score.toFixed(3) })
  }
  if (ragSource.ranking_mode) {
    metadata.push({ label: '排序方式', value: ragSource.ranking_mode })
  }
  return metadata
}
</script>

<template>
  <div class="evidence-source-list" role="list">
    <article
      v-for="source in sources"
      :id="identityPrefix ? `evidence-source-${identityPrefix}-${source.source_id}` : undefined"
      :key="source.source_id"
      class="ev-src"
      :class="{
        code: isCodeSource(source),
        knowledge: isKnowledgeSource(source),
        selected: selectedSourceId === source.source_id,
      }"
      role="listitem"
      :aria-current="selectedSourceId === source.source_id ? 'true' : undefined"
      :data-testid="
        identityPrefix
          ? `evidence-source-${identityPrefix}-${source.source_id}`
          : `evidence-source-${source.source_id}`
      "
    >
      <header class="ev-src-header">
        <span class="ev-src-id">[{{ source.source_id }}]</span>
        <span class="ev-type" :class="{ 'ev-type-code': isCodeSource(source) }">
          {{ sourceType(source) }}
        </span>
      </header>
      <div class="ev-source-identity">
        <span class="ev-field-label">来源</span>
        <div class="ev-src-id-row">
          <RouterLink
            v-if="
              !snapshotMode &&
              isKnowledgeSource(source) &&
              source.knowledge_base_id &&
              source.knowledge_entry_id
            "
            class="ev-src-path text-action"
            :to="`/knowledge-bases/${source.knowledge_base_id}/knowledge/${source.knowledge_entry_id}`"
          >
            {{ sourceTitle(source) }}
          </RouterLink>
          <span v-else class="ev-src-path">{{ sourceTitle(source) }}</span>
        </div>
      </div>
      <div class="ev-source-location">
        <span class="ev-field-label">位置</span>
        <div class="ev-src-loc">
          <template v-if="isKnowledgeSource(source)">已验证知识 · 知识条目 · </template>
          <template v-else-if="source.section_title">{{ source.section_title }} · </template>
          {{ sourceLocationWithPath(source) }}
        </div>
      </div>
      <div class="ev-source-excerpt">
        <span class="ev-field-label">摘录</span>
        <div class="ev-src-excerpt">{{ source.content }}</div>
      </div>
      <div class="ev-source-lineage">
        <span class="ev-field-label">链路</span>
        <span>{{ snapshotMode ? '已保存证据快照' : '属于当前回答的证据集' }}</span>
      </div>
      <details v-if="retrievalMetadata(source).length" class="ev-source-diagnostics">
        <summary>检索详情</summary>
        <dl class="ev-source-metrics">
          <template v-for="item in retrievalMetadata(source)" :key="item.label">
            <dt>{{ item.label }}</dt>
            <dd>{{ item.value }}</dd>
          </template>
        </dl>
      </details>
    </article>
  </div>
</template>
