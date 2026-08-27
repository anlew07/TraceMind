import { flushPromises, mount } from '@vue/test-utils'
import { ElMessage, ElMessageBox } from 'element-plus'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deleteDocument,
  downloadCurrentDocument,
  listDocuments,
  requestDocumentParse,
  requestDocumentIndex,
} from '@/services/documents'
import { getKnowledgeBase } from '@/services/knowledgeBases'
import type { DocumentItem, DocumentListResponse } from '@/types/document'
import DocumentView from '@/views/DocumentView.vue'
import { ApiError } from '@/services/api'

const mainCss = readFileSync('src/assets/main.css', 'utf8')

const routeState = {
  params: { knowledgeBaseId: 'kb-id' },
  query: {} as Record<string, string>,
}

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  RouterLink: { template: '<a><slot /></a>' },
}))
vi.mock('@/services/documents', () => ({
  listDocuments: vi.fn(),
  deleteDocument: vi.fn(),
  downloadCurrentDocument: vi.fn(),
  downloadDocumentVersion: vi.fn(),
  listDocumentVersions: vi.fn(),
  requestDocumentParse: vi.fn(),
  requestDocumentIndex: vi.fn(),
  semanticSearch: vi.fn(),
  hybridSearch: vi.fn(),
  rerankedSearch: vi.fn(),
  listDocumentChunks: vi.fn(),
  uploadDocument: vi.fn(),
}))
vi.mock('@/services/knowledgeBases', () => ({ getKnowledgeBase: vi.fn() }))

const mockedList = vi.mocked(listDocuments)
const mockedDelete = vi.mocked(deleteDocument)
const mockedDownload = vi.mocked(downloadCurrentDocument)
const mockedParse = vi.mocked(requestDocumentParse)
const mockedIndex = vi.mocked(requestDocumentIndex)
const mockedKnowledgeBase = vi.mocked(getKnowledgeBase)
const document: DocumentItem = {
  id: 'document-id',
  knowledge_base_id: 'kb-id',
  name: 'sample.md',
  relative_path: 'src/sample.md',
  source_type: 'upload',
  created_at: '2026-07-17T00:00:00Z',
  updated_at: '2026-07-17T01:00:00Z',
  version_count: 2,
  latest_version: {
    id: 'version-id',
    version_number: 2,
    content_hash: 'a'.repeat(64),
    file_size: 2048,
    mime_type: 'text/markdown',
    extension: '.md',
    created_at: '2026-07-17T01:00:00Z',
    parse_status: 'succeeded',
    parser_name: 'markdown',
    parser_version: '1',
    chunk_count: 2,
    parse_started_at: '2026-07-17T01:00:00Z',
    parsed_at: '2026-07-17T01:00:30Z',
    last_parse_attempt_at: '2026-07-17T01:00:00Z',
    parse_error_code: null,
    parse_error_message: null,
    index_status: 'succeeded',
    active_index_generation: 'generation-id',
    index_started_at: '2026-07-17T01:00:30Z',
    indexed_at: '2026-07-17T01:01:00Z',
    last_index_attempt_at: '2026-07-17T01:00:30Z',
    indexed_chunk_count: 2,
    embedding_model: 'fake',
    embedding_dimension: 3,
    index_error_code: null,
    index_error_message: null,
  },
}

function response(items: DocumentItem[]): DocumentListResponse {
  return { items, total: items.length, offset: 0, limit: 100 }
}

