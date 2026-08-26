import { flushPromises, mount } from '@vue/test-utils'
import type { Component } from 'vue'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getKnowledgeBase } from '@/services/knowledgeBases'
import { getKnowledgeMap } from '@/services/knowledgeMap'
import type { KnowledgeMapResponse } from '@/types/knowledgeMap'
import KnowledgeMapView from '@/views/KnowledgeMapView.vue'

const mocks = vi.hoisted(() => ({
  cytoscape: vi.fn(),
  push: vi.fn(),
  on: vi.fn(),
  fit: vi.fn(),
  resize: vi.fn(),
  destroy: vi.fn(),
  zoom: vi.fn(),
  lastCore: null as GraphCoreMock | null,
}))

type GraphItemMock = {
  id: () => string
  data: (name: string) => unknown
  style: (property: string, value?: string) => unknown
  isNode: () => boolean
  addClass: ReturnType<typeof vi.fn>
  removeClass: ReturnType<typeof vi.fn>
  closedNeighborhood: () => GraphCollectionMock
  connectedNodes: () => GraphCollectionMock
  union: (items: GraphCollectionMock) => GraphCollectionMock
  source: () => GraphItemMock
  target: () => GraphItemMock
  classes: Set<string>
  styles: Map<string, string>
}

type GraphCollectionMock = GraphItemMock[] & {
  addClass: ReturnType<typeof vi.fn>
  removeClass: ReturnType<typeof vi.fn>
  unselect: ReturnType<typeof vi.fn>
  not: (items: GraphCollectionMock) => GraphCollectionMock
}

type GraphCoreMock = {
  on: ReturnType<typeof vi.fn>
  fit: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  zoom: ReturnType<typeof vi.fn>
  minZoom: () => number
  maxZoom: () => number
  width: () => number
  height: () => number
  batch: (callback: () => void) => void
  nodes: () => GraphCollectionMock
  edges: () => GraphCollectionMock
  elements: () => GraphCollectionMock
  getElementById: (id: string) => GraphItemMock
  byId: Map<string, GraphItemMock>
}

function collection(items: GraphItemMock[]): GraphCollectionMock {
  const result = [...new Set(items)] as GraphCollectionMock
  result.addClass = vi.fn((names: string) => {
    result.forEach((item) => names.split(' ').forEach((name) => item.classes.add(name)))
    return result
  })
  result.removeClass = vi.fn((names: string) => {
    result.forEach((item) => names.split(' ').forEach((name) => item.classes.delete(name)))
    return result
  })
  result.unselect = vi.fn(() => result)
  result.not = (other: GraphCollectionMock) => collection(result.filter((item) => !other.includes(item)))
  return result
}

