<script setup lang="ts">
import {
  ElButton,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElEmpty,
  ElMessage,
  ElMessageBox,
} from 'element-plus'
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
  type Ref,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EvidenceSourceList from '@/components/EvidenceSourceList.vue'
import KnowledgeEntryFormDialog from '@/components/KnowledgeEntryFormDialog.vue'
import MarkdownContent from '@/components/MarkdownContent.vue'

import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
} from '@/services/conversations'
import { streamRagAnswer } from '@/services/rag'
import { getKnowledgeBase } from '@/services/knowledgeBases'
import { createKnowledgeEntry } from '@/services/knowledgeEntries'
import type {
  Conversation,
  ConversationMessage,
  ConversationMessageStatus,
} from '@/types/conversation'
import type { RagDoneEvent } from '@/types/rag'
import type { KnowledgeEntryInput } from '@/types/knowledgeEntry'

const route = useRoute()
const router = useRouter()
const knowledgeBaseId = String(route.params.knowledgeBaseId)
const knowledgeBaseName = ref('')

const shellKbName = inject<Ref<string>>('shellKbName', ref(''))
watch(knowledgeBaseName, (name) => {
  shellKbName.value = name || ''
})
const conversations = ref<Conversation[]>([])
const selectedId = ref('')
const messages = ref<ConversationMessage[]>([])
const query = ref('')
const language = ref('')
const loadingList = ref(false)
const loadingMessages = ref(false)
const generating = ref(false)
const pageError = ref('')
type ProgressState =
  | 'preparing'
  | 'retrieved'
  | 'generating'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled'
const progressState = ref<ProgressState | null>(null)
const elapsedSeconds = ref(0)
const activeSourceCount = ref(0)
const evidenceVisible = ref(
  typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(min-width: 681px)').matches,
)
const evidenceMessageId = ref<string | null>(null)
const selectedSourceId = ref<string | null>(null)
const knowledgeDialogVisible = ref(false)
const knowledgeSubmitting = ref(false)
const knowledgeSourceMessage = ref<ConversationMessage | null>(null)
const knowledgeInitial = ref<KnowledgeEntryInput>({
  question: '',
  background: null,
  root_cause: null,
  solution: '',
  failed_attempts: [],
  validation_status: 'unverified',
  tags: [],
})
const messageViewport = ref<HTMLElement | null>(null)
let controller: AbortController | null = null
let streamVersion = 0
let elapsedTimer: number | null = null
let progressStartedAt = 0
let followStreaming = true
let scrollFrame: number | null = null

const selectedConversation = computed(() =>
  conversations.value.find(({ id }) => id === selectedId.value),
)
const evidenceMessage = computed(
  () =>
    messages.value.find(({ id, role }) => role === 'assistant' && id === evidenceMessageId.value) ??
    null,
)
const evidenceSources = computed(() => evidenceMessage.value?.sources ?? [])
const evidenceMetadata = computed(() => evidenceMessage.value?.generation_metadata ?? null)
const selectedEvidenceSource = computed(
  () =>
    evidenceSources.value.find(({ source_id }) => source_id === selectedSourceId.value) ??
    evidenceSources.value[0] ??
    null,
)

type ConversationGroup = { label: string; items: Conversation[] }

const conversationGroups = computed<ConversationGroup[]>(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const groups: ConversationGroup[] = [
    { label: '今天', items: [] },
    { label: '昨天', items: [] },
    { label: '较早', items: [] },
  ]
  for (const conversation of conversations.value) {
    const updatedAt = new Date(conversation.updated_at)
    const target = updatedAt >= today ? groups[0] : updatedAt >= yesterday ? groups[1] : groups[2]
    target?.items.push(conversation)
  }
  return groups.filter(({ items }) => items.length)
})

