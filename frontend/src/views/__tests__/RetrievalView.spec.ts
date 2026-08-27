import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RetrievalView from '@/views/RetrievalView.vue'
import { listDocuments } from '@/services/documents'
import { getKnowledgeBase } from '@/services/knowledgeBases'
import type { DocumentItem } from '@/types/document'

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    useRoute: () => ({ params: { knowledgeBaseId: 'kb-id' } }),
  }
})

vi.mock('@/services/documents', () => ({ listDocuments: vi.fn() }))
vi.mock('@/services/knowledgeBases', () => ({ getKnowledgeBase: vi.fn() }))

const mockedListDocuments = vi.mocked(listDocuments)
const mockedGetKnowledgeBase = vi.mocked(getKnowledgeBase)
const mainCss = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8')

const document = { id: 'document-id', relative_path: 'docs/design.md' } as DocumentItem

function mountView(shellName = ref('')) {
  return {
    shellName,
    wrapper: mount(RetrievalView, {
      global: {
        provide: { shellKbName: shellName },
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          SemanticSearchPanel: {
            props: ['knowledgeBaseId', 'documents'],
            template:
              '<div data-testid="retrieval-panel">{{ knowledgeBaseId }} · {{ documents.length }}</div>',
          },
        },
      },
    }),
  }
}

describe('RetrievalView', () => {
  beforeEach(() => {
    mockedListDocuments.mockReset()
    mockedGetKnowledgeBase.mockReset()
    mockedGetKnowledgeBase.mockResolvedValue({
      id: 'kb-id',
      name: 'Architecture Notes',
      description: null,
      created_at: '2026-08-26T00:00:00Z',
      updated_at: '2026-08-26T00:00:00Z',
    })
    mockedListDocuments.mockResolvedValue({ items: [document], total: 1, offset: 0, limit: 100 })
  })

  it('loads the current knowledge base and real documents for the workspace', async () => {
    const { wrapper, shellName } = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('检索工作区')
    expect(wrapper.text()).toContain('不调用 LLM 生成')
    expect(wrapper.get('[data-testid="retrieval-panel"]').text()).toContain('kb-id · 1')
    expect(mockedListDocuments).toHaveBeenCalledWith('kb-id', '', 0, 100)
    expect(shellName.value).toBe('Architecture Notes')
  })

  it('keeps a page load failure recoverable', async () => {
    mockedGetKnowledgeBase.mockRejectedValueOnce(new Error('offline'))
    const { wrapper } = mountView()
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('检索工作区加载失败')
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="retrieval-panel"]').exists()).toBe(true)
  })

  it('uses the shared overlay and full-width mobile Inspector pattern', () => {
    expect(mainCss).toMatch(
      /@media \(max-width: 70rem\)[\s\S]*?\.retrieval-inspector\s*\{[\s\S]*?position:\s*fixed/,
    )
    expect(mainCss).toMatch(
      /@media \(max-width: 48rem\)[\s\S]*?\.retrieval-inspector\s*\{[\s\S]*?width:\s*100%/,
    )
    expect(mainCss).toMatch(
      /@media \(max-width: 25\.875rem\)[\s\S]*?\.retrieval-control-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/,
    )
  })
})
