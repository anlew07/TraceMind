<script setup lang="ts">
import {
  ElAlert,
  ElButton,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElMessage,
  ElMessageBox,
} from 'element-plus'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import DocumentUploadPanel from '@/components/DocumentUploadPanel.vue'
import DocumentChunkDialog from '@/components/DocumentChunkDialog.vue'
import DocumentVersionDialog from '@/components/DocumentVersionDialog.vue'
import { ApiError } from '@/services/api'
import {
  deleteDocument,
  downloadCurrentDocument,
  listDocuments,
  requestDocumentParse,
  requestDocumentIndex,
} from '@/services/documents'
import { getKnowledgeBase } from '@/services/knowledgeBases'
import type { DocumentItem } from '@/types/document'

const route = useRoute()
const knowledgeBaseId = String(route.params.knowledgeBaseId)
const knowledgeBaseName = ref('')

const shellKbName = inject<Ref<string>>('shellKbName', ref(''))
watch(knowledgeBaseName, (name) => {
  shellKbName.value = name || ''
})
const items = ref<DocumentItem[]>([])
const total = ref(0)
const query = ref('')
const appliedQuery = ref('')
const focusedDocumentId = ref('')
const loading = ref(false)
const errorMessage = ref('')
const deletingId = ref<string | null>(null)
const versionDialogVisible = ref(false)
const selectedDocument = ref<DocumentItem | null>(null)
const inspectedDocument = ref<DocumentItem | null>(null)
const chunkDialogVisible = ref(false)
const parsingId = ref<string | null>(null)
const indexingId = ref<string | null>(null)
const showUpload = ref(false)
let pollingTimer: ReturnType<typeof setInterval> | undefined

type DocumentStatusTone = 'ready' | 'active' | 'warning' | 'failed'

interface DocumentStatusView {
  label: string
  detail: string
  tone: DocumentStatusTone
}

function elapsedLabel(value: string | null): string {
  if (!value) return ''
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  return ` · ${seconds}s`
}

function documentStatus(document: DocumentItem): DocumentStatusView {
  const version = document.latest_version
  if (version.parse_status === 'failed') {
    return {
      label: '解析失败',
      detail: parseErrorSummary(document) || '解析失败，请重试',
      tone: 'failed',
    }
  }
  if (version.parse_status === 'pending') {
    return { label: '等待解析', detail: '文件已导入，等待解析任务', tone: 'warning' }
  }
  if (version.parse_status === 'processing') {
    return {
      label: '解析中',
      detail: `正在提取可检索内容${elapsedLabel(version.parse_started_at)}`,
      tone: 'active',
    }
  }
  if (version.index_status === 'failed') {
    return {
      label: '索引失败',
      detail: version.index_error_message || '索引失败，请重试',
      tone: 'failed',
    }
  }
  if (version.index_status === 'pending') {
    return {
      label: '等待索引',
      detail: `已解析 ${version.chunk_count} 个 Chunk，等待建立索引`,
      tone: 'warning',
    }
  }
  if (version.index_status === 'processing') {
    return {
      label: '索引中',
      detail: `正在建立检索索引${elapsedLabel(version.index_started_at)}`,
      tone: 'active',
    }
  }
  return {
    label: 'Ready',
    detail: `已解析并索引 ${version.indexed_chunk_count || version.chunk_count} 个 Chunk`,
    tone: 'ready',
  }
}

const searchSummary = computed(() => {
  if (appliedQuery.value.trim()) return `${total.value} 条匹配资料`
  return `${total.value} 份资料`
})

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function loadDocuments(): Promise<void> {
  if (loading.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await listDocuments(knowledgeBaseId, query.value)
    items.value = response.items
    total.value = response.total
    appliedQuery.value = query.value
    if (inspectedDocument.value) {
      inspectedDocument.value =
        response.items.find((item) => item.id === inspectedDocument.value?.id) ?? null
    }
    updatePolling()
    await focusRequestedDocument()
  } catch {
    errorMessage.value = '文档列表加载失败，请检查知识库或后端服务后重试'
  } finally {
    loading.value = false
  }
}

