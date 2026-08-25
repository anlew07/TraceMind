import { flushPromises, mount } from '@vue/test-utils'
import { ElSelect } from 'element-plus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getKnowledgeBase } from '@/services/knowledgeBases'
import { listKnowledgeEntries } from '@/services/knowledgeEntries'
import type { KnowledgeEntry } from '@/types/knowledgeEntry'
import KnowledgeView from '@/views/KnowledgeView.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { knowledgeBaseId: 'kb' } }),
  useRouter: () => ({ push }),
}))
vi.mock('@/services/knowledgeBases', () => ({ getKnowledgeBase: vi.fn() }))
vi.mock('@/services/knowledgeEntries', () => ({
  deleteKnowledgeEntry: vi.fn(),
  listKnowledgeEntries: vi.fn(),
  updateKnowledgeEntry: vi.fn(),
}))

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'entry',
    knowledge_base_id: 'kb',
    question: 'Why did the transaction fail?',
    background: null,
    root_cause: 'Two commits',
    solution: '## Use one transaction\n\nKeep writes together.',
    failed_attempts: [],
    validation_status: 'verified',
    tags: ['postgres'],
    source_conversation_id: 'conversation',
    source_user_message_id: 'user',
    source_assistant_message_id: 'assistant',
    question_snapshot: 'Why?',
    answer_snapshot: 'Answer',
    sources_snapshot: [],
    generation_metadata_snapshot: null,
    index_status: 'succeeded',
    active_index_generation: 'generation',
    index_started_at: null,
    indexed_at: '2026-08-11T00:00:00Z',
    indexed_chunk_count: 1,
    embedding_model: 'fake',
    embedding_dimension: 3,
    index_error_code: null,
    index_error_message: null,
    created_at: '2026-08-10T00:00:00Z',
    updated_at: '2026-08-11T00:00:00Z',
    ...overrides,
  }
}

function mountView() {
  return mount(KnowledgeView, {
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        KnowledgeEntryFormDialog: true,
      },
    },
  })
}

describe('KnowledgeView', () => {
  beforeEach(() => {
    push.mockReset()
    vi.mocked(getKnowledgeBase).mockResolvedValue({
      id: 'kb',
      name: 'Backend',
      description: null,
      created_at: '',
      updated_at: '',
    })
    vi.mocked(listKnowledgeEntries).mockResolvedValue({
      items: [
        makeEntry(),
        makeEntry({
          id: 'unverified',
          question: 'Still needs review',
          validation_status: 'unverified',
          index_status: 'not_indexed',
          tags: ['review', 'windows'],
        }),
        makeEntry({
          id: 'outdated',
          question: 'Old workaround',
          validation_status: 'outdated',
          index_status: 'not_indexed',
          tags: [],
        }),
      ],
      total: 3,
      offset: 0,
      limit: 100,
      available_tags: ['postgres', 'review', 'windows'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders editorial rows with real fields, verification and RAG availability', async () => {
    const wrapper = mountView()
    await flushPromises()

    const verified = wrapper.get('[data-testid="knowledge-entry-entry"]')
    expect(verified.text()).toContain('Why did the transaction fail?')
    expect(verified.text()).toContain('Use one transaction')
    expect(verified.text()).not.toContain('##')
    expect(verified.text()).toContain('postgres')
    expect(verified.text()).toContain('已验证')
    expect(verified.text()).toContain('可用于问答检索')
    expect(verified.text()).toContain('索引就绪')

    const unverified = wrapper.get('[data-testid="knowledge-entry-unverified"]')
    expect(unverified.text()).toContain('未验证')
    expect(unverified.text()).toContain('不参与问答检索')
    expect(wrapper.get('[data-testid="knowledge-entry-outdated"]').text()).toContain('已过期')

    await verified.get('.knowledge-row-open').trigger('click')
    expect(push).toHaveBeenCalledWith('/knowledge-bases/kb/knowledge/entry')
  })

  it('renders an actionable empty state linked to the current conversation workspace', async () => {
    vi.mocked(listKnowledgeEntries).mockResolvedValue({
      items: [],
      total: 0,
      offset: 0,
      limit: 100,
      available_tags: [],
    })
    const wrapper = mountView()
    await flushPromises()

    const empty = wrapper.get('[data-testid="knowledge-empty"]')
    expect(empty.text()).toContain('还没有沉淀的知识')
    expect(empty.text()).toContain('开始问答')
    expect(empty.get('a').attributes('href')).toBe('/knowledge-bases/kb/chat')
  })

  it('uses the real search, verification and tag filters', async () => {
    vi.useFakeTimers()
    const wrapper = mountView()
    await flushPromises()
    vi.mocked(listKnowledgeEntries).mockClear()

    await wrapper.get('input[aria-label="搜索知识"]').setValue('transaction')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(listKnowledgeEntries).toHaveBeenLastCalledWith('kb', {
      query: 'transaction',
      validationStatus: '',
      tag: '',
    })

    const selects = wrapper.findAllComponents(ElSelect)
    await selects[0]!.vm.$emit('update:modelValue', 'verified')
    await flushPromises()
    expect(listKnowledgeEntries).toHaveBeenLastCalledWith('kb', {
      query: 'transaction',
      validationStatus: 'verified',
      tag: '',
    })

    await selects[1]!.vm.$emit('update:modelValue', 'postgres')
    await flushPromises()
    expect(listKnowledgeEntries).toHaveBeenLastCalledWith('kb', {
      query: 'transaction',
      validationStatus: 'verified',
      tag: 'postgres',
    })
  })
})