const progressMessage = computed(() => {
  switch (progressState.value) {
    case 'preparing':
      return '正在检索与分析…'
    case 'retrieved':
      return activeSourceCount.value
        ? `找到 ${activeSourceCount.value} 条来源`
        : '已完成检索'
    case 'generating':
      return '正在生成回答…'
    case 'finalizing':
      return '正在保存回答…'
    case 'completed':
      return '已完成'
    case 'failed':
      return '生成失败'
    case 'cancelled':
      return '已取消'
    default:
      return ''
  }
})

const progressTitle = computed(() => {
  switch (progressState.value) {
    case 'completed':
      return 'COMPLETED'
    case 'failed':
      return 'FAILED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'GENERATING'
  }
})

function isViewportNearBottom(): boolean {
  const viewport = messageViewport.value
  if (!viewport) return true
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96
}

function handleViewportScroll(): void {
  if (generating.value) followStreaming = isViewportNearBottom()
}

function scheduleScrollToLatest(force = false): void {
  if (!force && !followStreaming) return
  if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame)
  scrollFrame = window.requestAnimationFrame(() => {
    scrollFrame = null
    const viewport = messageViewport.value
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  })
}

async function scrollToLatest(force = false): Promise<void> {
  await nextTick()
  scheduleScrollToLatest(force)
}

function clearElapsedTimer() {
  if (elapsedTimer !== null) {
    window.clearInterval(elapsedTimer)
    elapsedTimer = null
  }
}
function startProgress() {
  clearElapsedTimer()
  progressState.value = 'preparing'
  activeSourceCount.value = 0
  elapsedSeconds.value = 0
  progressStartedAt = Date.now()
  elapsedTimer = window.setInterval(() => {
    elapsedSeconds.value = Math.floor((Date.now() - progressStartedAt) / 1000)
  }, 250)
}
function finishProgress(state: Extract<ProgressState, 'completed' | 'failed' | 'cancelled'>) {
  progressState.value = state
  clearElapsedTimer()
}
function resetProgress() {
  progressState.value = null
  activeSourceCount.value = 0
  elapsedSeconds.value = 0
  clearElapsedTimer()
}

function selectDefaultEvidenceMessage(): void {
  evidenceMessageId.value = null
  selectedSourceId.value = null
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const candidate = messages.value[i]
    if (candidate?.role === 'assistant') {
      evidenceMessageId.value = candidate.id
      selectedSourceId.value = candidate.sources?.[0]?.source_id ?? null
      return
    }
  }
}

async function showEvidence(messageId: string, sourceId?: string): Promise<void> {
  evidenceMessageId.value = messageId
  const message = messages.value.find(({ id }) => id === messageId)
  selectedSourceId.value = sourceId ?? message?.sources?.[0]?.source_id ?? null
  evidenceVisible.value = true
  if (!sourceId) return
  await nextTick()
  document
    .getElementById(`evidence-source-${messageId}-${sourceId}`)
    ?.scrollIntoView({ block: 'nearest' })
}

function temporaryMessage(
  role: 'user' | 'assistant',
  content: string,
  status: ConversationMessageStatus = 'completed',
): ConversationMessage {
  return {
    id: `temporary-${crypto.randomUUID()}`,
    conversation_id: selectedId.value,
    role,
    status,
    content,
    trace_id: null,
    sources: null,
    generation_metadata: null,
    created_at: new Date().toISOString(),
    knowledge_entry_id: null,
  }
}

function pairedQuestion(message: ConversationMessage): string {
  const index = messages.value.findIndex(({ id }) => id === message.id)
  for (let i = index - 1; i >= 0; i--) {
    const candidate = messages.value[i]
    if (candidate?.role === 'user' && candidate.status === 'completed') return candidate.content
  }
  return ''
}

function openKnowledgeDialog(message: ConversationMessage): void {
  knowledgeSourceMessage.value = message
  knowledgeInitial.value = {
    question: pairedQuestion(message),
    background: null,
    root_cause: null,
    solution: message.content,
    failed_attempts: [],
    validation_status: 'unverified',
    tags: [],
  }
  knowledgeDialogVisible.value = true
}

