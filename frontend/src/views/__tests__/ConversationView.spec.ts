import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElMessageBox } from 'element-plus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
} from '@/services/conversations'
import { getKnowledgeBase } from '@/services/knowledgeBases'
import { listDocuments } from '@/services/documents'
import { createKnowledgeEntry } from '@/services/knowledgeEntries'
import { streamRagAnswer } from '@/services/rag'
import type { RagStreamHandlers } from '@/services/rag'
import type { Conversation, ConversationDetail, ConversationMessage } from '@/types/conversation'
import type { RagDoneEvent, RagSource } from '@/types/rag'
import ConversationView from '@/views/ConversationView.vue'

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { knowledgeBaseId: 'kb' } }),
  useRouter: () => ({ push: routerPush }),
  RouterLink: { props: ['to'], template: '<a :data-to="JSON.stringify(to)"><slot /></a>' },
}))
vi.mock('@/services/conversations', () => ({
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  getConversation: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
}))
vi.mock('@/services/rag', () => ({ streamRagAnswer: vi.fn() }))
vi.mock('@/services/knowledgeBases', () => ({ getKnowledgeBase: vi.fn() }))
vi.mock('@/services/documents', () => ({ listDocuments: vi.fn() }))
vi.mock('@/services/knowledgeEntries', () => ({ createKnowledgeEntry: vi.fn() }))

const mockedList = vi.mocked(listConversations)
const mockedCreate = vi.mocked(createConversation)
const mockedDelete = vi.mocked(deleteConversation)
const mockedGet = vi.mocked(getConversation)
const mockedRename = vi.mocked(renameConversation)
const mockedStream = vi.mocked(streamRagAnswer)
const mockedCreateKnowledge = vi.mocked(createKnowledgeEntry)
const mockedListDocuments = vi.mocked(listDocuments)
const wrappers: VueWrapper[] = []

const conv: Conversation = {
  id: 'c1',
  knowledge_base_id: 'kb',
  title: 'First',
  created_at: '2026-07-29T00:00:00Z',
  updated_at: '2026-07-29T01:00:00Z',
}
const conv2: Conversation = { ...conv, id: 'c2', title: 'Second' }
const src: RagSource = {
  source_id: 'S1',
  score: 0.9,
  content: 'first source excerpt',
  knowledge_base_id: 'kb',
  document_id: 'd1',
  document_version_id: 'v1',
  chunk_id: 'ch1',
  index_generation: 'g1',
  document_name: 'doc.md',
  relative_path: 'docs/doc.md',
  version_number: 1,
  chunk_index: 0,
  content_hash: 'a'.repeat(64),
  chunk_type: 'text',
  language: null,
  section_title: 'Setup',
  page_number: null,
  start_line: 2,
  end_line: 4,
}

function message(
  id: string,
  content: string,
  sources: RagSource[] | null = null,
  status: ConversationMessage['status'] = 'completed',
  conversationId = 'c1',
  role: ConversationMessage['role'] = 'assistant',
  metadata: ConversationMessage['generation_metadata'] = null,
): ConversationMessage {
  return {
    id,
    conversation_id: conversationId,
    role,
    status,
    content,
    trace_id: 'trace-1',
    sources,
    generation_metadata: metadata,
    created_at: '2026-07-29T01:00:00Z',
  }
}

function detail(
  conversation: Conversation,
  messages: ConversationMessage[] = [],
): ConversationDetail {
  return { ...conversation, messages }
}

function doneEvent(overrides: Partial<RagDoneEvent> = {}): RagDoneEvent {
  return {
    trace_id: 'trace-1',
    terminal_status: 'completed',
    grounded: true,
    valid_citation_count: 1,
    invalid_citation_count: 0,
    qdrant_latency_ms: 20,
    retrieval_mode: 'hybrid_reranker',
    rerank_latency_ms: 10,
    reranker_fallback: false,
    query_rewrite_mode: 'rewritten',
    query_rewrite_latency_ms: 5,
    history_turn_count: 1,
    source_count: 1,
    ...overrides,
  }
}

