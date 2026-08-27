import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { ElMessageBox } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getKnowledgeBase } from '@/services/knowledgeBases'
import {
  deleteKnowledgeEntry,
  getKnowledgeEntry,
  requestKnowledgeEntryIndex,
  updateKnowledgeEntry,
} from '@/services/knowledgeEntries'
import type { KnowledgeEntry } from '@/types/knowledgeEntry'
import KnowledgeDetailView from '@/views/KnowledgeDetailView.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { knowledgeBaseId: 'kb', entryId: 'entry' } }),
  useRouter: () => ({ push }),
}))
vi.mock('@/services/knowledgeBases', () => ({ getKnowledgeBase: vi.fn() }))
vi.mock('@/services/knowledgeEntries', () => ({
  deleteKnowledgeEntry: vi.fn(),
  getKnowledgeEntry: vi.fn(),
  requestKnowledgeEntryIndex: vi.fn(),
  updateKnowledgeEntry: vi.fn(),
}))

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'entry',
    knowledge_base_id: 'kb',
    question: 'How should transaction boundaries be repaired?',
    background: 'A write was split across services.',
    root_cause: 'Two independent commits created partial state.',
    solution: '## Use one boundary\n\nKeep the write in a single transaction and cite [S1].',
    failed_attempts: ['Increasing retries hid the partial commit.'],
    validation_status: 'verified',
    tags: ['postgres', 'transaction'],
    source_conversation_id: 'conversation',
    source_user_message_id: 'user',
    source_assistant_message_id: 'assistant',
    question_snapshot: 'Why did the write partially commit?',
    answer_snapshot: 'The transaction boundary was split. [S1]',
    sources_snapshot: [
      {
        source_id: 'S1',
        source_type: 'document',
        knowledge_base_id: 'kb',
        document_id: 'document',
        document_version_id: 'version',
        chunk_id: 'chunk',
        document_name: 'Transaction Guide.md',
        relative_path: 'docs/Transaction Guide.md',
        version_number: 2,
        chunk_index: 3,
        content: 'All writes share one transaction boundary.',
        content_hash: 'a'.repeat(64),
        chunk_type: 'paragraph',
        language: null,
        section_title: 'Transactions',
        page_number: null,
        start_line: null,
        end_line: null,
      },
    ],
    generation_metadata_snapshot: null,
    index_status: 'succeeded',
    active_index_generation: 'generation',
    index_started_at: null,
    indexed_at: '2026-08-25T00:00:00Z',
    indexed_chunk_count: 3,
    embedding_model: 'model',
    embedding_dimension: 1024,
    index_error_code: null,
    index_error_message: null,
    created_at: '2026-08-24T00:00:00Z',
    updated_at: '2026-08-25T00:00:00Z',
    ...overrides,
  }
}

const KnowledgeEntryFormDialogStub = defineComponent({
  name: 'KnowledgeEntryFormDialog',
  props: ['modelValue', 'initialValue'],
  emits: ['submit', 'update:modelValue'],
  template:
    '<button data-testid="knowledge-form-submit" @click="$emit(\'submit\', initialValue)">提交编辑</button>',
})

function mountView() {
  return mount(KnowledgeDetailView, {
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        KnowledgeEntryFormDialog: KnowledgeEntryFormDialogStub,
      },
    },
  })
}

function findButton(wrapper: ReturnType<typeof mountView>, label: string) {
  const button = wrapper.findAll('button').find((item) => item.text().includes(label))
  if (!button) throw new Error(`Button not found: ${label}`)
  return button
}