async function saveKnowledge(value: KnowledgeEntryInput): Promise<void> {
  const message = knowledgeSourceMessage.value
  if (!message) return
  knowledgeSubmitting.value = true
  try {
    const entry = await createKnowledgeEntry(knowledgeBaseId, {
      ...value,
      source_assistant_message_id: message.id,
    })
    message.knowledge_entry_id = entry.id
    knowledgeDialogVisible.value = false
    ElMessage.success('已保存为知识')
  } catch {
    ElMessage.error('保存知识失败，请稍后重试')
  } finally {
    knowledgeSubmitting.value = false
  }
}

function viewKnowledge(entryId: string): void {
  void router.push(`/knowledge-bases/${knowledgeBaseId}/knowledge/${entryId}`)
}

async function loadList(preferredId?: string): Promise<void> {
  loadingList.value = true
  pageError.value = ''
  try {
    const result = await listConversations(knowledgeBaseId)
    conversations.value = result.items
    const nextId =
      preferredId && result.items.some(({ id }) => id === preferredId)
        ? preferredId
        : selectedId.value && result.items.some(({ id }) => id === selectedId.value)
          ? selectedId.value
          : (result.items[0]?.id ?? '')
    if (nextId && nextId !== selectedId.value) await selectConversation(nextId)
    else if (nextId) await loadMessages(nextId)
    else {
      messages.value = []
      evidenceMessageId.value = null
      selectedSourceId.value = null
    }
  } catch {
    pageError.value = '会话列表加载失败，请稍后重试'
  } finally {
    loadingList.value = false
  }
}

async function loadMessages(conversationId: string): Promise<void> {
  const rv = streamVersion
  loadingMessages.value = true
  try {
    const d = await getConversation(knowledgeBaseId, conversationId)
    if (selectedId.value === conversationId && rv === streamVersion) {
      messages.value = d.messages
      selectDefaultEvidenceMessage()
      followStreaming = true
      await scrollToLatest(true)
    }
  } catch {
    if (selectedId.value === conversationId) pageError.value = '消息历史加载失败，请稍后重试'
  } finally {
    if (selectedId.value === conversationId) loadingMessages.value = false
  }
}

async function selectConversation(cid: string): Promise<void> {
  stopGeneration(false)
  resetProgress()
  generating.value = false
  controller = null
  streamVersion += 1
  selectedId.value = cid
  messages.value = []
  evidenceMessageId.value = null
  selectedSourceId.value = null
  evidenceVisible.value =
    typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 681px)').matches
  followStreaming = true
  await loadMessages(cid)
}

async function addConversation(): Promise<void> {
  try {
    const c = await createConversation(knowledgeBaseId)
    conversations.value = [c, ...conversations.value]
    await selectConversation(c.id)
  } catch {
    ElMessage.error('新建会话失败')
  }
}

async function renameSelected(): Promise<void> {
  const c = selectedConversation.value
  if (!c) return
  try {
    const r = await ElMessageBox.prompt('输入新的会话标题', '重命名会话', {
      inputValue: c.title,
      inputPattern: /\S+/,
      inputErrorMessage: '标题不能为空',
    })
    const u = await renameConversation(knowledgeBaseId, c.id, r.value.trim())
    conversations.value = conversations.value.map((i) => (i.id === u.id ? u : i))
  } catch {}
}