function mountView() {
  return mount(DocumentView, {
    global: {
      stubs: {
        DocumentUploadPanel: {
          template:
            '<button data-testid="upload-completed" @click="$emit(\'completed\')">upload</button>',
        },
        DocumentVersionDialog: true,
        DocumentChunkDialog: {
          props: ['modelValue'],
          template: '<div v-if="modelValue" data-testid="chunk-dialog" />',
        },
        RouterLink: {
          props: ['to'],
          template: '<a data-testid="retrieval-workspace-link"><slot /></a>',
        },
        ElDropdown: {
          props: ['trigger'],
          template: '<div class="el-dropdown"><slot /><slot name="dropdown" /></div>',
        },
        ElDropdownMenu: { template: '<div class="el-dropdown-menu"><slot /></div>' },
        ElDropdownItem: {
          props: ['disabled'],
          template:
            '<button :disabled="disabled" :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  })
}

describe('DocumentView', () => {
  beforeEach(() => {
    routeState.query = {}
    vi.restoreAllMocks()
    mockedList.mockReset()
    mockedDelete.mockReset()
    mockedDownload.mockReset()
    mockedParse.mockReset()
    mockedIndex.mockReset()
    mockedKnowledgeBase.mockReset()
    mockedKnowledgeBase.mockResolvedValue({
      id: 'kb-id',
      name: '技术资料',
      description: null,
      created_at: '2026-07-17T00:00:00Z',
      updated_at: '2026-07-17T00:00:00Z',
    })
    vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
    vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ close: vi.fn() }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads knowledge base and document list', async () => {
    mockedList.mockResolvedValue(response([document]))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('资料')
    expect(wrapper.text()).toContain('sample.md')
    expect(wrapper.text()).toContain('V2')
    expect(wrapper.text()).toContain('2.0 KB')
    expect(wrapper.text()).toContain('可用')
    expect(wrapper.text()).toContain('2 Chunks')
    expect(wrapper.text()).toContain('高级 · 检索工作区')
    expect(wrapper.text()).toContain('1 份资料')
  })

  it('shows a product-specific empty state with the real import action', async () => {
    mockedList.mockResolvedValue(response([]))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('[data-testid="document-empty-state"]').text()).toContain(
      '你的知识空间还没有资料',
    )
    expect(wrapper.text()).toContain('导入第一份资料')
  })

  it('shows a list failure', async () => {
    mockedList.mockRejectedValue(new Error('network'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('文档列表加载失败')
  })

  it('searches by name', async () => {
    mockedList.mockResolvedValue(response([document]))
    const wrapper = mountView()
    await flushPromises()
    const input = wrapper.get('#document-filter')
    await input.setValue('sample')
    await wrapper.get('form.doc-search-bar').trigger('submit')
    await flushPromises()
    expect(mockedList).toHaveBeenLastCalledWith('kb-id', 'sample')
  })

  it('focuses a document requested by the Knowledge Map', async () => {
    routeState.query = { query: 'src/sample.md', focusDocument: 'document-id' }
    mockedList.mockResolvedValue(response([document]))
    const wrapper = mountView()
    await flushPromises()

    expect(mockedList).toHaveBeenCalledWith('kb-id', 'src/sample.md')
    expect(wrapper.get('#document-document-id').classes()).toContain('doc-item-focused')
  })

  it('refreshes after uploads open and complete', async () => {
    mockedList.mockResolvedValue(response([document]))
    const wrapper = mountView()
    await flushPromises()
    // Open upload panel
    expect(wrapper.find('[data-testid="upload-completed"]').exists()).toBe(false)
    const importBtn = wrapper.findAll('button').find((b) => b.text() === '导入资料')
    await importBtn?.trigger('click')
    await flushPromises()
    // Trigger upload completion
    await wrapper.get('[data-testid="upload-completed"]').trigger('click')
    await flushPromises()
    expect(mockedList).toHaveBeenCalledTimes(2)
  })

  it('opens the existing import panel from the onboarding query', async () => {
    routeState.query = { import: '1' }
    mockedList.mockResolvedValue(response([]))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="upload-completed"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('收起导入')
  })

  it('keeps heading, import, search, rows, and retrieval tools on one content track', async () => {
    mockedList.mockResolvedValue(response([document]))
    const wrapper = mountView()
    await flushPromises()
    const importBtn = wrapper.findAll('button').find((button) => button.text() === '导入资料')
    await importBtn?.trigger('click')
    await flushPromises()

    const grid = wrapper.get('.document-content-grid')
    expect(grid.find('.management-header').exists()).toBe(true)
    expect(grid.find('.document-import-region').exists()).toBe(true)
    expect(grid.find('.doc-search-bar').exists()).toBe(true)
    expect(grid.find('.document-list-region .doc-list').exists()).toBe(true)
    expect(grid.find('.document-retrieval-region').exists()).toBe(true)
  })

  it('triggers current version download via dropdown', async () => {
    mockedList.mockResolvedValue(response([document]))
    const wrapper = mountView()
    await flushPromises()
    const downloadItems = wrapper.findAll('button').filter((b) => b.text() === '下载')
    await downloadItems[0]?.trigger('click')
    expect(mockedDownload).toHaveBeenCalledWith('kb-id', 'document-id')
  })

  it('requires confirmation, deletes, and refreshes', async () => {
    mockedList.mockResolvedValue(response([document]))
    mockedDelete.mockResolvedValue(undefined)
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const wrapper = mountView()
    await flushPromises()
    const deleteBtn = wrapper.get('[data-testid="delete-document-document-id"]')
    await deleteBtn.trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalled()
    expect(mockedDelete).toHaveBeenCalledWith('kb-id', 'document-id')
    expect(mockedList).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['pending', '等待解析'],
    ['processing', '解析中'],
    ['succeeded', '可用'],
    ['failed', '解析失败'],
  ] as const)('shows the %s parse state', async (parseStatus, label) => {
    mockedList.mockResolvedValue(
      response([
        { ...document, latest_version: { ...document.latest_version, parse_status: parseStatus } },
      ]),
    )
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain(label)
  })

  it.each([
    ['pending', '等待索引'],
    ['processing', '索引中'],
    ['succeeded', '可用'],
    ['failed', '索引失败'],
  ] as const)(
    'maps the %s index state to a truthful product status',
    async (indexStatus, label) => {
      mockedList.mockResolvedValue(
        response([
          {
            ...document,
            latest_version: { ...document.latest_version, index_status: indexStatus },
          },
        ]),
      )
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.text()).toContain(label)
    },
  )

  it('keeps the inspector closed until a row is selected and exposes only real metadata', async () => {
    mockedList.mockResolvedValue(response([document]))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('#document-inspector').exists()).toBe(false)
    await wrapper.get('.doc-select').trigger('click')

    const inspector = wrapper.get('#document-inspector')
    expect(inspector.text()).toContain('资料详情')
    expect(inspector.text()).toContain('src/sample.md')
    expect(inspector.text()).toContain('本地导入')
    expect(inspector.text()).toContain('text/markdown')
    expect(inspector.text()).toContain('V2 / 2')
    expect(inspector.text()).toContain('markdown 1')
    expect(inspector.text()).toContain('fake')
    expect(inspector.text()).not.toContain('Owner')
    expect(inspector.text()).not.toContain('归档')

    await inspector.get('button[aria-label="关闭文档详情"]').trigger('click')
    expect(wrapper.find('#document-inspector').exists()).toBe(false)

    await wrapper.get('.doc-select').trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#document-inspector').exists()).toBe(false)
  })

  it('keeps the document inspector out of normal flow at medium widths', () => {
    expect(mainCss).toMatch(
      /@media \(max-width: 70rem\)[\s\S]*?\.document-inspector\s*\{[\s\S]*?position:\s*fixed/,
    )
    expect(mainCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.document-inspector\s*\{[\s\S]*?width:\s*100%/,
    )
  })

  it('retries the failed real ingestion stage from the inspector', async () => {
    const failedDocument = {
      ...document,
      latest_version: {
        ...document.latest_version,
        parse_status: 'failed' as const,
        parse_error_message: 'parser unavailable',
      },
    }
    mockedList.mockResolvedValue(response([failedDocument]))
    mockedParse.mockResolvedValue({
      queued: true,
      version: { version_id: document.latest_version.id, ...failedDocument.latest_version },
    })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.doc-select').trigger('click')

    const retry = wrapper
      .get('#document-inspector')
      .findAll('button')
      .find((button) => button.text() === '重试解析')
    await retry?.trigger('click')
    await flushPromises()

    expect(mockedParse).toHaveBeenCalledWith('kb-id', 'document-id', 'version-id', false)
  })

  it('replaces the embedded retrieval debug with one dedicated workspace entry', async () => {
    mockedList.mockResolvedValue(response([document]))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="retrieval-debug-panel"]').exists()).toBe(false)
    expect(wrapper.get('.document-retrieval-link').text()).toContain('打开检索工作区')
  })

  it('starts polling for pending documents and stops after a terminal state', async () => {
    vi.useFakeTimers()
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    mockedList
      .mockResolvedValueOnce(
        response([
          { ...document, latest_version: { ...document.latest_version, parse_status: 'pending' } },
        ]),
      )
      .mockResolvedValueOnce(response([document]))
    const wrapper = mountView()
    await flushPromises()

    await vi.advanceTimersByTimeAsync(2500)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(2500)

    expect(mockedList).toHaveBeenCalledTimes(2)
    wrapper.unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('requests a force reparse and opens chunk preview via dropdown', async () => {
    mockedList.mockResolvedValue(response([document]))
    mockedParse.mockResolvedValue({
      queued: true,
      version: {
        version_id: document.latest_version.id,
        ...document.latest_version,
      },
    })
    const wrapper = mountView()
    await flushPromises()

    const reparse = wrapper.findAll('button').find((b) => b.text() === '重新解析')
    await reparse?.trigger('click')
    await flushPromises()
    expect(mockedParse).toHaveBeenCalledWith('kb-id', 'document-id', 'version-id', true)

    const chunks = wrapper.findAll('button').find((b) => b.text() === '查看 Chunk')
    await chunks?.trigger('click')
    expect(wrapper.find('[data-testid="chunk-dialog"]').exists()).toBe(true)
  })

  it('shows index state and requests a force reindex via dropdown', async () => {
    mockedList.mockResolvedValue(response([document]))
    mockedIndex.mockResolvedValue({
      queued: true,
      version: { version_id: document.latest_version.id, ...document.latest_version },
    })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('可用')
    const reindex = wrapper.findAll('button').find((b) => b.text() === '重建索引')
    await reindex?.trigger('click')
    await flushPromises()

    expect(mockedIndex).toHaveBeenCalledWith('kb-id', 'document-id', 'version-id', true)
  })

  it('shows a clear queue unavailable message', async () => {
    mockedList.mockResolvedValue(response([document]))
    mockedParse.mockRejectedValue(new ApiError(503, 'private broker'))
    const wrapper = mountView()
    await flushPromises()

    const reparse = wrapper.findAll('button').find((b) => b.text() === '重新解析')
    await reparse?.trigger('click')
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('解析队列暂时不可用，请稍后重试')
  })
})