async function focusRequestedDocument(): Promise<void> {
  if (!focusedDocumentId.value) return
  await nextTick()
  document.getElementById(`document-${focusedDocumentId.value}`)?.scrollIntoView?.({
    block: 'center',
  })
}

function updatePolling(): void {
  const needsPolling = items.value.some(
    ({ latest_version }) =>
      ['pending', 'processing'].includes(latest_version.parse_status) ||
      (latest_version.parse_status === 'succeeded' &&
        ['pending', 'processing'].includes(latest_version.index_status)),
  )
  if (needsPolling && pollingTimer === undefined) {
    pollingTimer = setInterval(() => void loadDocuments(), 2500)
  } else if (!needsPolling && pollingTimer !== undefined) {
    clearInterval(pollingTimer)
    pollingTimer = undefined
  }
}

async function requestIndex(document: DocumentItem, force: boolean): Promise<void> {
  if (indexingId.value) return
  indexingId.value = document.id
  try {
    const result = await requestDocumentIndex(
      knowledgeBaseId,
      document.id,
      document.latest_version.id,
      force,
    )
    ElMessage.success(result.queued ? '已进入索引队列' : '当前状态无需重复入队')
    await loadDocuments()
  } catch {
    ElMessage.error('索引请求失败，请确认文档已解析完成')
  } finally {
    indexingId.value = null
  }
}

function showChunks(document: DocumentItem): void {
  selectedDocument.value = document
  chunkDialogVisible.value = true
}

function parseErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) {
    return '解析队列暂时不可用，请稍后重试'
  }
  return '解析请求失败，请稍后重试'
}

function parseErrorSummary(document: DocumentItem): string {
  const version = document.latest_version
  if (version.parse_error_code === 'no_extractable_text') {
    return '未提取到文本；扫描型 PDF 当前不支持 OCR'
  }
  if (version.parse_error_code === 'invalid_encoding') {
    return '文本解析仅支持 UTF-8 编码'
  }
  return version.parse_error_message ?? ''
}

async function requestParse(document: DocumentItem, force: boolean): Promise<void> {
  if (parsingId.value) return
  parsingId.value = document.id
  try {
    const result = await requestDocumentParse(
      knowledgeBaseId,
      document.id,
      document.latest_version.id,
      force,
    )
    ElMessage.success(result.queued ? '已进入解析队列' : '当前状态无需重复入队')
    await loadDocuments()
  } catch (error) {
    ElMessage.error(parseErrorMessage(error))
  } finally {
    parsingId.value = null
  }
}

async function loadPage(): Promise<void> {
  query.value = typeof route.query?.query === 'string' ? route.query.query : ''
  focusedDocumentId.value =
    typeof route.query?.focusDocument === 'string' ? route.query.focusDocument : ''
  showUpload.value = route.query?.import === '1'
  try {
    knowledgeBaseName.value = (await getKnowledgeBase(knowledgeBaseId)).name
  } catch {
    errorMessage.value = '知识库不存在或加载失败'
  }
  await loadDocuments()
}

async function handleUploadCompleted(): Promise<void> {
  await loadDocuments()
  showUpload.value = false
}

async function clearSearch(): Promise<void> {
  query.value = ''
  await loadDocuments()
}

function showVersions(document: DocumentItem): void {
  selectedDocument.value = document
  versionDialogVisible.value = true
}

function inspectDocument(document: DocumentItem): void {
  inspectedDocument.value = document
}

function closeInspector(): void {
  inspectedDocument.value = null
}

async function confirmDelete(document: DocumentItem): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除文档"${document.name}"及全部历史版本吗？此操作无法撤销。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  if (deletingId.value) return
  deletingId.value = document.id
  try {
    await deleteDocument(knowledgeBaseId, document.id)
    if (inspectedDocument.value?.id === document.id) closeInspector()
    ElMessage.success('文档删除成功')
    await loadDocuments()
  } catch {
    ElMessage.error('文档删除失败，请稍后重试')
  } finally {
    deletingId.value = null
  }
}

function statusPillClass(tone: DocumentStatusTone): string {
  return `st-pill document-status-pill document-status-${tone}`
}

function fileNameOnly(document: DocumentItem): string {
  const name = document.relative_path || document.name
  const lastSlash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'))
  return lastSlash >= 0 ? name.slice(lastSlash + 1) : name
}