async function removeSelected(): Promise<void> {
  const c = selectedConversation.value
  if (!c) return
  try {
    await ElMessageBox.confirm(`确定删除会话"${c.title}"吗？`, '删除会话', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  stopGeneration()
  try {
    await deleteConversation(knowledgeBaseId, c.id)
    selectedId.value = ''
    await loadList()
  } catch {
    ElMessage.error('删除会话失败')
  }
}

async function generate(): Promise<void> {
  const prompt = query.value.trim()
  if (!prompt || generating.value) return
  if (!selectedId.value) {
    await addConversation()
    if (!selectedId.value) return
  }
  const cid = selectedId.value
  const cv = ++streamVersion
  let receivedDone = false
  const assistant = reactive(temporaryMessage('assistant', '', 'completed'))
  messages.value.push(temporaryMessage('user', prompt), assistant)
  evidenceMessageId.value = assistant.id
  selectedSourceId.value = null
  evidenceVisible.value =
    typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 681px)').matches
  query.value = ''
  generating.value = true
  followStreaming = true
  startProgress()
  await scrollToLatest(true)
  controller = new AbortController()
  try {
    await streamRagAnswer(
      knowledgeBaseId,
      { query: prompt, language: language.value.trim() || null, conversation_id: cid },
      {
        onSources(event) {
          if (selectedId.value !== cid || cv !== streamVersion) return
          const previousMessageId = assistant.id
          assistant.trace_id = event.trace_id
          assistant.sources = event.sources
          activeSourceCount.value = event.source_count
          progressState.value = 'retrieved'
          if (event.message_id) assistant.id = event.message_id
          if (evidenceMessageId.value === previousMessageId) evidenceMessageId.value = assistant.id
          if (evidenceMessageId.value === assistant.id && !selectedSourceId.value) {
            selectedSourceId.value = event.sources[0]?.source_id ?? null
          }
        },
        onToken(event) {
          if (selectedId.value !== cid || cv !== streamVersion) return
          progressState.value = 'generating'
          assistant.content += event.text
          void nextTick(() => scheduleScrollToLatest())
        },
        onNoAnswer(event) {
          if (selectedId.value !== cid || cv !== streamVersion) return
          assistant.status = 'no_answer'
          assistant.content = event.message
        },
        onDone(event) {
          if (selectedId.value !== cid || cv !== streamVersion) return
          receivedDone = true
          progressState.value = 'finalizing'
          assistant.status = event.terminal_status
          assistant.generation_metadata = event
        },
        onError(event) {
          if (selectedId.value !== cid || cv !== streamVersion) return
          assistant.status = 'failed'
          assistant.content = event.message
          finishProgress('failed')
        },
      },
      controller.signal,
    )
    if (selectedId.value === cid && cv === streamVersion) {
      if (receivedDone) finishProgress('completed')
      else if (!['failed', 'cancelled'].includes(progressState.value ?? '')) {
        assistant.status = 'failed'
        assistant.content = '回答生成服务暂时不可用，请稍后重试。'
        finishProgress('failed')
      }
      await loadMessages(cid)
      await loadList(cid)
    }
  } catch (error) {
    if (selectedId.value === cid && cv === streamVersion) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        assistant.status = 'cancelled'
        finishProgress('cancelled')
      } else {
        assistant.status = 'failed'
        assistant.content = '回答生成服务暂时不可用，请稍后重试。'
        finishProgress('failed')
      }
    }
  } finally {
    if (cv === streamVersion) {
      generating.value = false
      controller = null
    }
  }
}

function stopGeneration(sc = true) {
  if (sc && generating.value) finishProgress('cancelled')
  controller?.abort()
}

function doneMetadata(message: ConversationMessage): Partial<RagDoneEvent> | null {
  return message.generation_metadata
}
function formatLatency(v: number | undefined): string {
  return v === undefined ? '—' : `${v} ms`
}

function messageStatusLabel(message: ConversationMessage): string {
  if (message.status === 'no_answer') return '无充分证据'
  if (message.status === 'cancelled') return '已取消'
  if (message.status === 'failed') return '失败'
  if (generating.value && messages.value[messages.value.length - 1]?.id === message.id) {
    return '生成中'
  }
  return '已完成'
}