describe('KnowledgeDetailView', () => {
  beforeEach(() => {
    push.mockReset()
    vi.restoreAllMocks()
    vi.mocked(getKnowledgeBase).mockResolvedValue({
      id: 'kb',
      name: 'Backend',
      description: null,
      created_at: '',
      updated_at: '',
    })
    vi.mocked(getKnowledgeEntry).mockResolvedValue(makeEntry())
    vi.mocked(updateKnowledgeEntry).mockResolvedValue(makeEntry())
    vi.mocked(requestKnowledgeEntryIndex).mockResolvedValue(makeEntry({ index_status: 'pending' }))
    vi.mocked(deleteKnowledgeEntry).mockResolvedValue(undefined)
  })

  it('renders the knowledge record, solution, evidence snapshot and live lineage', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('How should transaction boundaries be repaired?')
    expect(wrapper.text()).toContain('A write was split across services.')
    expect(wrapper.text()).toContain('Two independent commits')
    expect(wrapper.text()).toContain('Use one boundary')
    expect(wrapper.text()).toContain('Increasing retries')
    expect(wrapper.get('[data-testid="knowledge-status-section"]').text()).toContain('已验证')
    expect(wrapper.get('[data-testid="knowledge-status-section"]').text()).toContain(
      '可用于问答检索',
    )

    const evidence = wrapper.get('[data-testid="evidence-snapshot"]')
    expect(evidence.text()).toContain('[S1]')
    expect(evidence.text()).toContain('Transaction Guide.md')
    expect(evidence.text()).toContain('已保存证据快照')
    expect(evidence.find('a').exists()).toBe(false)

    const lineage = wrapper.get('[data-testid="knowledge-lineage"]')
    expect(lineage.get('a').attributes('href')).toBe(
      '/knowledge-bases/kb/chat?conversation=conversation',
    )
    expect(lineage.text()).toContain('原始回答快照已保留')
    expect(wrapper.get('[data-testid="knowledge-index-section"]').text()).toContain('索引就绪')
    expect(wrapper.get('[data-testid="knowledge-index-section"]').text()).toContain(
      '已索引 3 个知识片段',
    )
  })

  it('keeps preserved snapshots visible when the source conversation is unavailable', async () => {
    vi.mocked(getKnowledgeEntry).mockResolvedValue(
      makeEntry({
        source_conversation_id: null,
        source_user_message_id: null,
        source_assistant_message_id: null,
        validation_status: 'unverified',
        index_status: 'not_indexed',
      }),
    )
    const wrapper = mountView()
    await flushPromises()

    const lineage = wrapper.get('[data-testid="knowledge-lineage"]')
    expect(lineage.text()).toContain('来源会话已不可用')
    expect(lineage.text()).toContain('原始问答与证据快照仍然保留')
    expect(wrapper.get('[data-testid="evidence-snapshot"]').text()).toContain('[S1]')
    expect(wrapper.get('[data-testid="knowledge-status-section"]').text()).toContain(
      '不参与问答检索',
    )
  })

  it('keeps verification separate from a failed index and supports retry', async () => {
    vi.mocked(getKnowledgeEntry).mockResolvedValue(
      makeEntry({ index_status: 'failed', active_index_generation: null }),
    )
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="knowledge-status-section"]').text()).toContain('已验证')
    expect(wrapper.get('.knowledge-rag-availability').attributes('data-availability')).toBe(
      'failed',
    )
    const index = wrapper.get('[data-testid="knowledge-index-section"]')
    expect(index.text()).toContain('索引失败')
    expect(index.text()).toContain('知识验证状态未改变')

    await findButton(wrapper, '重试索引').trigger('click')
    await flushPromises()
    expect(requestKnowledgeEntryIndex).toHaveBeenCalledWith('kb', 'entry', true)
  })

  it('preserves real edit and confirmed delete actions', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const wrapper = mountView()
    await flushPromises()

    await findButton(wrapper, '编辑知识').trigger('click')
    expect(wrapper.getComponent(KnowledgeEntryFormDialogStub).props('modelValue')).toBe(true)
    await wrapper.get('[data-testid="knowledge-form-submit"]').trigger('click')
    await flushPromises()
    expect(updateKnowledgeEntry).toHaveBeenCalledWith(
      'kb',
      'entry',
      expect.objectContaining({ question: 'How should transaction boundaries be repaired?' }),
    )

    await wrapper.get('.knowledge-detail-menu summary').trigger('click')
    await findButton(wrapper, '删除').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalled()
    expect(deleteKnowledgeEntry).toHaveBeenCalledWith('kb', 'entry')
    expect(push).toHaveBeenCalledWith('/knowledge-bases/kb/knowledge')
  })
})