function fileExtension(document: DocumentItem): string {
  const name = document.relative_path || document.name
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot) : ''
}

function baseNameWithoutExt(document: DocumentItem): string {
  const full = fileNameOnly(document)
  const dot = full.lastIndexOf('.')
  return dot >= 0 ? full.slice(0, dot) : full
}

function sourceTypeLabel(document: DocumentItem): string {
  if (document.source_type === 'upload') return '本地导入'
  return document.source_type
}

function formatOptionalDate(value: string | null): string {
  return value ? formatDate(value) : '—'
}

onMounted(loadPage)
onBeforeUnmount(() => {
  if (pollingTimer !== undefined) clearInterval(pollingTimer)
})
</script>

<template>
  <main class="management-page document-page">
    <div class="document-workspace-shell">
      <section class="document-main-plane">
        <div class="document-content-grid">
          <header class="management-header">
            <div>
              <h1>文档</h1>
              <p>当前知识库的研究资料与可追溯来源</p>
            </div>
            <div class="header-actions">
              <ElButton type="primary" @click="showUpload = !showUpload">
                {{ showUpload ? '收起导入' : '导入资料' }}
              </ElButton>
            </div>
          </header>

          <div v-if="showUpload" class="document-import-region">
            <DocumentUploadPanel
              :knowledge-base-id="knowledgeBaseId"
              @completed="handleUploadCompleted"
            />
          </div>

          <form class="doc-search-bar" @submit.prevent="loadDocuments">
            <label for="document-filter">筛选资料</label>
            <div class="doc-search-control">
              <input id="document-filter" v-model="query" placeholder="按文件名或路径筛选" />
              <ElButton native-type="submit" :loading="loading">搜索</ElButton>
            </div>
            <span class="doc-search-summary">{{ searchSummary }}</span>
          </form>

          <ElAlert
            v-if="errorMessage"
            class="document-alert"
            :title="errorMessage"
            type="error"
            show-icon
            :closable="false"
          />

          <section class="document-list-region" aria-label="资料列表" :aria-busy="loading">
            <div v-if="loading && items.length === 0" class="loading-state">正在加载资料…</div>
            <div
              v-else-if="items.length === 0 && !errorMessage"
              class="document-empty-state"
              data-testid="document-empty-state"
            >
              <template v-if="query.trim()">
                <h2>没有匹配的资料</h2>
                <p>换一个文件名或路径关键词，或清除当前筛选。</p>
                <ElButton @click="clearSearch">清除筛选</ElButton>
              </template>
              <template v-else>
                <h2>你的知识空间还没有资料</h2>
                <p>导入文档或代码文件，TraceMind 会解析并建立可追溯的检索索引。</p>
                <ElButton v-if="!showUpload" type="primary" @click="showUpload = true">
                  导入第一份资料
                </ElButton>
              </template>
            </div>

            <div v-else class="doc-list">
              <article
                v-for="document in items"
                :key="document.id"
                :id="`document-${document.id}`"
                class="doc-item"
                :class="{
                  'doc-item-focused': document.id === focusedDocumentId,
                  'doc-item-selected': document.id === inspectedDocument?.id,
                }"
              >
                <button
                  type="button"
                  class="doc-select"
                  :aria-pressed="document.id === inspectedDocument?.id"
                  :aria-controls="inspectedDocument ? 'document-inspector' : undefined"
                  @click="inspectDocument(document)"
                >
                  <span class="doc-main">
                    <span class="doc-name-row">
                      <span class="doc-name">{{ baseNameWithoutExt(document) }}</span>
                      <span class="doc-ext">{{ fileExtension(document) }}</span>
                    </span>
                    <span class="doc-path">{{ document.relative_path || document.name }}</span>
                    <span class="doc-meta-row">
                      <span class="doc-meta">V{{ document.latest_version.version_number }}</span>
                      <span class="doc-meta-sep">·</span>
                      <span class="doc-meta">{{
                        formatSize(document.latest_version.file_size)
                      }}</span>
                      <span class="doc-meta-sep">·</span>
                      <span class="doc-meta">{{ document.latest_version.chunk_count }} Chunks</span>
                      <span class="doc-meta-sep">·</span>
                      <span class="doc-meta">更新于 {{ formatDate(document.updated_at) }}</span>
                    </span>
                  </span>
                  <span class="doc-state">
                    <span :class="statusPillClass(documentStatus(document).tone)">
                      {{ documentStatus(document).label }}
                    </span>
                    <span class="doc-state-detail">{{ documentStatus(document).detail }}</span>
                  </span>
                </button>

                <div class="doc-overflow" @click.stop @keydown.stop>
                  <ElDropdown trigger="click" :hide-on-click="true">
                    <button class="doc-more" aria-label="文档操作">···</button>
                    <template #dropdown>
                      <ElDropdownMenu>
                        <ElDropdownItem
                          :disabled="document.latest_version.chunk_count === 0"
                          @click="showChunks(document)"
                          >查看 Chunk</ElDropdownItem
                        >
                        <ElDropdownItem
                          :disabled="
                            parsingId !== null ||
                            document.latest_version.parse_status === 'processing'
                          "
                          @click="
                            requestParse(
                              document,
                              document.latest_version.parse_status === 'succeeded',
                            )
                          "
                          >{{
                            document.latest_version.parse_status === 'succeeded'
                              ? '重新解析'
                              : '重试解析'
                          }}</ElDropdownItem
                        >
                        <ElDropdownItem
                          :disabled="
                            indexingId !== null ||
                            document.latest_version.parse_status !== 'succeeded' ||
                            document.latest_version.index_status === 'processing'
                          "
                          @click="
                            requestIndex(
                              document,
                              document.latest_version.index_status === 'succeeded',
                            )
                          "
                          >{{
                            document.latest_version.index_status === 'succeeded'
                              ? '重建索引'
                              : '建立索引'
                          }}</ElDropdownItem
                        >
                        <ElDropdownItem
                          @click="downloadCurrentDocument(knowledgeBaseId, document.id)"
                          >下载</ElDropdownItem
                        >
                        <ElDropdownItem @click="showVersions(document)">历史版本</ElDropdownItem>
                        <ElDropdownItem
                          :data-testid="`delete-document-${document.id}`"
                          divided
                          style="color: var(--color-error)"
                          @click="confirmDelete(document)"
                          >删除</ElDropdownItem
                        >
                      </ElDropdownMenu>
                    </template>
                  </ElDropdown>
                </div>
              </article>
            </div>
          </section>

          <div class="document-retrieval-region">
            <div>
              <span>Advanced · Retrieval Workspace</span>
              <p>测试当前知识库的真实召回、排序和 Evidence candidates。</p>
            </div>
            <RouterLink
              :to="{ name: 'retrieval', params: { knowledgeBaseId } }"
              class="document-retrieval-link"
            >
              打开 Retrieval Workspace <span aria-hidden="true">→</span>
            </RouterLink>
          </div>
        </div>
      </section>

      <button
        v-if="inspectedDocument"
        type="button"
        class="document-inspector-backdrop"
        tabindex="-1"
        aria-hidden="true"
        @click="closeInspector"
      />
      <aside
        v-if="inspectedDocument"
        id="document-inspector"
        class="document-inspector"
        aria-label="文档详情"
      >
        <header class="document-inspector-header">
          <span>DOCUMENT INSPECTOR</span>
          <button
            type="button"
            class="inspector-close"
            aria-label="关闭文档详情"
            @click="closeInspector"
          >
            ×
          </button>
        </header>

        <div class="document-inspector-identity">
          <div class="doc-name-row">
            <h2>{{ baseNameWithoutExt(inspectedDocument) }}</h2>
            <span class="doc-ext">{{ fileExtension(inspectedDocument) }}</span>
          </div>
          <p>{{ inspectedDocument.relative_path || inspectedDocument.name }}</p>
          <span :class="statusPillClass(documentStatus(inspectedDocument).tone)">
            {{ documentStatus(inspectedDocument).label }}
          </span>
          <p class="document-inspector-status-detail">
            {{ documentStatus(inspectedDocument).detail }}
          </p>
        </div>

        <section class="document-inspector-section">
          <h3>资料信息</h3>
          <dl class="document-facts">
            <div>
              <dt>来源</dt>
              <dd>{{ sourceTypeLabel(inspectedDocument) }}</dd>
            </div>
            <div>
              <dt>类型</dt>
              <dd>
                {{
                  inspectedDocument.latest_version.mime_type ||
                  fileExtension(inspectedDocument) ||
                  '—'
                }}
              </dd>
            </div>
            <div>
              <dt>大小</dt>
              <dd>{{ formatSize(inspectedDocument.latest_version.file_size) }}</dd>
            </div>
            <div>
              <dt>更新时间</dt>
              <dd>{{ formatDate(inspectedDocument.updated_at) }}</dd>
            </div>
          </dl>
        </section>

        <section class="document-inspector-section">
          <h3>当前版本</h3>
          <dl class="document-facts">
            <div>
              <dt>版本</dt>
              <dd>
                V{{ inspectedDocument.latest_version.version_number }} /
                {{ inspectedDocument.version_count }}
              </dd>
            </div>
            <div>
              <dt>Chunks</dt>
              <dd>{{ inspectedDocument.latest_version.chunk_count }}</dd>
            </div>
            <div>
              <dt>已索引</dt>
              <dd>{{ inspectedDocument.latest_version.indexed_chunk_count }}</dd>
            </div>
            <div>
              <dt>导入时间</dt>
              <dd>{{ formatDate(inspectedDocument.latest_version.created_at) }}</dd>
            </div>
            <div>
              <dt>解析完成</dt>
              <dd>{{ formatOptionalDate(inspectedDocument.latest_version.parsed_at) }}</dd>
            </div>
            <div>
              <dt>索引完成</dt>
              <dd>{{ formatOptionalDate(inspectedDocument.latest_version.indexed_at) }}</dd>
            </div>
          </dl>
        </section>

        <details class="document-technical-detail">
          <summary>Technical detail</summary>
          <dl class="document-facts">
            <div>
              <dt>Parser</dt>
              <dd>
                {{ inspectedDocument.latest_version.parser_name || '—' }}
                {{ inspectedDocument.latest_version.parser_version || '' }}
              </dd>
            </div>
            <div>
              <dt>Embedding</dt>
              <dd>{{ inspectedDocument.latest_version.embedding_model || '—' }}</dd>
            </div>
            <div>
              <dt>Dimension</dt>
              <dd>{{ inspectedDocument.latest_version.embedding_dimension || '—' }}</dd>
            </div>
            <div>
              <dt>Content hash</dt>
              <dd class="technical-value">{{ inspectedDocument.latest_version.content_hash }}</dd>
            </div>
            <div>
              <dt>Index generation</dt>
              <dd class="technical-value">
                {{ inspectedDocument.latest_version.active_index_generation || '—' }}
              </dd>
            </div>
          </dl>
        </details>

        <div class="document-inspector-actions">
          <ElButton
            :disabled="inspectedDocument.latest_version.chunk_count === 0"
            @click="showChunks(inspectedDocument)"
            >查看 Chunk</ElButton
          >
          <ElButton @click="showVersions(inspectedDocument)">历史版本</ElButton>
          <ElButton @click="downloadCurrentDocument(knowledgeBaseId, inspectedDocument.id)">
            下载
          </ElButton>
          <ElButton
            v-if="inspectedDocument.latest_version.parse_status === 'failed'"
            :loading="parsingId === inspectedDocument.id"
            @click="requestParse(inspectedDocument, false)"
            >重试解析</ElButton
          >
          <ElButton
            v-else-if="inspectedDocument.latest_version.index_status === 'failed'"
            :loading="indexingId === inspectedDocument.id"
            @click="requestIndex(inspectedDocument, false)"
            >重试索引</ElButton
          >
        </div>
      </aside>
    </div>

    <DocumentVersionDialog
      v-model="versionDialogVisible"
      :knowledge-base-id="knowledgeBaseId"
      :document="selectedDocument"
    />
    <DocumentChunkDialog
      v-model="chunkDialogVisible"
      :knowledge-base-id="knowledgeBaseId"
      :document="selectedDocument"
    />
  </main>
</template>