function messageVisualStatus(
  message: ConversationMessage,
): ConversationMessageStatus | 'generating' {
  return generating.value &&
    message.status === 'completed' &&
    messages.value[messages.value.length - 1]?.id === message.id
    ? 'generating'
    : message.status
}

function formatMessageTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type TraceStep = { label: string; detail: string; state: 'complete' | 'fallback' | 'terminal' }
type TraceDetail = { label: string; value: string }

function traceSummary(message: ConversationMessage): TraceStep[] {
  const metadata = doneMetadata(message)
  if (!metadata) return []
  const steps: TraceStep[] = []
  if (metadata.route_mode === 'direct') {
    steps.push({ label: '直接回答', detail: '无需检索', state: 'complete' })
  } else {
    if (metadata.query_rewrite_mode) {
      steps.push({
        label: '查询理解',
        detail: metadata.query_rewrite_mode,
        state: metadata.query_rewrite_mode === 'fallback' ? 'fallback' : 'complete',
      })
    }
    if (metadata.retrieval_mode || metadata.retrieval_latency_ms !== undefined) {
      steps.push({
        label: '检索',
        detail: metadata.retrieval_mode ?? formatLatency(metadata.retrieval_latency_ms),
        state: 'complete',
      })
    }
    if (metadata.rerank_latency_ms !== undefined || metadata.reranker_fallback !== undefined) {
      steps.push({
        label: '重排',
        detail: metadata.reranker_fallback ? '已降级' : '已完成',
        state: metadata.reranker_fallback ? 'fallback' : 'complete',
      })
    }
    if (message.sources?.length || metadata.source_count !== undefined) {
      steps.push({
        label: '证据',
        detail: `${message.sources?.length ?? metadata.source_count ?? 0} 条来源`,
        state: 'complete',
      })
    }
  }
  steps.push({
    label: message.status === 'no_answer' ? '无充分证据' : '回答完成',
    detail: formatLatency(metadata.response_total_latency_ms ?? metadata.total_latency_ms),
    state: 'terminal',
  })
  return steps
}

function traceDetails(message: ConversationMessage): TraceDetail[] {
  const metadata = doneMetadata(message)
  if (!metadata) return []
  const rows: TraceDetail[] = []
  const add = (label: string, value: string | number | boolean | null | undefined, unit = '') => {
    if (value === null || value === undefined || value === '') return
    rows.push({
      label,
      value: typeof value === 'boolean' ? (value ? '是' : '否') : `${value}${unit}`,
    })
  }
  add('终态', message.status)
  add('路由', metadata.route_mode)
  add('完成原因', metadata.finish_reason)
  add('总响应延迟', metadata.response_total_latency_ms ?? metadata.total_latency_ms, ' ms')
  add('会话持久化', metadata.conversation_persistence_latency_ms, ' ms')
  if (metadata.route_mode !== 'direct') {
    add('查询改写', metadata.query_rewrite_mode)
    add('查询改写延迟', metadata.query_rewrite_latency_ms, ' ms')
    add('历史轮数', metadata.history_turn_count)
    add('实际检索查询', metadata.retrieval_query)
    add('检索方式', metadata.retrieval_mode)
    add('检索延迟', metadata.retrieval_latency_ms, ' ms')
    add('Embedding', metadata.embedding_latency_ms, ' ms')
    add('Qdrant', metadata.qdrant_latency_ms, ' ms')
    add('融合', metadata.fusion_latency_ms, ' ms')
    add('Dense 候选', metadata.dense_candidate_count)
    add('Sparse 候选', metadata.sparse_candidate_count)
    add('重排延迟', metadata.rerank_latency_ms, ' ms')
    add('重排降级', metadata.reranker_fallback)
    add('来源数量', metadata.source_count ?? message.sources?.length)
    add('路径范围', metadata.path_scope_mode)
    add('限定路径', metadata.scoped_relative_path)
  }
  add('有效引用', metadata.valid_citation_count)
  add('无效引用', metadata.invalid_citation_count)
  add('首字延迟', metadata.llm_first_token_latency_ms, ' ms')
  add('生成延迟', metadata.llm_generation_latency_ms ?? metadata.llm_latency_ms, ' ms')
  add('本地预处理', metadata.local_pre_llm_latency_ms, ' ms')
  return rows
}

