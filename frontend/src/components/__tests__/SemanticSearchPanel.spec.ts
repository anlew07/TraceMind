import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SemanticSearchPanel from '@/components/SemanticSearchPanel.vue'
import { ApiError } from '@/services/api'
import { hybridSearch, rerankedSearch, semanticSearch } from '@/services/documents'
import type { DocumentItem, SemanticSearchResult } from '@/types/document'

vi.mock('@/services/documents', () => ({
  hybridSearch: vi.fn(),
  rerankedSearch: vi.fn(),
  semanticSearch: vi.fn(),
}))

const mockedSearch = vi.mocked(semanticSearch)
const mockedHybridSearch = vi.mocked(hybridSearch)
const mockedRerankedSearch = vi.mocked(rerankedSearch)

const document: DocumentItem = {
  id: 'document-id',
  knowledge_base_id: 'kb-id',
  name: 'service.py',
  relative_path: 'backend/service.py',
  source_type: 'upload',
  created_at: '2026-08-26T00:00:00Z',
  updated_at: '2026-08-26T00:00:00Z',
  version_count: 1,
  latest_version: {
    id: 'version-id',
    version_number: 2,
    content_hash: 'a'.repeat(64),
    file_size: 512,
    mime_type: 'text/x-python',
    extension: '.py',
    created_at: '2026-08-26T00:00:00Z',
    parse_status: 'succeeded',
    parser_name: 'tree-sitter',
    parser_version: '1',
    chunk_count: 2,
    parse_started_at: null,
    parsed_at: '2026-08-26T00:00:00Z',
    last_parse_attempt_at: null,
    parse_error_code: null,
    parse_error_message: null,
    index_status: 'succeeded',
    active_index_generation: 'generation-id',
    index_started_at: null,
    indexed_at: '2026-08-26T00:00:00Z',
    last_index_attempt_at: null,
    indexed_chunk_count: 2,
    embedding_model: 'model',
    embedding_dimension: 1024,
    index_error_code: null,
    index_error_message: null,
  },
}

function result(overrides: Partial<SemanticSearchResult> = {}): SemanticSearchResult {
  return {
    score: 0.71234,
    content: 'class DocumentService:\n    pass',
    knowledge_base_id: 'kb-id',
    document_id: 'document-id',
    document_version_id: 'version-id',
    chunk_id: 'chunk-id',
    index_generation: 'generation-id',
    document_name: 'service.py',
    relative_path: 'backend/service.py',
    version_number: 2,
    chunk_index: 3,
    content_hash: 'a'.repeat(64),
    chunk_type: 'code',
    language: 'python',
    section_title: 'Document service',
    page_number: null,
    start_line: 10,
    end_line: 14,
    ranking_mode: 'hybrid',
    retrieval_score: 0.71234,
    rerank_score: null,
    retrieval_rank: 2,
    ...overrides,
  }
}

function mountPanel() {
  return mount(SemanticSearchPanel, {
    props: { knowledgeBaseId: 'kb-id', documents: [document] },
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a data-testid="document-link"><slot /></a>',
        },
      },
    },
  })
}