function makeGraphCore(definitions: Array<{ group?: string; data?: Record<string, unknown> }>): GraphCoreMock {
  const byId = new Map<string, GraphItemMock>()
  const nodeItems: GraphItemMock[] = []
  const edgeItems: GraphItemMock[] = []

  for (const definition of definitions.filter(({ group }) => group === 'nodes')) {
    const data = definition.data ?? {}
    const styles = new Map<string, string>([['display', 'element']])
    const item = {
      id: () => String(data.id),
      data: (name: string) => data[name],
      style: (property: string, value?: string) => {
        if (value === undefined) return styles.get(property)
        styles.set(property, value)
        return item
      },
      isNode: () => true,
      addClass: vi.fn((names: string) => {
        names.split(' ').forEach((name) => item.classes.add(name))
        return item
      }),
      removeClass: vi.fn((names: string) => {
        names.split(' ').forEach((name) => item.classes.delete(name))
        return item
      }),
      closedNeighborhood: () => collection([]),
      connectedNodes: () => collection([]),
      union: (items: GraphCollectionMock) => collection([item, ...items]),
      source: () => item,
      target: () => item,
      classes: new Set<string>(),
      styles,
    } satisfies GraphItemMock
    byId.set(item.id(), item)
    nodeItems.push(item)
  }

  for (const definition of definitions.filter(({ group }) => group === 'edges')) {
    const data = definition.data ?? {}
    const styles = new Map<string, string>([['display', 'element']])
    const item = {
      id: () => String(data.id),
      data: (name: string) => data[name],
      style: (property: string, value?: string) => {
        if (value === undefined) return styles.get(property)
        styles.set(property, value)
        return item
      },
      isNode: () => false,
      addClass: vi.fn((names: string) => {
        names.split(' ').forEach((name) => item.classes.add(name))
        return item
      }),
      removeClass: vi.fn((names: string) => {
        names.split(' ').forEach((name) => item.classes.delete(name))
        return item
      }),
      closedNeighborhood: () => collection([]),
      connectedNodes: () => collection([item.source(), item.target()]),
      union: (items: GraphCollectionMock) => collection([item, ...items]),
      source: () => byId.get(String(data.source))!,
      target: () => byId.get(String(data.target))!,
      classes: new Set<string>(),
      styles,
    } satisfies GraphItemMock
    byId.set(item.id(), item)
    edgeItems.push(item)
  }

  for (const node of nodeItems) {
    node.closedNeighborhood = () => {
      const edges = edgeItems.filter((edge) => edge.source() === node || edge.target() === node)
      const neighbors = edges.flatMap((edge) => [edge.source(), edge.target()])
      return collection([node, ...edges, ...neighbors])
    }
  }

  let zoomLevel = 1
  const core: GraphCoreMock = {
    on: mocks.on,
    fit: mocks.fit,
    resize: mocks.resize,
    destroy: mocks.destroy,
    zoom: mocks.zoom.mockImplementation((value?: number | { level: number }) => {
      if (value === undefined) return zoomLevel
      zoomLevel = typeof value === 'number' ? value : value.level
      return core
    }),
    minZoom: () => 0.2,
    maxZoom: () => 3,
    width: () => 900,
    height: () => 640,
    batch: (callback) => callback(),
    nodes: () => collection(nodeItems),
    edges: () => collection(edgeItems),
    elements: () => collection([...nodeItems, ...edgeItems]),
    getElementById: (id) => byId.get(id)!,
    byId,
  }
  return core
}

const fullMap: KnowledgeMapResponse = {
  nodes: [
    {
      id: 'kb:kb',
      type: 'knowledge_base',
      entity_id: 'kb',
      label: 'Engineering',
      metadata: { entry_count: 2, document_count: 1 },
    },
    {
      id: 'entry:entry-id',
      type: 'knowledge_entry',
      entity_id: 'entry-id',
      label: 'Fix a transaction',
      metadata: {
        validation_status: 'verified',
        tags: ['postgres'],
        updated_at: '2026-08-20T00:00:00Z',
      },
    },
    {
      id: 'entry:related-id',
      type: 'knowledge_entry',
      entity_id: 'related-id',
      label: 'Retry a transaction',
      metadata: { validation_status: 'unverified', tags: ['postgres'] },
    },
    {
      id: 'document:document-id',
      type: 'document',
      entity_id: 'document-id',
      label: 'transactions.md',
      metadata: { relative_path: 'docs/transactions.md', source_type: 'upload' },
    },
    {
      id: 'tag:postgres',
      type: 'tag',
      entity_id: null,
      label: 'postgres',
      metadata: { tag: 'postgres', entry_count: 2 },
    },
  ],
  edges: [
    {
      id: 'contains:kb:entry',
      type: 'contains',
      source: 'kb:kb',
      target: 'entry:entry-id',
      metadata: {},
    },
    {
      id: 'cites:entry:document',
      type: 'cites',
      source: 'entry:entry-id',
      target: 'document:document-id',
      metadata: {},
    },
    {
      id: 'tagged:entry:tag',
      type: 'tagged',
      source: 'entry:entry-id',
      target: 'tag:postgres',
      metadata: {},
    },
    {
      id: 'related:entries',
      type: 'related',
      source: 'entry:entry-id',
      target: 'entry:related-id',
      metadata: { shared_tags: ['postgres'], shared_document_ids: ['document-id'] },
    },
  ],
}