onMounted(async () => {
  try {
    knowledgeBaseName.value = (await getKnowledgeBase(knowledgeBaseId)).name
  } catch {
    pageError.value = '知识库不存在或加载失败'
  }
  await loadList()
})
onBeforeUnmount(() => {
  stopGeneration(false)
  clearElapsedTimer()
  if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame)
  streamVersion += 1
})
</script>

<template>
  <main class="conv-page">
    <div v-if="pageError" class="conv-error" role="alert">{{ pageError }}</div>
    <div class="conv-layout">
      <!-- Sidebar -->
      <aside class="conv-sidebar" aria-label="会话列表">
        <header class="conv-sidebar-head">
          <div class="conv-sidebar-workspace">
            <span class="conv-sidebar-kicker">WORKSPACE</span>
            <strong>{{ knowledgeBaseName || '知识库' }}</strong>
          </div>
        </header>
        <div class="conv-sidebar-section-head">
          <span>SESSIONS</span>
          <button
            class="conv-sidebar-new"
            data-testid="new-conversation-sidebar"
            aria-label="新建会话"
            @click="addConversation"
          >
            +
          </button>
        </div>
        <nav class="conv-sidebar-list" aria-label="历史会话">
          <section
            v-for="group in conversationGroups"
            :key="group.label"
            class="conv-session-group"
          >
            <h2>{{ group.label }}</h2>
            <button
              v-for="c in group.items"
              :key="c.id"
              class="conv-sidebar-item"
              :class="{ on: c.id === selectedId }"
              :data-testid="`conversation-${c.id}`"
              :aria-current="c.id === selectedId ? 'page' : undefined"
              @click="selectConversation(c.id)"
            >
              <span class="conv-sidebar-title">{{ c.title }}</span>
            </button>
          </section>
          <ElEmpty v-if="!loadingList && conversations.length === 0" description="暂无会话" />
        </nav>
      </aside>

      <!-- Thread -->
      <section class="conv-thread" data-testid="conversation-thread" aria-label="会话内容">
        <header v-if="selectedConversation" class="conv-thread-header">
          <div class="conv-thread-heading">
            <span class="conv-thread-context"
              >RESEARCH SESSION · {{ knowledgeBaseName || '知识库' }}</span
            >
            <h1>{{ selectedConversation.title }}</h1>
            <time :datetime="selectedConversation.updated_at">
              {{ new Date(selectedConversation.updated_at).toLocaleString('zh-CN') }}
            </time>
          </div>
          <ElDropdown trigger="click" :hide-on-click="true">
            <button class="conv-thread-actions" aria-label="会话操作">会话操作 ···</button>
            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem @click="renameSelected">重命名</ElDropdownItem>
                <ElDropdownItem divided style="color: var(--color-error)" @click="removeSelected"
                  >删除</ElDropdownItem
                >
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </header>
        <div
          ref="messageViewport"
          class="conv-message-viewport"
          data-testid="message-viewport"
          @scroll="handleViewportScroll"
        >
          <div v-if="loadingMessages" class="loading-state">正在加载…</div>
          <div v-else-if="!selectedId" class="conv-empty">
            <span class="conv-empty-kicker">START INVESTIGATION</span>
            <strong>开始一次可追溯的研究会话</strong>
            <p>选择已有 Session，或为当前知识库创建新的调查。</p>
            <ElButton type="primary" data-testid="new-conversation-empty" @click="addConversation"
              >新建 Session</ElButton
            >
          </div>
          <template v-else>
            <div v-if="messages.length === 0" class="conv-empty investigation-empty">
              <span class="conv-empty-kicker">START INVESTIGATION</span>
              <strong>向这个知识库提出一个问题</strong>
              <p>TraceMind 会将回答连接到可检查的真实证据。</p>
              <blockquote>“总结这个项目的核心架构”</blockquote>
            </div>

            <article
              v-for="msg in messages"
              :key="msg.id"
              class="msg"
              :class="msg.role"
              :data-message-id="msg.id"
            >
              <header class="msg-head">
                <span class="msg-who">{{
                  msg.role === 'user' ? 'YOUR QUERY' : 'TRACEMIND ANSWER'
                }}</span>
                <time v-if="msg.role === 'user'" :datetime="msg.created_at">
                  {{ formatMessageTime(msg.created_at) }}
                </time>
                <span v-else class="msg-status" :data-status="messageVisualStatus(msg)">
                  {{ messageStatusLabel(msg) }}
                </span>
              </header>
              <div v-if="msg.role === 'user'" class="msg-body user-body">{{ msg.content }}</div>
              <div v-else class="msg-body assistant-body">
                <MarkdownContent
                  :content="msg.content"
                  :source-ids="(msg.sources ?? []).map((source) => source.source_id)"
                  :selected-source-id="
                    evidenceMessageId === msg.id ? selectedEvidenceSource?.source_id : null
                  "
                  citation-controls-id="evidence-inspector"
                  @citation="showEvidence(msg.id, $event)"
                />
                <div v-if="msg.status === 'no_answer' && !msg.content" class="msg-no-answer">
                  知识库中未找到足够相关的信息。
                </div>
              </div>

              <nav
                v-if="msg.role === 'assistant' && msg.sources?.length"
                class="msg-evidence-strip"
                aria-label="回答证据"
              >
                <span class="msg-evidence-label">EVIDENCE</span>
                <span class="msg-evidence-ids">
                  <button
                    v-for="source in msg.sources"
                    :key="source.source_id"
                    type="button"
                    class="cite-btn"
                    :class="{
                      selected:
                        evidenceMessageId === msg.id &&
                        selectedEvidenceSource?.source_id === source.source_id,
                    }"
                    :aria-pressed="
                      evidenceMessageId === msg.id &&
                      selectedEvidenceSource?.source_id === source.source_id
                    "
                    aria-controls="evidence-inspector"
                    :aria-label="`查看证据 ${source.source_id}`"
                    @click="showEvidence(msg.id, source.source_id)"
                  >
                    [{{ source.source_id }}]
                  </button>
                </span>
                <span class="msg-evidence-count">{{ msg.sources.length }} sources</span>
              </nav>
              <div
                v-else-if="
                  msg.role === 'assistant' &&
                  msg.status === 'completed' &&
                  !msg.sources?.length &&
                  doneMetadata(msg) &&
                  doneMetadata(msg)?.route_mode !== 'direct' &&
                  !doneMetadata(msg)?.grounded
                "
                class="msg-ungrounded"
              >
                这条回答没有可验证的引用，请结合原始资料核对。
              </div>

              <section
                v-if="msg.role === 'assistant' && traceSummary(msg).length"
                class="msg-lineage"
                aria-label="证据链路"
              >
                <header class="msg-lineage-head">
                  <strong>Evidence Lineage</strong>
                  <span>证据链路</span>
                </header>
                <ol class="msg-lineage-steps">
                  <li v-for="step in traceSummary(msg)" :key="step.label" :data-state="step.state">
                    <span class="lineage-marker" aria-hidden="true"></span>
                    <span class="lineage-copy">
                      <strong>{{ step.label }}</strong>
                      <small>{{ step.detail }}</small>
                    </span>
                  </li>
                </ol>
              </section>

              <details v-if="msg.role === 'assistant' && doneMetadata(msg)" class="exec-details">
                <summary>TRACE DETAIL · 执行详情</summary>
                <dl class="exec-grid">
                  <template v-for="row in traceDetails(msg)" :key="row.label">
                    <dt>{{ row.label }}</dt>
                    <dd>{{ row.value }}</dd>
                  </template>
                </dl>
              </details>

              <div
                v-if="
                  msg.role === 'assistant' &&
                  msg.status === 'completed' &&
                  !msg.id.startsWith('temporary-')
                "
                class="msg-knowledge-action"
              >
                <div>
                  <strong>Promote to Knowledge</strong>
                  <span>将已验证回答沉淀为可复用知识</span>
                </div>
                <button
                  v-if="!msg.knowledge_entry_id"
                  type="button"
                  class="msg-knowledge-button"
                  @click="openKnowledgeDialog(msg)"
                >
                  保存为知识
                </button>
                <button
                  v-else
                  type="button"
                  class="msg-knowledge-button secondary"
                  @click="viewKnowledge(msg.knowledge_entry_id)"
                >
                  查看知识 →
                </button>
              </div>
            </article>

            <div
              v-if="selectedId && progressState"
              class="conv-progress"
              :data-state="progressState"
              role="status"
              aria-live="polite"
            >
              <span class="conv-progress-title">{{ progressTitle }}</span>
              <strong>{{ progressMessage }}</strong>
              <span>{{ elapsedSeconds }}s</span>
            </div>
          </template>
        </div>

        <form
          v-if="selectedId"
          class="conv-composer"
          data-testid="conversation-composer"
          @submit.prevent="generate"
        >
          <span class="conv-composer-label">CONTINUE INVESTIGATION</span>
          <div class="conv-composer-row">
            <label class="conv-composer-field">
              <span class="sr-only">你的问题</span>
              <input
                v-model="query"
                maxlength="2000"
                aria-label="你的问题"
                placeholder="继续追问，或提出一个可由证据回答的问题…"
              />
            </label>
            <ElButton native-type="submit" type="primary" :disabled="!query.trim() || generating"
              >发送</ElButton
            >
            <ElButton
              v-if="generating"
              type="danger"
              plain
              data-testid="stop-generation"
              @click="stopGeneration()"
              >停止</ElButton
            >
          </div>
        </form>
      </section>

      <!-- Evidence Inspector -->
      <aside
        id="evidence-inspector"
        class="conv-evidence"
        :class="{ off: !evidenceVisible }"
        aria-label="来源检查器"
      >
        <div class="ev-head">
          <div>
            <strong>SOURCE INSPECTOR</strong>
            <span>来源检查器</span>
          </div>
          <button @click="evidenceVisible = false" aria-label="关闭证据">×</button>
        </div>
        <div class="ev-body">
          <div v-if="selectedEvidenceSource" class="ev-selected-identity">
            <span class="ev-selected-id">[{{ selectedEvidenceSource.source_id }}]</span>
            <span>已选择来源</span>
          </div>
          <EvidenceSourceList
            v-if="evidenceSources.length"
            :sources="evidenceSources"
            :identity-prefix="evidenceMessage?.id"
            :selected-source-id="selectedEvidenceSource?.source_id"
          />
          <div v-else class="ev-empty">
            <strong>暂无可检查的来源</strong>
            <span>选择包含引用的回答后，证据身份与位置会显示在这里。</span>
          </div>

          <hr v-if="evidenceMetadata" class="ev-divider" />
          <details v-if="evidenceMessage && evidenceMetadata" class="ev-trace-details">
            <summary>Trace Metadata · 执行信息</summary>
            <dl class="ev-exec-grid">
              <template v-for="row in traceDetails(evidenceMessage)" :key="row.label">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </template>
            </dl>
          </details>
        </div>
      </aside>
    </div>
    <KnowledgeEntryFormDialog
      v-model="knowledgeDialogVisible"
      title="保存为知识"
      :initial-value="knowledgeInitial"
      :submitting="knowledgeSubmitting"
      @submit="saveKnowledge"
    />
  </main>
</template>