function mountView(options: { attachTo?: Element } = {}): VueWrapper {
  const wrapper = mount(ConversationView, {
    ...options,
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :data-to="to"><slot /></a>' },
        ElDropdown: { template: '<div><slot /><slot name="dropdown" /></div>' },
        ElDropdownMenu: { template: '<div><slot /></div>' },
        ElDropdownItem: {
          emits: ['click'],
          template: '<button @click.stop="$emit(\'click\')"><slot /></button>',
        },
        KnowledgeEntryFormDialog: {
          props: ['modelValue'],
          emits: ['submit'],
          template:
            "<button v-if=\"modelValue\" data-testid=\"submit-knowledge\" @click=\"$emit('submit', { question: 'Question', background: null, root_cause: null, solution: 'Answer', failed_attempts: [], validation_status: 'unverified', tags: [] })\">Submit knowledge</button>",
        },
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

function buttonByText(wrapper: VueWrapper, text: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (!button) throw new Error(`Button not found: ${text}`)
  return button
}

describe('ConversationView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockedList.mockReset()
    mockedCreate.mockReset()
    mockedDelete.mockReset()
    mockedGet.mockReset()
    mockedRename.mockReset()
    mockedStream.mockReset()
    mockedCreateKnowledge.mockReset()
    mockedListDocuments.mockReset()
    mockedListDocuments.mockResolvedValue({ items: [], total: 1, offset: 0, limit: 1 })
    vi.mocked(getKnowledgeBase).mockResolvedValue({
      id: 'kb',
      name: 'KB',
      description: null,
      created_at: '',
      updated_at: '',
    })
    mockedList.mockResolvedValue({ items: [conv], total: 1, offset: 0, limit: 100 })
    mockedGet.mockResolvedValue(detail(conv))
  })

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  it('loads the conversation list and renders an assistant answer', async () => {
    mockedGet.mockResolvedValue(
      detail(conv, [
        message(
          'a1',
          'Answer with evidence [S1]',
          [src],
          'completed',
          'c1',
          'assistant',
          doneEvent(),
        ),
      ]),
    )

    const wrapper = mountView()
    await flushPromises()

    expect(mockedList).toHaveBeenCalledWith('kb')
    expect(wrapper.get('[data-testid="conversation-c1"]').text()).toContain('First')
    expect(wrapper.get('[data-message-id="a1"]').text()).toContain('Answer with evidence')
    expect(wrapper.get('[data-message-id="a1"] .msg-who').text()).toBe('TRACEMIND 回答')
    expect(wrapper.get('[data-message-id="a1"] .msg-evidence-strip').text()).toContain('[S1]')
    expect(wrapper.find('#evidence-inspector').exists()).toBe(false)

    await wrapper.get('[data-message-id="a1"] .cite-btn').trigger('click')
    await flushPromises()

    expect(wrapper.get('.ev-head').text()).toContain('来源详情')
    expect(wrapper.get('[data-testid="evidence-source-a1-S1"]').text()).toContain(
      'first source excerpt',
    )

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#evidence-inspector').exists()).toBe(false)
  })

  it('offers the existing import flow when the knowledge base has no documents', async () => {
    mockedListDocuments.mockResolvedValue({ items: [], total: 0, offset: 0, limit: 1 })
    const wrapper = mountView()
    await flushPromises()

    const onboarding = wrapper.get('[data-testid="empty-knowledge-base-onboarding"]')
    expect(onboarding.text()).toContain('这个知识空间还没有资料')
    expect(onboarding.get('.conv-empty-import').attributes('data-to')).toContain(
      '/knowledge-bases/kb/documents',
    )
    expect(onboarding.get('.conv-empty-import').attributes('data-to')).toContain('import')
  })

  it('allows Direct-mode conversation without documents', async () => {
    mockedListDocuments.mockResolvedValue({ items: [], total: 0, offset: 0, limit: 1 })
    mockedList.mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 })
    mockedCreate.mockResolvedValue(conv)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('.conv-empty-direct').trigger('click')
    await flushPromises()

    expect(mockedCreate).toHaveBeenCalledWith('kb')
    expect(wrapper.find('[data-testid="empty-knowledge-base-onboarding"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="conversation-composer"]').exists()).toBe(true)
  })

  it('does not block conversation when the document probe fails', async () => {
    mockedListDocuments.mockRejectedValue(new Error('offline'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="empty-knowledge-base-onboarding"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="conversation-composer"]').exists()).toBe(true)
  })

  it('opens evidence only from a citation and hides it again on close', async () => {
    mockedGet.mockResolvedValue(detail(conv, [message('a1', 'Answer [S1]', [src])]))

    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('#evidence-inspector').exists()).toBe(false)

    await wrapper.get('[data-message-id="a1"] .cite-btn').trigger('click')
    await flushPromises()
    expect(wrapper.get('#evidence-inspector').isVisible()).toBe(true)
    expect(wrapper.get('[data-testid="evidence-source-a1-S1"]').attributes('aria-current')).toBe(
      'true',
    )

    await wrapper.get('button[aria-label="关闭证据"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('#evidence-inspector').exists()).toBe(false)
  })

  it('keeps the message viewport as the only scrolling region around the fixed composer', async () => {
    const wrapper = mountView()
    await flushPromises()

    const thread = wrapper.get('[data-testid="conversation-thread"]')
    const viewport = thread.get('[data-testid="message-viewport"]')
    const composer = thread.get('[data-testid="conversation-composer"]')

    expect(viewport.element.parentElement).toBe(thread.element)
    expect(composer.element.parentElement).toBe(thread.element)
    expect(viewport.element.contains(composer.element)).toBe(false)
  })

  it('creates a conversation from the empty state', async () => {
    const created = { ...conv, id: 'new', title: 'New' }
    mockedList.mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 })
    mockedCreate.mockResolvedValue(created)
    mockedGet.mockResolvedValue(detail(created))

    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="new-conversation-empty"]').trigger('click')
    await flushPromises()

    expect(mockedCreate).toHaveBeenCalledWith('kb')
    expect(wrapper.find('[data-testid="conversation-composer"]').exists()).toBe(true)
  })

  it('streams an answer through retrieval, tokens, and completed state', async () => {
    const persisted = message(
      'assistant-stream',
      'Streamed answer [S1]',
      [src],
      'completed',
      'c1',
      'assistant',
      doneEvent(),
    )
    mockedGet.mockResolvedValueOnce(detail(conv)).mockResolvedValue(detail(conv, [persisted]))
    mockedStream.mockImplementation(async (_knowledgeBaseId, _request, handlers) => {
      handlers.onPipeline({
        trace_id: 'trace-1',
        message_id: 'assistant-stream',
        phase: 'routing',
        status: 'completed',
        metadata: { route_mode: 'rag' },
      })
      for (const phase of ['query_rewrite', 'retrieval', 'rerank', 'evidence'] as const) {
        handlers.onPipeline({
          trace_id: 'trace-1',
          message_id: 'assistant-stream',
          phase,
          status: 'completed',
        })
      }
      handlers.onSources({
        trace_id: 'trace-1',
        message_id: 'assistant-stream',
        source_count: 1,
        sources: [src],
      })
      handlers.onToken({
        trace_id: 'trace-1',
        message_id: 'assistant-stream',
        text: 'Streamed answer [S1]',
      })
      handlers.onPipeline({
        trace_id: 'trace-1',
        message_id: 'assistant-stream',
        phase: 'generation',
        status: 'completed',
      })
      handlers.onDone(doneEvent({ message_id: 'assistant-stream' }))
    })

    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('input[aria-label="你的问题"]').setValue('How does it work?')
    await wrapper.get('[data-testid="conversation-composer"]').trigger('submit')
    await flushPromises()

    expect(mockedStream).toHaveBeenCalledWith(
      'kb',
      { query: 'How does it work?', language: null, conversation_id: 'c1' },
      expect.any(Object),
      expect.any(AbortSignal),
    )
    expect(wrapper.text()).toContain('Streamed answer')
    expect(wrapper.text()).toContain('已完成')
    expect(wrapper.find('#evidence-inspector').exists()).toBe(false)

    await wrapper.get('[data-message-id="assistant-stream"] .cite-btn').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="evidence-source-assistant-stream-S1"]').text()).toContain(
      'first source excerpt',
    )
  })

  it('keeps no-answer terminal status from the V2 done event', async () => {
    const noAnswerDone = doneEvent({
      terminal_status: 'no_answer',
      grounded: false,
      valid_citation_count: 0,
      source_count: 0,
      route_mode: 'rag',
      retrieval_mode: 'hybrid',
    })
    const persisted = message(
      'assistant-no-answer',
      'No relevant information',
      null,
      'no_answer',
      'c1',
      'assistant',
      noAnswerDone,
    )
    mockedGet.mockResolvedValueOnce(detail(conv)).mockResolvedValue(detail(conv, [persisted]))
    mockedStream.mockImplementation(async (_knowledgeBaseId, _request, handlers) => {
      handlers.onNoAnswer({
        trace_id: 'trace-1',
        message_id: 'assistant-no-answer',
        message: 'No relevant information',
      })
      handlers.onDone({ ...noAnswerDone, message_id: 'assistant-no-answer' })
    })

    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('input[aria-label="你的问题"]').setValue('Unknown question')
    await wrapper.get('[data-testid="conversation-composer"]').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('No relevant information')
    const trace = wrapper.get('[data-message-id="assistant-no-answer"] .msg-lineage')
    expect(trace.attributes('open')).toBeUndefined()
    expect(trace.text()).toContain('Query Rewrite')
    expect(trace.text()).toContain('Retrieval')
    expect(trace.text()).toContain('Rerank')
    expect(trace.text()).toContain('Evidence')
    expect(trace.text()).not.toContain('Generation')
  })

  it('shows the safe message from a V2 error event', async () => {
    mockedStream.mockImplementation(async (_knowledgeBaseId, _request, handlers) => {
      handlers.onError({
        trace_id: 'trace-1',
        code: 'generation_failed',
        message: 'Safe public error',
      })
    })

    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('input[aria-label="你的问题"]').setValue('Fail safely')
    await wrapper.get('[data-testid="conversation-composer"]').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('失败')
  })

  it('cancels an active stream', async () => {
    let activeSignal: AbortSignal | undefined
    mockedStream.mockImplementation((_knowledgeBaseId, _request, _handlers, signal) => {
      activeSignal = signal
      return new Promise<void>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    })

    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('input[aria-label="你的问题"]').setValue('Cancel this')
    await wrapper.get('[data-testid="conversation-composer"]').trigger('submit')
    await flushPromises()
    await wrapper.get('[data-testid="stop-generation"]').trigger('click')
    await flushPromises()

    expect(activeSignal?.aborted).toBe(true)
    expect(wrapper.text()).toContain('已取消')
  })

  it('shows a failed state when streaming errors', async () => {
    mockedStream.mockRejectedValue(new Error('network failure'))

    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('input[aria-label="你的问题"]').setValue('Fail this')
    await wrapper.get('[data-testid="conversation-composer"]').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('失败')
    expect(wrapper.find('[data-message-id^="temporary-"].assistant').exists()).toBe(true)
  })

  it('renames the selected conversation', async () => {
    vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({ value: 'Renamed' } as never)
    mockedRename.mockResolvedValue({ ...conv, title: 'Renamed' })

    const wrapper = mountView()
    await flushPromises()
    await buttonByText(wrapper, '重命名').trigger('click')
    await flushPromises()

    expect(mockedRename).toHaveBeenCalledWith('kb', 'c1', 'Renamed')
    expect(wrapper.get('[data-testid="conversation-c1"]').text()).toContain('Renamed')
  })

  it('deletes the selected conversation and clears the thread', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    mockedDelete.mockResolvedValue()
    mockedList
      .mockResolvedValueOnce({ items: [conv], total: 1, offset: 0, limit: 100 })
      .mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 })

    const wrapper = mountView()
    await flushPromises()
    await buttonByText(wrapper, '删除').trigger('click')
    await flushPromises()

    expect(mockedDelete).toHaveBeenCalledWith('kb', 'c1')
    expect(wrapper.text()).toContain('开始一次可追溯的研究会话')
  })

  it('binds a citation to the source of its own assistant message', async () => {
    const secondSource = { ...src, content: 'second source excerpt' }
    mockedGet.mockResolvedValue(
      detail(conv, [
        message('a1', 'Earlier answer [S1]', [src]),
        message('a2', 'Latest answer [S1]', [secondSource]),
      ]),
    )
    const scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    const wrapper = mountView({ attachTo: document.body })
    await flushPromises()
    expect(wrapper.find('#evidence-inspector').exists()).toBe(false)

    const citation = wrapper.get('[data-message-id="a1"] .cite-btn')
    expect(citation.attributes('aria-label')).toBe('查看证据 S1')
    expect(citation.attributes('aria-controls')).toBe('evidence-inspector')
    await citation.trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="evidence-source-a1-S1"]').text()).toContain(
      'first source excerpt',
    )
    expect(wrapper.find('[data-testid="evidence-source-a2-S1"]').exists()).toBe(false)
    expect(scrollIntoView).toHaveBeenCalledOnce()
  })

  it('shows live pipeline updates inside the assistant trace without a progress card', async () => {
    let streamHandlers: RagStreamHandlers | undefined
    let finishStream: (() => void) | undefined
    mockedStream.mockImplementation((_knowledgeBaseId, _request, handlers) => {
      streamHandlers = handlers
      return new Promise<void>((resolve) => {
        finishStream = resolve
      })
    })

    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('input[aria-label="你的问题"]').setValue('Trace this')
    await wrapper.get('[data-testid="conversation-composer"]').trigger('submit')
    await flushPromises()

    streamHandlers?.onPipeline({
      trace_id: 'trace-live',
      message_id: 'assistant-live',
      phase: 'routing',
      status: 'completed',
      metadata: { route_mode: 'rag' },
    })
    streamHandlers?.onPipeline({
      trace_id: 'trace-live',
      message_id: 'assistant-live',
      phase: 'query_rewrite',
      status: 'started',
    })
    await flushPromises()

    const trace = wrapper.get('[data-message-id="assistant-live"] .msg-lineage')
    expect(trace.attributes('open')).toBeDefined()
    expect(trace.text()).toContain('正在理解上下文')
    expect(trace.text()).toContain('等待执行')
    expect(wrapper.find('.conv-progress').exists()).toBe(false)

    streamHandlers?.onError({
      trace_id: 'trace-live',
      message_id: 'assistant-live',
      code: 'generation_failed',
      message: 'Safe public error',
    })
    finishStream?.()
    await flushPromises()
  })

  it('does not open or select evidence when sources arrive during streaming', async () => {
    let streamHandlers: RagStreamHandlers | undefined
    let finishStream: (() => void) | undefined
    mockedStream.mockImplementation((_knowledgeBaseId, _request, handlers) => {
      streamHandlers = handlers
      return new Promise<void>((resolve) => {
        finishStream = resolve
      })
    })

    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('input[aria-label="你的问题"]').setValue('Find evidence')
    await wrapper.get('[data-testid="conversation-composer"]').trigger('submit')
    await flushPromises()

    streamHandlers?.onSources({
      trace_id: 'trace-sources',
      message_id: 'assistant-sources',
      source_count: 1,
      sources: [src],
    })
    await flushPromises()

    expect(wrapper.find('#evidence-inspector').exists()).toBe(false)
    expect(wrapper.get('[data-message-id="assistant-sources"] .cite-btn').attributes('aria-pressed')).toBe(
      'false',
    )

    streamHandlers?.onError({
      trace_id: 'trace-sources',
      message_id: 'assistant-sources',
      code: 'generation_failed',
      message: 'Safe public error',
    })
    finishStream?.()
    await flushPromises()
  })

  it('shows only real generation for a historical direct route', async () => {
    mockedGet.mockResolvedValue(
      detail(conv, [
        message(
          'direct-answer',
          'Direct answer',
          null,
          'completed',
          'c1',
          'assistant',
          doneEvent({
            grounded: false,
            route_mode: 'direct',
            source_count: 0,
            query_rewrite_mode: 'not_applicable',
          }),
        ),
      ]),
    )

    const wrapper = mountView()
    await flushPromises()

    const lineageLabels = wrapper
      .get('[data-message-id="direct-answer"]')
      .findAll('.lineage-copy strong')
      .map((item) => item.text())
    expect(lineageLabels).toEqual(['Generation'])
    expect(wrapper.get('[data-message-id="direct-answer"] .msg-lineage').attributes('open')).toBe(
      undefined,
    )
  })

  it('orders answer evidence before lineage and collapsed trace detail', async () => {
    mockedGet.mockResolvedValue(
      detail(conv, [
        message('a1', 'Answer [S1]', [src], 'completed', 'c1', 'assistant', doneEvent()),
      ]),
    )

    const wrapper = mountView()
    await flushPromises()

    const answer = wrapper.get('[data-message-id="a1"]')
    const children = Array.from(answer.element.children)
    const evidenceIndex = children.indexOf(answer.get('.msg-evidence-strip').element)
    const lineageIndex = children.indexOf(answer.get('.msg-lineage').element)
    const detailIndex = children.indexOf(answer.get('.exec-details').element)

    expect(evidenceIndex).toBeGreaterThan(-1)
    expect(evidenceIndex).toBeLessThan(lineageIndex)
    expect(lineageIndex).toBeLessThan(detailIndex)
    expect(answer.get('.msg-lineage').attributes('open')).toBeUndefined()
    expect(answer.get('.exec-details').attributes('open')).toBeUndefined()
  })

  it('keeps consecutive user queries distinct from their wider answer surfaces', async () => {
    mockedGet.mockResolvedValue(
      detail(conv, [
        message('u1', 'First question', null, 'completed', 'c1', 'user'),
        message('a1', 'First answer [S1]', [src], 'completed', 'c1', 'assistant', doneEvent()),
        message('u2', 'Second question', null, 'completed', 'c1', 'user'),
        message('a2', 'Second answer [S1]', [src], 'completed', 'c1', 'assistant', doneEvent()),
        message('u3', 'Third question', null, 'completed', 'c1', 'user'),
        message('a3', 'Third answer [S1]', [src], 'completed', 'c1', 'assistant', doneEvent()),
      ]),
    )

    const wrapper = mountView()
    await flushPromises()

    const queries = wrapper.findAll('.msg.user')
    const answers = wrapper.findAll('.msg.assistant')
    expect(queries).toHaveLength(3)
    expect(answers).toHaveLength(3)
    expect(queries.every((query) => !query.find('.msg-evidence-strip').exists())).toBe(true)
    expect(
      answers.every(
        (answer) =>
          answer.find('.assistant-body').exists() &&
          answer.find('.msg-evidence-strip').exists() &&
          answer.find('.msg-lineage').exists() &&
          answer.find('.msg-knowledge-action').exists(),
      ),
    ).toBe(true)
  })

  it('allows a terminal trace to be expanded manually', async () => {
    mockedGet.mockResolvedValue(
      detail(conv, [message('a1', 'Answer [S1]', [src], 'completed', 'c1', 'assistant', doneEvent())]),
    )

    const wrapper = mountView()
    await flushPromises()
    const trace = wrapper.get('[data-message-id="a1"] .msg-lineage')
    expect(trace.attributes('open')).toBeUndefined()
    expect(trace.get('summary').text()).toContain('5 个阶段')

    await trace.get('summary').trigger('click')
    await flushPromises()
    expect(trace.attributes('open')).toBeDefined()
    expect(trace.text()).toContain('Query Rewrite')
    expect(trace.text()).toContain('Generation')
  })

  it('renders rerank fallback with warning semantics instead of failure semantics', async () => {
    mockedGet.mockResolvedValue(
      detail(conv, [
        message(
          'fallback-answer',
          'Answer [S1]',
          [src],
          'completed',
          'c1',
          'assistant',
          doneEvent({ reranker_fallback: true }),
        ),
      ]),
    )

    const wrapper = mountView()
    await flushPromises()
    const trace = wrapper.get('[data-message-id="fallback-answer"] .msg-lineage')
    expect(trace.get('summary').text()).toContain('Rerank 已降级')
    await trace.get('summary').trigger('click')
    await flushPromises()

    const rerank = trace.get('.trace-fallback')
    expect(rerank.attributes('data-state')).toBe('fallback')
    expect(rerank.text()).toContain('已降级 · 保留检索排序')
    expect(rerank.classes()).not.toContain('trace-failed')
  })

  it('renders a knowledge entry as a distinct evidence source in the inspector', async () => {
    const knowledgeSource: RagSource = {
      ...src,
      source_id: 'S2',
      source_type: 'knowledge_entry',
      document_id: null,
      document_version_id: null,
      document_name: null,
      relative_path: null,
      knowledge_entry_id: 'knowledge-1',
      knowledge_question: '事务为什么失败？',
      knowledge_updated_at: '2026-08-14T00:00:00Z',
      chunk_type: 'knowledge_entry',
      section_title: 'Solution',
      start_line: null,
      end_line: null,
      content: '把写操作放进同一个事务。',
    }
    mockedGet.mockResolvedValue(
      detail(conv, [message('knowledge-answer', 'Answer [S2]', [knowledgeSource])]),
    )

    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-message-id="knowledge-answer"] .cite-btn').trigger('click')
    await flushPromises()
    const sourceItem = wrapper.get('[data-testid="evidence-source-knowledge-answer-S2"]')
    expect(sourceItem.text()).toContain('KNOWLEDGE')
    expect(sourceItem.text()).toContain('事务为什么失败？')
    expect(sourceItem.text()).toContain('知识条目')
  })

  it('does not replace an explicitly selected historical source during streaming retrieval', async () => {
    mockedGet.mockResolvedValue(detail(conv, [message('a1', 'Earlier answer [S1]', [src])]))
    let streamHandlers: RagStreamHandlers | undefined
    let finishStream: (() => void) | undefined
    mockedStream.mockImplementation((_knowledgeBaseId, _request, handlers) => {
      streamHandlers = handlers
      return new Promise<void>((resolve) => {
        finishStream = resolve
      })
    })

    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('input[aria-label="你的问题"]').setValue('New question')
    await wrapper.get('[data-testid="conversation-composer"]').trigger('submit')
    await flushPromises()
    await wrapper.get('[data-message-id="a1"] .cite-btn').trigger('click')

    streamHandlers?.onSources({
      trace_id: 'trace-2',
      message_id: 'assistant-stream',
      source_count: 1,
      sources: [{ ...src, content: 'streaming source excerpt' }],
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="evidence-source-a1-S1"]').text()).toContain(
      'first source excerpt',
    )
    expect(wrapper.find('[data-testid="evidence-source-assistant-stream-S1"]').exists()).toBe(false)

    streamHandlers?.onDone(doneEvent({ trace_id: 'trace-2', message_id: 'assistant-stream' }))
    finishStream?.()
    await flushPromises()
  })

  it('resets evidence selection when switching conversations', async () => {
    mockedList.mockResolvedValue({ items: [conv, conv2], total: 2, offset: 0, limit: 100 })
    mockedGet.mockImplementation(async (_knowledgeBaseId, conversationId) => {
      if (conversationId === 'c2') {
        return detail(conv2, [
          message(
            'b1',
            'Second conversation [S1]',
            [{ ...src, content: 'conversation two source' }],
            'completed',
            'c2',
          ),
        ])
      }
      return detail(conv, [message('a1', 'First conversation [S1]', [src])])
    })

    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('#evidence-inspector').exists()).toBe(false)

    await wrapper.get('[data-message-id="a1"] .cite-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="evidence-source-a1-S1"]').exists()).toBe(true)

    await wrapper.get('[data-testid="conversation-c2"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('#evidence-inspector').exists()).toBe(false)
    await wrapper.get('[data-message-id="b1"] .cite-btn').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="evidence-source-b1-S1"]').text()).toContain(
      'conversation two source',
    )
    expect(wrapper.find('[data-testid="evidence-source-a1-S1"]').exists()).toBe(false)
  })

  it('renders code evidence and multi-source provenance', async () => {
    const codeSource = {
      ...src,
      content: 'void run()',
      chunk_type: 'code',
      language: 'java',
    }
    mockedGet.mockResolvedValue(
      detail(conv, [message('a1', 'Code answer', [codeSource, { ...src, source_id: 'S2' }])]),
    )

    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-message-id="a1"] .msg-evidence-strip .cite-btn').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('CODE')
    expect(wrapper.text()).toContain('void run()')
    expect(wrapper.get('.msg-evidence-strip').text()).toContain('2 条来源')
  })

  it('saves only a persisted completed assistant answer as knowledge', async () => {
    const savedMessage = message('a1', 'Answer [S1]', [src])
    mockedGet.mockResolvedValue(
      detail(conv, [message('u1', 'Question', null, 'completed', 'c1', 'user'), savedMessage]),
    )
    mockedCreateKnowledge.mockResolvedValue({
      id: 'k1',
      knowledge_base_id: 'kb',
      question: 'Question',
      background: null,
      root_cause: null,
      solution: 'Answer',
      failed_attempts: [],
      validation_status: 'unverified',
      tags: [],
      source_conversation_id: 'c1',
      source_user_message_id: 'u1',
      source_assistant_message_id: 'a1',
      question_snapshot: 'Question',
      answer_snapshot: 'Answer [S1]',
      sources_snapshot: [src],
      generation_metadata_snapshot: null,
      index_status: 'not_indexed',
      active_index_generation: null,
      index_started_at: null,
      indexed_at: null,
      indexed_chunk_count: 0,
      embedding_model: null,
      embedding_dimension: null,
      index_error_code: null,
      index_error_message: null,
      created_at: '',
      updated_at: '',
    })

    const wrapper = mountView()
    await flushPromises()
    await buttonByText(wrapper, '保存为知识').trigger('click')
    await wrapper.get('[data-testid="submit-knowledge"]').trigger('click')
    await flushPromises()

    expect(mockedCreateKnowledge).toHaveBeenCalledWith(
      'kb',
      expect.objectContaining({ source_assistant_message_id: 'a1', question: 'Question' }),
    )
    expect(wrapper.text()).toContain('查看知识')
  })
})
