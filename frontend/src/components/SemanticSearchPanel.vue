<script setup lang="ts">
import { ElButton } from 'element-plus'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { ApiError } from '@/services/api'
import { hybridSearch, rerankedSearch, semanticSearch } from '@/services/documents'
import type { DocumentItem, SemanticSearchResponse, SemanticSearchResult } from '@/types/document'

type SearchMode = 'semantic' | 'hybrid' | 'reranked'

const props = withDefaults(
  defineProps<{
    knowledgeBaseId: string
    documents?: DocumentItem[]
  }>(),
  { documents: () => [] },
)

const query = ref('')
const language = ref('')
const documentId = ref('')
const limit = ref(5)
const mode = ref<SearchMode>('hybrid')
const loading = ref(false)
const searched = ref(false)
const errorMessage = ref('')
const results = ref<SemanticSearchResult[]>([])
const selectedResult = ref<SemanticSearchResult | null>(null)
const queryMetadata = ref<
  Pick<SemanticSearchResponse, 'path_scope_mode' | 'scoped_relative_path' | 'semantic_query'>
>({})

const modeOptions: Array<{ value: SearchMode; label: string; description: string }> = [
  { value: 'semantic', label: 'Semantic', description: 'Dense · Cosine' },
  { value: 'hybrid', label: 'Hybrid', description: 'Dense + BM25 · RRF' },
  { value: 'reranked', label: 'Reranked', description: 'Hybrid + Cross-Encoder' },
]

const loadingLabel = computed(() =>
  mode.value === 'reranked'
    ? 'Running Cross-Encoder reranking…'
    : `Running ${modeLabel()} retrieval…`,
)
const selectedRank = computed(() =>
  selectedResult.value
    ? results.value.findIndex((result) => result.chunk_id === selectedResult.value?.chunk_id) + 1
    : 0,
)

watch([mode, documentId, limit, language], resetResults)

function resetResults(): void {
  results.value = []
  queryMetadata.value = {}
  selectedResult.value = null
  searched.value = false
  errorMessage.value = ''
}

function selectMode(value: SearchMode): void {
  mode.value = value
}

function modeLabel(value: SearchMode = mode.value): string {
  return modeOptions.find((option) => option.value === value)?.label ?? value
}

function displayPath(result: SemanticSearchResult): string {
  return result.relative_path || result.document_name
}

function locationLabel(result: SemanticSearchResult): string {
  const parts: string[] = []
  if (result.section_title) parts.push(result.section_title)
  if (result.page_number !== null) parts.push(`Page ${result.page_number}`)
  if (result.start_line !== null && result.end_line !== null) {
    parts.push(`Lines ${result.start_line}–${result.end_line}`)
  }
  parts.push(`Chunk ${result.chunk_index}`)
  return parts.join(' · ')
}

function excerpt(content: string): string {
  const normalized = content.trim()
  return normalized.length > 420 ? `${normalized.slice(0, 420).trimEnd()}…` : normalized
}

function scoreLabel(result: SemanticSearchResult): string {
  if (mode.value === 'semantic') return `Cosine score ${result.score.toFixed(4)}`
  if (mode.value === 'hybrid') return `RRF score ${result.score.toFixed(4)}`
  return `Rerank score ${(result.rerank_score ?? result.score).toFixed(4)}`
}

function rankingShift(result: SemanticSearchResult, finalRank: number): string {
  if (mode.value !== 'reranked') return `Rank #${finalRank}`
  if (result.retrieval_rank === null || result.retrieval_rank === undefined) {
    return `Final #${finalRank}`
  }
  return `Retrieved #${result.retrieval_rank} → Reranked #${finalRank}`
}

function searchError(error: unknown): string {
  if (mode.value === 'reranked' && error instanceof ApiError && error.status === 503) {
    return 'Reranker unavailable. 本地 Cross-Encoder 当前不可用，可切换到 Hybrid 继续检查召回。'
  }
  if (mode.value === 'reranked' && error instanceof ApiError && error.status === 422) {
    return '当前结果数量超过 Reranker 配置上限，请选择更小的 Limit。'
  }
  return 'Retrieval unavailable. 请检查后端与索引服务后重试。'
}