async function submit(wrapper: ReturnType<typeof mountPanel>, query = 'service layer') {
  await wrapper.get('textarea[aria-label="检索查询"]').setValue(query)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

function modeButton(wrapper: ReturnType<typeof mountPanel>, label: string) {
  return wrapper.findAll('[role="radio"]').find((button) => button.text().includes(label))!
}

describe('SemanticSearchPanel retrieval workbench', () => {
  beforeEach(() => {
    mockedSearch.mockReset()
    mockedHybridSearch.mockReset()
    mockedRerankedSearch.mockReset()
  })

  it('defaults to one Hybrid request with a truthful mode description', async () => {
    mockedHybridSearch.mockResolvedValue({ items: [result()] })
    const wrapper = mountPanel()

    expect(modeButton(wrapper, 'Hybrid').attributes('aria-checked')).toBe('true')
    expect(wrapper.text()).toContain('Dense + BM25 · RRF')
    await submit(wrapper)

    expect(mockedHybridSearch).toHaveBeenCalledWith('kb-id', 'service layer', null, 5, null)
    expect(mockedSearch).not.toHaveBeenCalled()
    expect(mockedRerankedSearch).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('RRF score 0.7123')
    expect(wrapper.text()).not.toContain('%')
  })

  it('runs Semantic against the dense endpoint and labels cosine without a percentage', async () => {
    mockedSearch.mockResolvedValue({
      items: [result({ ranking_mode: 'dense', retrieval_score: null })],
    })
    const wrapper = mountPanel()
    await modeButton(wrapper, 'Semantic').trigger('click')
    await submit(wrapper)

    expect(mockedSearch).toHaveBeenCalledWith('kb-id', 'service layer', null, 5, null)
    expect(wrapper.text()).toContain('Cosine score 0.7123')
    expect(wrapper.text()).not.toContain('相似度')
  })

  it('runs Reranked once and uses API retrieval rank for the ranking shift', async () => {
    mockedRerankedSearch.mockResolvedValue({
      items: [
        result({
          score: 1.8245,
          ranking_mode: 'reranker',
          rerank_score: 1.8245,
          retrieval_score: 0.31,
          retrieval_rank: 7,
        }),
      ],
    })
    const wrapper = mountPanel()
    await modeButton(wrapper, 'Reranked').trigger('click')
    await submit(wrapper)

    expect(mockedRerankedSearch).toHaveBeenCalledWith('kb-id', 'service layer', null, 5, null)
    expect(wrapper.text()).toContain('Retrieved #7 → Reranked #1')
    expect(wrapper.text()).toContain('Rerank score 1.8245')
    expect(wrapper.text()).not.toContain('probability')
    expect(wrapper.text()).not.toContain('概率')
  })

  it('sends the selected real document scope and limit', async () => {
    mockedHybridSearch.mockResolvedValue({ items: [] })
    const wrapper = mountPanel()
    await wrapper.get('select[aria-label="文档范围"]').setValue('document-id')
    await wrapper.get('select[aria-label="结果数量"]').setValue('10')
    await submit(wrapper)

    expect(mockedHybridSearch).toHaveBeenCalledWith(
      'kb-id',
      'service layer',
      null,
      10,
      'document-id',
    )
  })

  it('shows path scope and semantic query only when the API returns an exact scope', async () => {
    mockedHybridSearch.mockResolvedValue({
      items: [result()],
      path_scope_mode: 'exact',
      scoped_relative_path: 'src/main/java/demo/UserService.java',
      semantic_query: 'source 方法返回什么？',
    })
    const wrapper = mountPanel()
    await submit(wrapper, 'src/main/java/demo/UserService.java 中 source 方法返回什么？')

    const scope = wrapper.get('[data-testid="retrieval-path-scope"]')
    expect(scope.text()).toContain('src/main/java/demo/UserService.java')
    expect(scope.text()).toContain('source 方法返回什么？')
    expect(scope.text()).not.toContain('AI Rewritten')
    expect(scope.text()).not.toContain('Original Query')
  })

  it('does not manufacture a rewrite section when no path scope is returned', async () => {
    mockedHybridSearch.mockResolvedValue({
      items: [result()],
      path_scope_mode: 'none',
      semantic_query: 'should stay hidden',
    })
    const wrapper = mountPanel()
    await submit(wrapper)

    expect(wrapper.find('[data-testid="retrieval-path-scope"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('should stay hidden')
  })

  it('keeps a successful zero-result response separate from an error', async () => {
    mockedHybridSearch.mockResolvedValue({ items: [] })
    const wrapper = mountPanel()
    await submit(wrapper, 'missing evidence')

    expect(wrapper.text()).toContain('No retrieval results')
    expect(wrapper.text()).toContain('放宽 Document scope')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows Reranker unavailable as a recoverable 503 instead of empty results', async () => {
    mockedRerankedSearch.mockRejectedValue(new ApiError(503, 'private detail'))
    const wrapper = mountPanel()
    await modeButton(wrapper, 'Reranked').trigger('click')
    await submit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toContain('Reranker unavailable')
    expect(wrapper.text()).not.toContain('No retrieval results')
    await wrapper.get('[role="alert"] button').trigger('click')
    expect(modeButton(wrapper, 'Hybrid').attributes('aria-checked')).toBe('true')
  })

  it('keeps the Inspector closed until a result is selected and exposes real result fields', async () => {
    mockedHybridSearch.mockResolvedValue({ items: [result()] })
    const wrapper = mountPanel()
    await submit(wrapper)

    expect(wrapper.find('#retrieval-inspector').exists()).toBe(false)
    await wrapper.get('.retrieval-result-select').trigger('click')

    const inspector = wrapper.get('#retrieval-inspector')
    expect(inspector.text()).toContain('RESULT INSPECTOR')
    expect(inspector.text()).toContain('backend/service.py')
    expect(inspector.text()).toContain('Document service')
    expect(inspector.text()).toContain('Lines')
    expect(inspector.text()).toContain('0.7123')
    expect(inspector.text()).not.toContain('generation-id')
    expect(inspector.text()).not.toContain('content hash')
    expect(wrapper.get('[data-testid="document-link"]').text()).toContain('打开 Document')

    await inspector.get('button[aria-label="关闭检索结果详情"]').trigger('click')
    expect(wrapper.find('#retrieval-inspector').exists()).toBe(false)
  })

  it('renders returned content as text rather than HTML', async () => {
    mockedHybridSearch.mockResolvedValue({
      items: [result({ content: '<strong>unsafe</strong>' })],
    })
    const wrapper = mountPanel()
    await submit(wrapper)
    await wrapper.get('.retrieval-result-select').trigger('click')

    expect(wrapper.find('.retrieval-result-excerpt strong').exists()).toBe(false)
    expect(wrapper.get('.retrieval-inspector-content pre').element.textContent).toBe(
      '<strong>unsafe</strong>',
    )
  })
})
