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
import { RouterLink, useRoute, useRouter } from 'vue-router'

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
import { listDocuments } from '@/services/documents'
import type {
  Conversation,
  ConversationMessage,
  ConversationMessageStatus,
} from '@/types/conversation'
import type {
  RagDoneEvent,
  RagPipelineEvent,
  RagPipelineMetadata,
  RagPipelinePhase,
  RagPipelineStatus,
} from '@/types/rag'
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
const evidenceVisible = ref(false)
const evidenceMessageId = ref<string | null>(null)
const selectedSourceId = ref<string | null>(null)
const expandedTraceIds = reactive(new Set<string>())
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
const composerInput = ref<HTMLInputElement | null>(null)
const knowledgeBaseIsEmpty = ref<boolean | null>(null)
const emptyOnboardingDismissed = ref(false)
let controller: AbortController | null = null
let streamVersion = 0
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
    evidenceSources.value.find(({ source_id }) => source_id === selectedSourceId.value) ?? null,
)
const showEmptyKnowledgeBaseOnboarding = computed(
  () =>
    knowledgeBaseIsEmpty.value === true &&
    !emptyOnboardingDismissed.value &&
    messages.value.length === 0,
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

type VisibleTracePhase = Exclude<RagPipelinePhase, 'routing'>
type TraceVisualStatus = 'pending' | 'running' | 'complete' | 'skipped' | 'fallback' | 'failed'
type TracePhaseState = {
  status: RagPipelineStatus | 'pending'
  metadata?: RagPipelineMetadata
}
type ExecutionTraceSnapshot = {
  routeMode?: 'direct' | 'rag'
  phases: Partial<Record<VisibleTracePhase, TracePhaseState>>
}
type LiveExecutionTrace = {
  message: ConversationMessage
  snapshot: ExecutionTraceSnapshot
}

const liveExecutionTrace = ref<LiveExecutionTrace | null>(null)

const TRACE_PHASES: ReadonlyArray<{ phase: VisibleTracePhase; label: string }> = [
  { phase: 'query_rewrite', label: 'Query Rewrite' },
  { phase: 'retrieval', label: 'Retrieval' },
  { phase: 'rerank', label: 'Rerank' },
  { phase: 'evidence', label: 'Evidence' },
  { phase: 'generation', label: 'Generation' },
]

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

function resetEvidenceInspector(): void {
  evidenceVisible.value = false
  evidenceMessageId.value = null
  selectedSourceId.value = null
}

async function showEvidence(messageId: string, sourceId: string): Promise<void> {
  evidenceMessageId.value = messageId
  selectedSourceId.value = sourceId
  evidenceVisible.value = true
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
      resetEvidenceInspector()
      liveExecutionTrace.value = null
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
  generating.value = false
  controller = null
  streamVersion += 1
  selectedId.value = cid
  messages.value = []
  resetEvidenceInspector()
  liveExecutionTrace.value = null
  expandedTraceIds.clear()
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

async function continueWithoutDocuments(): Promise<void> {
  emptyOnboardingDismissed.value = true
  if (!selectedId.value) await addConversation()
  await nextTick()
  composerInput.value?.focus()
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

function bindStreamIdentity(
  assistant: ConversationMessage,
  event: { trace_id: string; message_id?: string },
): void {
  const previousMessageId = assistant.id
  assistant.trace_id = event.trace_id
  if (event.message_id) assistant.id = event.message_id
  if (evidenceMessageId.value === previousMessageId) evidenceMessageId.value = assistant.id
}

function initializeRagTrace(snapshot: ExecutionTraceSnapshot): void {
  for (const phase of ['query_rewrite', 'retrieval', 'rerank', 'evidence'] as const) {
    snapshot.phases[phase] ??= { status: 'pending' }
  }
}

function applyPipelineEvent(snapshot: ExecutionTraceSnapshot, event: RagPipelineEvent): void {
  if (event.phase === 'routing') {
    if (event.status === 'completed' && event.metadata?.route_mode) {
      snapshot.routeMode = event.metadata.route_mode
      if (snapshot.routeMode === 'rag') initializeRagTrace(snapshot)
    }
    return
  }
  snapshot.phases[event.phase] = {
    status: event.status,
    metadata: event.metadata,
  }
}

function failRunningTrace(snapshot: ExecutionTraceSnapshot): void {
  for (const phase of TRACE_PHASES) {
    if (snapshot.phases[phase.phase]?.status === 'started') {
      snapshot.phases[phase.phase] = { status: 'failed' }
      return
    }
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
  query.value = ''
  generating.value = true
  followStreaming = true
  const liveSnapshot = reactive<ExecutionTraceSnapshot>({ phases: {} })
  liveExecutionTrace.value = { message: assistant, snapshot: liveSnapshot }
  await scrollToLatest(true)
  controller = new AbortController()
  try {
    await streamRagAnswer(
      knowledgeBaseId,
      { query: prompt, language: language.value.trim() || null, conversation_id: cid },
      {
        onPipeline(event) {
          if (selectedId.value !== cid || cv !== streamVersion) return
          bindStreamIdentity(assistant, event)
          applyPipelineEvent(liveSnapshot, event)
          void nextTick(() => scheduleScrollToLatest())
        },
        onSources(event) {
          if (selectedId.value !== cid || cv !== streamVersion) return
          bindStreamIdentity(assistant, event)
          assistant.sources = event.sources
        },
        onToken(event) {
          if (selectedId.value !== cid || cv !== streamVersion) return
          bindStreamIdentity(assistant, event)
          assistant.content += event.text
          void nextTick(() => scheduleScrollToLatest())
        },
        onNoAnswer(event) {
          if (selectedId.value !== cid || cv !== streamVersion) return
          bindStreamIdentity(assistant, event)
          assistant.status = 'no_answer'
          assistant.content = event.message
        },
        onDone(event) {
          if (selectedId.value !== cid || cv !== streamVersion) return
          bindStreamIdentity(assistant, event)
          receivedDone = true
          assistant.status = event.terminal_status
          assistant.generation_metadata = event
        },
        onError(event) {
          if (selectedId.value !== cid || cv !== streamVersion) return
          bindStreamIdentity(assistant, event)
          assistant.status = 'failed'
          assistant.content = event.message
          failRunningTrace(liveSnapshot)
        },
      },
      controller.signal,
    )
    if (selectedId.value === cid && cv === streamVersion) {
      if (!receivedDone && !['failed', 'cancelled'].includes(assistant.status)) {
        assistant.status = 'failed'
        assistant.content = '回答生成服务暂时不可用，请稍后重试。'
        failRunningTrace(liveSnapshot)
      }
      await loadMessages(cid)
      await loadList(cid)
    }
  } catch (error) {
    if (selectedId.value === cid && cv === streamVersion) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        assistant.status = 'cancelled'
        failRunningTrace(liveSnapshot)
      } else {
        assistant.status = 'failed'
        assistant.content = '回答生成服务暂时不可用，请稍后重试。'
        failRunningTrace(liveSnapshot)
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
  if (sc && generating.value && liveExecutionTrace.value) {
    failRunningTrace(liveExecutionTrace.value.snapshot)
  }
  controller?.abort()
}
function doneMetadata(message: ConversationMessage): Partial<RagDoneEvent> | null {
  return message.generation_metadata
}

function messageStatusLabel(message: ConversationMessage): string {
  if (message.status === 'no_answer') return '无充分证据'
  if (message.status === 'cancelled') return '已取消'
  if (message.status === 'failed') return '失败'
  if (generating.value && liveExecutionTrace.value?.message === message) return '生成中'
  return '已完成'
}

function messageVisualStatus(
  message: ConversationMessage,
): ConversationMessageStatus | 'generating' {
  return generating.value && liveExecutionTrace.value?.message === message
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

function historyTraceSnapshot(message: ConversationMessage): ExecutionTraceSnapshot {
  const metadata = doneMetadata(message)
  const snapshot: ExecutionTraceSnapshot = {
    routeMode: metadata?.route_mode,
    phases: {},
  }
  if (!metadata) return snapshot
  if (metadata.route_mode === 'direct') {
    if (message.status === 'completed') snapshot.phases.generation = { status: 'completed' }
    return snapshot
  }

  snapshot.phases.query_rewrite = {
    status:
      metadata.query_rewrite_mode === 'fallback'
        ? 'fallback'
        : metadata.query_rewrite_mode === 'rewritten'
          ? 'completed'
          : 'skipped',
  }
  snapshot.phases.retrieval = { status: 'completed' }
  snapshot.phases.rerank = {
    status: metadata.reranker_fallback
      ? 'fallback'
      : metadata.retrieval_mode === 'hybrid'
        ? 'skipped'
        : 'completed',
  }
  const sourceCount = message.sources?.length ?? metadata.source_count ?? 0
  snapshot.phases.evidence = {
    status: 'completed',
    metadata: { source_count: sourceCount },
  }
  if (message.status === 'completed' && sourceCount > 0) {
    snapshot.phases.generation = { status: 'completed' }
  }
  return snapshot
}

function traceSnapshot(message: ConversationMessage): ExecutionTraceSnapshot {
  return liveExecutionTrace.value?.message === message
    ? liveExecutionTrace.value.snapshot
    : historyTraceSnapshot(message)
}

function visualTraceStatus(status: TracePhaseState['status']): TraceVisualStatus {
  if (status === 'started') return 'running'
  if (status === 'completed') return 'complete'
  return status
}

function traceStepDetail(
  phase: VisibleTracePhase,
  state: TracePhaseState,
  message: ConversationMessage,
): string {
  const visualStatus = visualTraceStatus(state.status)
  if (visualStatus === 'pending') return '等待执行'
  if (visualStatus === 'running') {
    return {
      query_rewrite: '正在理解上下文',
      retrieval: '正在检索知识库',
      rerank: '正在重排候选',
      evidence: '正在构建证据集',
      generation: '正在生成回答',
    }[phase]
  }
  if (visualStatus === 'failed') return '执行失败'
  if (visualStatus === 'fallback') {
    return phase === 'rerank' ? '已降级 · 保留检索排序' : '已降级 · 使用原始查询'
  }
  if (visualStatus === 'skipped') {
    if (phase === 'query_rewrite') return '无需改写'
    if (phase === 'rerank') return '未启用重排'
    return '无需执行'
  }
  if (phase === 'retrieval') {
    const count = state.metadata?.candidate_count
    return count === undefined
      ? (doneMetadata(message)?.retrieval_mode ?? '已完成')
      : `${count} 条候选`
  }
  if (phase === 'rerank') {
    const count = state.metadata?.candidate_count
    return count === undefined ? '已完成' : `${count} 条结果`
  }
  if (phase === 'evidence') {
    const count = state.metadata?.source_count ?? message.sources?.length ?? 0
    return `${count} 条来源`
  }
  if (phase === 'query_rewrite') return '已改写'
  return '已完成'
}

type TraceStep = {
  phase: VisibleTracePhase
  label: string
  detail: string
  state: TraceVisualStatus
}
type TraceDetail = { label: string; value: string }

function traceSummary(message: ConversationMessage): TraceStep[] {
  const snapshot = traceSnapshot(message)
  return TRACE_PHASES.flatMap(({ phase, label }) => {
    const state = snapshot.phases[phase]
    if (!state) return []
    return [
      {
        phase,
        label,
        detail: traceStepDetail(phase, state, message),
        state: visualTraceStatus(state.status),
      },
    ]
  })
}

function isLiveTrace(message: ConversationMessage): boolean {
  return generating.value && liveExecutionTrace.value?.message === message
}

function isTraceExpanded(message: ConversationMessage): boolean {
  return isLiveTrace(message) || expandedTraceIds.has(message.id)
}

function traceCompactSummary(message: ConversationMessage): string {
  const steps = traceSummary(message)
  const marker = steps.some(({ state }) => state === 'failed') ? '!' : '✓'
  const fallback = steps.find(({ state }) => state === 'fallback')
  return `${marker} Execution Trace · ${steps.length} stages${fallback ? ` · ${fallback.label} fallback` : ''}`
}

function handleTraceSummaryClick(message: ConversationMessage, event: MouseEvent): void {
  if (isLiveTrace(message)) event.preventDefault()
}

function handleTraceToggle(message: ConversationMessage, event: Event): void {
  const details = event.currentTarget as HTMLDetailsElement
  if (isLiveTrace(message)) {
    if (!details.open) details.open = true
    return
  }
  if (details.open) expandedTraceIds.add(message.id)
  else expandedTraceIds.delete(message.id)
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
  add('总响应延迟', metadata.response_total_latency_ms, ' ms')
  add('会话持久化', metadata.conversation_persistence_latency_ms, ' ms')
  if (metadata.route_mode !== 'direct') {
    add('查询改写', metadata.query_rewrite_mode)
    add('查询改写延迟', metadata.query_rewrite_latency_ms, ' ms')
    add('历史轮数', metadata.history_turn_count)
    add('实际检索查询', metadata.retrieval_query)
    add('检索方式', metadata.retrieval_mode)
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
  return rows
}

onMounted(async () => {
  const [knowledgeBaseResult, documentResult] = await Promise.allSettled([
    getKnowledgeBase(knowledgeBaseId),
    listDocuments(knowledgeBaseId, '', 0, 1),
  ])
  if (knowledgeBaseResult.status === 'fulfilled') {
    knowledgeBaseName.value = knowledgeBaseResult.value.name
  } else {
    pageError.value = '知识库不存在或加载失败'
  }
  if (documentResult.status === 'fulfilled') {
    knowledgeBaseIsEmpty.value = documentResult.value.total === 0
  }
  await loadList()
})
onBeforeUnmount(() => {
  stopGeneration(false)
  if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame)
  streamVersion += 1
})
</script>

<template>
  <main class="conv-page">
    <div v-if="pageError" class="conv-error" role="alert">{{ pageError }}</div>
    <div class="conv-layout">
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

      <section class="conv-thread" data-testid="conversation-thread" aria-label="会话内容">
        <header v-if="selectedConversation" class="conv-thread-header">
          <div class="conv-thread-heading">
            <h1>{{ selectedConversation.title }}</h1>
            <div class="conv-thread-meta">
              <span>{{ knowledgeBaseName || '知识库' }}</span>
              <span aria-hidden="true">·</span>
              <time :datetime="selectedConversation.updated_at">
                {{ new Date(selectedConversation.updated_at).toLocaleString('zh-CN') }}
              </time>
            </div>
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
          <div
            v-else-if="showEmptyKnowledgeBaseOnboarding"
            class="conv-empty conv-empty-knowledge-base"
            data-testid="empty-knowledge-base-onboarding"
          >
            <span class="conv-empty-kicker">NO MATERIALS YET</span>
            <strong>这个知识空间还没有资料</strong>
            <p>导入文档或代码后，TraceMind 才能用可检查的证据回答；也可以先使用 Direct 模式开始会话。</p>
            <div class="conv-empty-actions">
              <RouterLink
                :to="{
                  path: `/knowledge-bases/${knowledgeBaseId}/documents`,
                  query: { import: '1' },
                }"
                class="conv-empty-import"
              >
                导入资料
              </RouterLink>
              <button class="conv-empty-direct" type="button" @click="continueWithoutDocuments">
                仍然开始对话
              </button>
            </div>
          </div>
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
                  msg.role === 'user' ? 'YOU' : 'TRACEMIND ANSWER'
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

              <details
                v-if="msg.role === 'assistant' && traceSummary(msg).length"
                class="msg-lineage"
                :class="{ 'is-live': isLiveTrace(msg) }"
                aria-label="Execution Trace"
                :open="isTraceExpanded(msg)"
                :role="isLiveTrace(msg) ? 'status' : undefined"
                :aria-live="isLiveTrace(msg) ? 'polite' : undefined"
                @toggle="handleTraceToggle(msg, $event)"
              >
                <summary
                  class="msg-lineage-head"
                  @click="handleTraceSummaryClick(msg, $event)"
                >
                  <span v-if="isLiveTrace(msg)" class="lineage-live-title">
                    <strong>Execution Trace</strong>
                    <span>执行链路</span>
                  </span>
                  <strong v-else>{{ traceCompactSummary(msg) }}</strong>
                  <span v-if="!isLiveTrace(msg)" class="lineage-toggle-label">展开</span>
                </summary>
                <div class="msg-lineage-body">
                  <ol class="msg-lineage-steps">
                    <li
                      v-for="step in traceSummary(msg)"
                      :key="step.phase"
                      :class="`trace-${step.state}`"
                      :data-state="step.state"
                    >
                      <span class="lineage-marker" aria-hidden="true"></span>
                      <span class="lineage-copy">
                        <strong>{{ step.label }}</strong>
                        <small>{{ step.detail }}</small>
                      </span>
                    </li>
                  </ol>
                </div>
              </details>

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
                ref="composerInput"
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

      <button
        v-if="evidenceVisible"
        class="evidence-backdrop"
        type="button"
        aria-label="关闭证据检查器"
        @click="evidenceVisible = false"
      ></button>
      <aside
        v-if="evidenceVisible"
        id="evidence-inspector"
        class="conv-evidence"
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