async function search(): Promise<void> {
  if (!query.value.trim() || loading.value) return
  loading.value = true
  errorMessage.value = ''
  selectedResult.value = null
  try {
    const searchFunction =
      mode.value === 'reranked'
        ? rerankedSearch
        : mode.value === 'hybrid'
          ? hybridSearch
          : semanticSearch
    const response = await searchFunction(
      props.knowledgeBaseId,
      query.value.trim(),
      language.value.trim() || null,
      limit.value,
      documentId.value || null,
    )
    results.value = response.items
    queryMetadata.value = {
      path_scope_mode: response.path_scope_mode,
      scoped_relative_path: response.scoped_relative_path,
      semantic_query: response.semantic_query,
    }
    searched.value = true
  } catch (error) {
    results.value = []
    queryMetadata.value = {}
    searched.value = false
    errorMessage.value = searchError(error)
  } finally {
    loading.value = false
  }
}

function inspectResult(result: SemanticSearchResult): void {
  selectedResult.value = result
}

function closeInspector(): void {
  selectedResult.value = null
}
</script>

<template>
  <section class="retrieval-workbench" :class="{ 'has-inspector': selectedResult }">
    <div class="retrieval-main-plane">
      <form class="retrieval-composer" aria-label="检索查询" @submit.prevent="search">
        <label class="retrieval-query-field">
          <span>Query</span>
          <textarea
            v-model="query"
            aria-label="检索查询"
            maxlength="2000"
            rows="3"
            placeholder="输入要验证的技术问题或显式文件路径"
          />
        </label>

        <fieldset class="retrieval-mode-control">
          <legend>Mode</legend>
          <div class="retrieval-mode-options" role="radiogroup" aria-label="检索模式">
            <button
              v-for="option in modeOptions"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="mode === option.value"
              :class="{ active: mode === option.value }"
              @click="selectMode(option.value)"
            >
              <strong>{{ option.label }}</strong>
              <span>{{ option.description }}</span>
            </button>
          </div>
        </fieldset>

        <div class="retrieval-control-row">
          <label>
            <span>Scope</span>
            <select v-model="documentId" aria-label="文档范围">
              <option value="">Entire Knowledge Base</option>
              <option v-for="document in documents" :key="document.id" :value="document.id">
                {{ document.relative_path || document.name }}
              </option>
            </select>
          </label>
          <label>
            <span>Limit</span>
            <select v-model.number="limit" aria-label="结果数量">
              <option :value="5">5</option>
              <option :value="10">10</option>
            </select>
          </label>
          <ElButton
            class="retrieval-run-button"
            type="primary"
            native-type="submit"
            :loading="loading"
            :disabled="!query.trim()"
          >
            Run Retrieval
          </ElButton>
        </div>

        <details class="retrieval-advanced-control">
          <summary>Advanced</summary>
          <label>
            <span>Language</span>
            <input
              v-model="language"
              aria-label="语言过滤"
              maxlength="32"
              placeholder="Auto（可选 hint）"
            />
          </label>
        </details>
      </form>

      <dl
        v-if="queryMetadata.path_scope_mode === 'exact'"
        class="retrieval-scope-notice"
        data-testid="retrieval-path-scope"
      >
        <div>
          <dt>Scoped to</dt>
          <dd>{{ queryMetadata.scoped_relative_path }}</dd>
        </div>
        <div v-if="queryMetadata.semantic_query">
          <dt>Semantic query</dt>
          <dd>{{ queryMetadata.semantic_query }}</dd>
        </div>
      </dl>

      <div v-if="loading" class="retrieval-running" role="status" aria-live="polite">
        <span aria-hidden="true"></span>
        {{ loadingLabel }}
      </div>

      <div v-if="errorMessage" class="retrieval-error" role="alert">
        <strong>检索未完成</strong>
        <p>{{ errorMessage }}</p>
        <button v-if="mode === 'reranked'" type="button" @click="selectMode('hybrid')">
          切换到 Hybrid
        </button>
      </div>

      <section class="retrieval-results-region" aria-label="检索结果" :aria-busy="loading">
        <header class="retrieval-results-header">
          <div>
            <h2>Retrieval Results</h2>
            <p v-if="searched">{{ results.length }} 个 Evidence candidates · {{ modeLabel() }}</p>
            <p v-else>运行一次真实检索后，在此检查召回内容与排序。</p>
          </div>
        </header>

        <div v-if="searched && results.length === 0" class="retrieval-empty">
          <h3>No retrieval results</h3>
          <p>当前知识空间没有找到匹配 Evidence。请更换 Query 或放宽 Document scope。</p>
        </div>

        <div v-else-if="results.length" class="retrieval-result-ledger">
          <article
            v-for="(result, index) in results"
            :key="result.chunk_id"
            class="retrieval-result-row"
            :class="{ selected: selectedResult?.chunk_id === result.chunk_id }"
          >
            <button
              type="button"
              class="retrieval-result-select"
              :aria-pressed="selectedResult?.chunk_id === result.chunk_id"
              :aria-label="`查看第 ${index + 1} 条检索结果：${result.document_name}`"
              @click="inspectResult(result)"
            >
              <span class="retrieval-result-rank">#{{ index + 1 }}</span>
              <span class="retrieval-result-body">
                <span class="retrieval-result-heading">
                  <strong>{{ result.document_name }}</strong>
                  <span>{{ displayPath(result) }}</span>
                </span>
                <span class="retrieval-result-location">{{ locationLabel(result) }}</span>
                <span class="retrieval-result-excerpt">{{ excerpt(result.content) }}</span>
                <span class="retrieval-result-ranking">
                  <span>{{ rankingShift(result, index + 1) }}</span>
                  <span>{{ scoreLabel(result) }}</span>
                </span>
              </span>
              <span class="retrieval-result-action">Inspect</span>
            </button>
          </article>
        </div>
      </section>
    </div>

    <button
      v-if="selectedResult"
      type="button"
      class="retrieval-inspector-backdrop"
      tabindex="-1"
      aria-hidden="true"
      @click="closeInspector"
    />
    <aside
      v-if="selectedResult"
      id="retrieval-inspector"
      class="retrieval-inspector"
      aria-label="检索结果详情"
    >
      <header class="retrieval-inspector-header">
        <span>RESULT INSPECTOR</span>
        <button type="button" aria-label="关闭检索结果详情" @click="closeInspector">×</button>
      </header>

      <section class="retrieval-inspector-identity">
        <span class="retrieval-evidence-marker">EVIDENCE CANDIDATE · #{{ selectedRank }}</span>
        <h2>{{ selectedResult.document_name }}</h2>
        <p>{{ displayPath(selectedResult) }}</p>
      </section>

      <section class="retrieval-inspector-section">
        <h3>Location</h3>
        <dl class="retrieval-facts">
          <div>
            <dt>Version</dt>
            <dd>V{{ selectedResult.version_number }}</dd>
          </div>
          <div>
            <dt>Section</dt>
            <dd>{{ selectedResult.section_title || '—' }}</dd>
          </div>
          <div>
            <dt>Page</dt>
            <dd>{{ selectedResult.page_number ?? '—' }}</dd>
          </div>
          <div>
            <dt>Lines</dt>
            <dd>{{ selectedResult.start_line ?? '—' }}–{{ selectedResult.end_line ?? '—' }}</dd>
          </div>
          <div>
            <dt>Chunk</dt>
            <dd>{{ selectedResult.chunk_index }}</dd>
          </div>
          <div>
            <dt>Language</dt>
            <dd>{{ selectedResult.language || '—' }}</dd>
          </div>
        </dl>
      </section>

      <section class="retrieval-inspector-section retrieval-inspector-content">
        <h3>Content</h3>
        <pre>{{ selectedResult.content }}</pre>
      </section>

      <section class="retrieval-inspector-section">
        <h3>Ranking</h3>
        <dl class="retrieval-facts">
          <div>
            <dt>Mode</dt>
            <dd>{{ selectedResult.ranking_mode || mode }}</dd>
          </div>
          <div>
            <dt>Final rank</dt>
            <dd>#{{ selectedRank }}</dd>
          </div>
          <div
            v-if="
              selectedResult.retrieval_rank !== null && selectedResult.retrieval_rank !== undefined
            "
          >
            <dt>Retrieval rank</dt>
            <dd>#{{ selectedResult.retrieval_rank }}</dd>
          </div>
          <div
            v-if="
              selectedResult.retrieval_score !== null &&
              selectedResult.retrieval_score !== undefined
            "
          >
            <dt>RRF score</dt>
            <dd>{{ selectedResult.retrieval_score.toFixed(4) }}</dd>
          </div>
          <div v-if="mode === 'semantic'">
            <dt>Cosine score</dt>
            <dd>{{ selectedResult.score.toFixed(4) }}</dd>
          </div>
          <div
            v-if="selectedResult.rerank_score !== null && selectedResult.rerank_score !== undefined"
          >
            <dt>Rerank raw logit</dt>
            <dd>{{ selectedResult.rerank_score.toFixed(4) }}</dd>
          </div>
        </dl>
      </section>

      <div class="retrieval-inspector-actions">
        <RouterLink
          :to="{
            name: 'documents',
            params: { knowledgeBaseId },
            query: {
              query: selectedResult.relative_path || selectedResult.document_name,
              focusDocument: selectedResult.document_id,
            },
          }"
        >
          打开 Document
        </RouterLink>
      </div>
    </aside>
  </section>
</template>