vi.mock('cytoscape', () => ({ default: mocks.cytoscape }))
vi.mock('vue-router', () => ({
  RouterLink: {
    props: ['to'],
    template: '<a><slot /></a>',
  } as Component,
  useRoute: () => ({ params: { knowledgeBaseId: 'kb' } }),
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/services/knowledgeBases', () => ({ getKnowledgeBase: vi.fn() }))
vi.mock('@/services/knowledgeMap', () => ({ getKnowledgeMap: vi.fn() }))

class ResizeObserverMock {
  observe = vi.fn()
  disconnect = vi.fn()
}

function mountView() {
  return mount(KnowledgeMapView, {
    global: { provide: { shellKbName: ref('') } },
  })
}

function triggerGraphSelection(id: string): void {
  const selectionCall = mocks.on.mock.calls.find(
    (call) => call[0] === 'tap' && call[1] === 'node, edge',
  )
  const select = selectionCall?.[2] as ((event: unknown) => void) | undefined
  const target = mocks.lastCore?.byId.get(id)
  select?.({ target })
}

describe('KnowledgeMapView', () => {
  beforeEach(() => {
    mocks.push.mockReset()
    mocks.on.mockReset()
    mocks.fit.mockReset()
    mocks.resize.mockReset()
    mocks.destroy.mockReset()
    mocks.zoom.mockReset()
    mocks.lastCore = null
    mocks.cytoscape.mockReset().mockImplementation((options) => {
      const definitions = options.elements as Array<{
        group?: string
        data?: Record<string, unknown>
      }>
      mocks.lastCore = makeGraphCore(definitions)
      return mocks.lastCore
    })
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.mocked(getKnowledgeBase).mockResolvedValue({
      id: 'kb',
      name: 'Engineering',
      description: 'Developer notes',
      created_at: '',
      updated_at: '',
    })
    vi.mocked(getKnowledgeMap).mockResolvedValue(structuredClone(fullMap))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('renders every real node and edge type without auto-selecting an item', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.cytoscape).toHaveBeenCalledOnce()
    const options = mocks.cytoscape.mock.calls[0]?.[0]
    expect(options.layout).toMatchObject({ name: 'cose', nodeDimensionsIncludeLabels: true })
    expect(options.elements).toHaveLength(fullMap.nodes.length + fullMap.edges.length)
    expect(options.elements.filter(({ group }: { group: string }) => group === 'nodes')).toHaveLength(
      fullMap.nodes.length,
    )
    expect(options.elements.filter(({ group }: { group: string }) => group === 'edges')).toHaveLength(
      fullMap.edges.length,
    )
    expect(wrapper.find('.knowledge-map-inspector').exists()).toBe(false)
    expect(mocks.lastCore?.elements().some(({ classes }) => classes.has('map-selected'))).toBe(false)

    wrapper.unmount()
    expect(mocks.destroy).toHaveBeenCalled()
  })

  it('filters real node and relationship types locally', async () => {
    const wrapper = mountView()
    await flushPromises()

    const nodeFilters = wrapper.findAll('.knowledge-map-filter-group').at(0)!.findAll('input')
    await nodeFilters[3]!.setValue(false)
    expect(mocks.lastCore?.byId.get('tag:postgres')?.styles.get('display')).toBe('none')
    expect(mocks.lastCore?.byId.get('tagged:entry:tag')?.styles.get('display')).toBe('none')

    await nodeFilters[3]!.setValue(true)
    const edgeFilters = wrapper.findAll('.knowledge-map-filter-group').at(1)!.findAll('input')
    await edgeFilters[3]!.setValue(false)
    expect(mocks.lastCore?.byId.get('related:entries')?.styles.get('display')).toBe('none')
  })

  it('opens and closes an entry Inspector while emphasizing only its graph context', async () => {
    const wrapper = mountView()
    await flushPromises()
    triggerGraphSelection('entry:entry-id')
    await wrapper.vm.$nextTick()

    const inspector = wrapper.get('.knowledge-map-inspector')
    expect(inspector.text()).toContain('Fix a transaction')
    expect(inspector.text()).toContain('已验证')
    expect(inspector.text()).toContain('postgres')
    expect(mocks.lastCore?.byId.get('entry:entry-id')?.classes.has('map-selected')).toBe(true)
    expect(mocks.lastCore?.byId.get('kb:kb')?.classes.has('map-related')).toBe(true)

    await inspector.get('button[aria-label="关闭图谱详情"]').trigger('click')
    expect(wrapper.find('.knowledge-map-inspector').exists()).toBe(false)
    expect(mocks.lastCore?.byId.get('entry:entry-id')?.classes.has('map-selected')).toBe(false)
  })

  it.each([
    ['kb:kb', ['Engineering', 'Developer notes', '2 条', '1 份']],
    ['document:document-id', ['transactions.md', 'docs/transactions.md', '本地导入']],
    ['tag:postgres', ['postgres', '2 条']],
  ])('renders truthful Inspector fields for %s', async (id, expected) => {
    const wrapper = mountView()
    await flushPromises()
    triggerGraphSelection(id)
    await wrapper.vm.$nextTick()

    const text = wrapper.get('.knowledge-map-inspector').text()
    expected.forEach((value) => expect(text).toContain(value))
  })

  it('explains a related edge only from API metadata', async () => {
    const wrapper = mountView()
    await flushPromises()
    triggerGraphSelection('related:entries')
    await wrapper.vm.$nextTick()

    const inspector = wrapper.get('.knowledge-map-inspector')
    expect(inspector.text()).toContain('共享标签：postgres')
    expect(inspector.text()).toContain('共享来源：transactions.md')
  })

  it('navigates KnowledgeEntry and Document nodes to existing routes', async () => {
    const wrapper = mountView()
    await flushPromises()
    triggerGraphSelection('entry:entry-id')
    await wrapper.vm.$nextTick()
    await wrapper.get('.map-open-action').trigger('click')
    expect(mocks.push).toHaveBeenLastCalledWith('/knowledge-bases/kb/knowledge/entry-id')

    triggerGraphSelection('document:document-id')
    await wrapper.vm.$nextTick()
    await wrapper.get('.map-open-action').trigger('click')
    expect(mocks.push).toHaveBeenLastCalledWith({
      path: '/knowledge-bases/kb/documents',
      query: { query: 'docs/transactions.md', focusDocument: 'document-id' },
    })
  })

  it('uses official Cytoscape fit and zoom controls', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('button.secondary-button').trigger('click')
    expect(mocks.fit).toHaveBeenCalledWith(undefined, 48)
    await wrapper.get('button[aria-label="放大图谱"]').trigger('click')
    expect(mocks.zoom).toHaveBeenCalledWith(
      expect.objectContaining({ level: 1.22, renderedPosition: { x: 450, y: 320 } }),
    )
  })

  it('keeps the mobile Inspector selection-driven and closeable', async () => {
    vi.stubGlobal('innerWidth', 414)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.knowledge-map-inspector').exists()).toBe(false)

    triggerGraphSelection('document:document-id')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.knowledge-map-inspector-backdrop').exists()).toBe(true)
    await wrapper.get('.knowledge-map-inspector-backdrop').trigger('click')
    expect(wrapper.find('.knowledge-map-inspector').exists()).toBe(false)
  })

  it('shows actionable empty state and does not initialize a fake graph', async () => {
    vi.mocked(getKnowledgeMap).mockResolvedValueOnce({
      nodes: [
        {
          id: 'kb:kb',
          type: 'knowledge_base',
          entity_id: 'kb',
          label: 'Engineering',
          metadata: { entry_count: 0, document_count: 0 },
        },
      ],
      edges: [],
    })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('这里还没有足够的知识关系')
    expect(wrapper.text()).toContain('开始问答')
    expect(wrapper.text()).toContain('查看资料')
    expect(mocks.cytoscape).not.toHaveBeenCalled()
  })

  it('initializes a safe 100-node personal-scale fixture', async () => {
    const nodes = Array.from({ length: 100 }, (_, index) => ({
      id: `document:${index}`,
      type: 'document' as const,
      entity_id: `document-${index}`,
      label: `document-${index}.md`,
      metadata: { relative_path: `docs/document-${index}.md`, source_type: 'upload' },
    }))
    vi.mocked(getKnowledgeMap).mockResolvedValueOnce({
      nodes: [fullMap.nodes[0]!, ...nodes],
      edges: nodes.map((node) => ({
        id: `contains:${node.id}`,
        type: 'contains' as const,
        source: 'kb:kb',
        target: node.id,
        metadata: {},
      })),
    })
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.cytoscape.mock.calls[0]?.[0]?.elements).toHaveLength(201)
    expect(wrapper.find('.knowledge-map-inspector').exists()).toBe(false)
  })

  it('shows a safe load error without exposing backend details', async () => {
    vi.mocked(getKnowledgeMap).mockRejectedValueOnce(new Error('private database detail'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('知识图谱加载失败，请稍后重试')
  })
})
