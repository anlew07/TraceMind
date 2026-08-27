import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import EvidenceSourceList from '@/components/EvidenceSourceList.vue'
import type { EvidenceSource } from '@/types/evidence'
import type { RagSource } from '@/types/rag'

const source: EvidenceSource = {
  source_id: 'S1',
  document_id: 'document',
  document_version_id: 'version',
  chunk_id: 'chunk',
  document_name: 'Service.java',
  relative_path: 'src/Service.java',
  version_number: 1,
  chunk_index: 2,
  content: 'void run() {}',
  content_hash: 'a'.repeat(64),
  chunk_type: 'code',
  language: 'java',
  section_title: null,
  page_number: null,
  start_line: 10,
  end_line: 12,
}

describe('EvidenceSourceList', () => {
  it('renders shared code evidence with stable citation identity', () => {
    const wrapper = mount(EvidenceSourceList, {
      props: { sources: [source], identityPrefix: 'answer', selectedSourceId: 'S1' },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    const item = wrapper.get('[data-testid="evidence-source-answer-S1"]')
    expect(item.text()).toContain('CODE')
    expect(item.text()).toContain('[S1]')
    expect(item.text()).toContain('第 10–12 行')
    expect(item.text()).toContain('void run()')
    expect(item.attributes('aria-current')).toBe('true')
  })

  it('renders verified knowledge as a distinct traceable source', () => {
    const wrapper = mount(EvidenceSourceList, {
      props: {
        sources: [
          {
            source_id: 'S2',
            source_type: 'knowledge_entry',
            knowledge_base_id: 'kb',
            knowledge_entry_id: 'entry',
            knowledge_question: '事务为什么失败？',
            knowledge_updated_at: '2026-08-14T00:00:00Z',
            chunk_id: 'knowledge-chunk',
            chunk_index: 0,
            content: '把写操作放进同一个事务。',
            content_hash: 'b'.repeat(64),
            chunk_type: 'knowledge_entry',
            language: null,
            section_title: 'Solution',
            page_number: null,
            start_line: null,
            end_line: null,
          },
        ],
      },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    expect(wrapper.text()).toContain('KNOWLEDGE')
    expect(wrapper.text()).toContain('知识条目')
    expect(wrapper.text()).toContain('事务为什么失败？')
  })

  it('marks preserved evidence snapshots without implying the live source is available', () => {
    const wrapper = mount(EvidenceSourceList, {
      props: {
        sources: [
          {
            ...source,
            source_type: 'knowledge_entry',
            knowledge_base_id: 'kb',
            knowledge_entry_id: 'entry',
            knowledge_question: '已保存的知识来源',
          },
        ],
        snapshotMode: true,
      },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })

    expect(wrapper.text()).toContain('已保存证据快照')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('renders only real retrieval metadata when present', () => {
    const rankedSource: RagSource = {
      ...source,
      score: 0.9123,
      knowledge_base_id: 'kb',
      index_generation: 'generation',
      retrieval_score: 0.7345,
      rerank_score: 0.9123,
      retrieval_rank: 2,
      ranking_mode: 'hybrid_reranker',
    }
    const wrapper = mount(EvidenceSourceList, {
      props: {
        sources: [rankedSource],
      },
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })

    expect(wrapper.text()).toContain('检索排名')
    expect(wrapper.text()).toContain('0.735')
    expect(wrapper.text()).toContain('0.912')
    expect(wrapper.text()).toContain('hybrid_reranker')
    expect(wrapper.get('.ev-source-diagnostics').attributes('open')).toBeUndefined()
  })
})
