<script setup lang="ts">
import cytoscape, { type Core, type ElementDefinition, type EventObject } from 'cytoscape'
import { ElButton } from 'element-plus'
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

import { getKnowledgeBase } from '@/services/knowledgeBases'
import { getKnowledgeMap } from '@/services/knowledgeMap'
import type {
  KnowledgeMapEdge,
  KnowledgeMapEdgeType,
  KnowledgeMapNode,
  KnowledgeMapNodeType,
  KnowledgeMapResponse,
} from '@/types/knowledgeMap'

const route = useRoute()
const router = useRouter()
const knowledgeBaseId = String(route.params.knowledgeBaseId)
const shellKbName = inject<Ref<string>>('shellKbName', ref(''))
const graphElement = ref<HTMLElement | null>(null)
const graphData = ref<KnowledgeMapResponse>({ nodes: [], edges: [] })
const knowledgeBaseDescription = ref<string | null>(null)
const loading = ref(true)
const error = ref('')
const selectedNode = ref<KnowledgeMapNode | null>(null)
const selectedEdge = ref<KnowledgeMapEdge | null>(null)

const nodeFilterOptions = [
  { type: 'knowledge_base', label: '知识库' },
  { type: 'knowledge_entry', label: '知识' },
  { type: 'document', label: '文档' },
  { type: 'tag', label: '标签' },
] as const
const edgeFilterOptions = [
  { type: 'contains', label: '包含' },
  { type: 'cites', label: '引用' },
  { type: 'tagged', label: '标签关联' },
  { type: 'related', label: '相关' },
] as const
const nodeTypeLabels: Record<KnowledgeMapNodeType, string> = {
  knowledge_base: '知识库',
  knowledge_entry: '知识',
  document: '文档',
  tag: '标签',
}
const edgeTypeLabels: Record<KnowledgeMapEdgeType, string> = {
  contains: '包含',
  cites: '引用',
  tagged: '标签关联',
  related: '相关',
}
const validationStatusLabels: Record<string, string> = {
  unverified: '未验证',
  verified: '已验证',
  outdated: '已过期',
}

const nodeFilters = reactive<Record<KnowledgeMapNodeType, boolean>>({
  knowledge_base: true,
  knowledge_entry: true,
  document: true,
  tag: true,
})
const edgeFilters = reactive<Record<KnowledgeMapEdgeType, boolean>>({
  contains: true,
  cites: true,
  tagged: true,
  related: true,
})
let graph: Core | null = null
let resizeObserver: ResizeObserver | null = null

const nodeById = computed(() => new Map(graphData.value.nodes.map((node) => [node.id, node])))
const documentNameByEntityId = computed(
  () =>
    new Map(
      graphData.value.nodes
        .filter((node) => node.type === 'document' && node.entity_id)
        .map((node) => [String(node.entity_id), node.label]),
    ),
)
const hasGraphContent = computed(() =>
  graphData.value.nodes.some(({ type }) => type !== 'knowledge_base'),
)
const inspectorOpen = computed(() => Boolean(selectedNode.value || selectedEdge.value))
const relatedReasons = computed(() => {
  if (selectedEdge.value?.type !== 'related') return []
  const tags = metadataList(selectedEdge.value.metadata, 'shared_tags')
  const documentIds = metadataList(selectedEdge.value.metadata, 'shared_document_ids')
  return [
    ...tags.map((tag) => `共享标签：${tag}`),
    ...documentIds.map((id) => `共享来源：${documentNameByEntityId.value.get(id) ?? id}`),
  ]
})

function metadataText(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key]
  return typeof value === 'string' ? value : ''
}

function metadataNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key]
  return typeof value === 'number' ? value : null
}

function metadataList(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key]
  return Array.isArray(value) ? value.map(String) : []
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function sourceTypeLabel(value: string): string {
  return value === 'upload' ? '本地导入' : value
}

function graphToken(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim()
}

function elements(): ElementDefinition[] {
  return [
    ...graphData.value.nodes.map((node) => ({
      group: 'nodes' as const,
      data: { id: node.id, label: node.label, nodeType: node.type },
    })),
    ...graphData.value.edges.map((edge) => ({
      group: 'edges' as const,
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        edgeType: edge.type,
        edgeLabel: edgeTypeLabels[edge.type],
      },
    })),
  ]
}

function clearGraphFocus(): void {
  selectedNode.value = null
  selectedEdge.value = null
  if (!graph) return
  graph.elements().removeClass('map-selected map-related map-muted')
  graph.elements().unselect()
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape' && inspectorOpen.value) clearGraphFocus()
}

function focusGraphElement(id: string, isNode: boolean): void {
  if (!graph) return
  const element = graph.getElementById(id)
  const context = isNode ? element.closedNeighborhood() : element.union(element.connectedNodes())
  graph.elements().removeClass('map-selected map-related map-muted')
  element.addClass('map-selected')
  context.addClass('map-related')
  graph.elements().not(context).addClass('map-muted')
}

function selectElement(event: EventObject): void {
  const id = event.target.id()
  const isNode = event.target.isNode()
  if (isNode) {
    selectedNode.value = nodeById.value.get(id) ?? null
    selectedEdge.value = null
  } else {
    selectedNode.value = null
    selectedEdge.value = graphData.value.edges.find((edge) => edge.id === id) ?? null
  }
  focusGraphElement(id, isNode)
}

function applyFilters(): void {
  if (!graph) return
  graph.batch(() => {
    graph?.nodes().forEach((node) => {
      const type = node.data('nodeType') as KnowledgeMapNodeType
      node.style('display', nodeFilters[type] ? 'element' : 'none')
    })
    graph?.edges().forEach((edge) => {
      const type = edge.data('edgeType') as KnowledgeMapEdgeType
      const endpointsVisible =
        edge.source().style('display') !== 'none' && edge.target().style('display') !== 'none'
      edge.style('display', endpointsVisible && edgeFilters[type] ? 'element' : 'none')
    })
  })

  const selectedType = selectedNode.value?.type
  if (selectedType && !nodeFilters[selectedType]) clearGraphFocus()
  const selectedRelationship = selectedEdge.value?.type
  if (selectedEdge.value && selectedRelationship) {
    const sourceType = nodeById.value.get(selectedEdge.value.source)?.type
    const targetType = nodeById.value.get(selectedEdge.value.target)?.type
    if (
      !edgeFilters[selectedRelationship] ||
      (sourceType && !nodeFilters[sourceType]) ||
      (targetType && !nodeFilters[targetType])
    ) {
      clearGraphFocus()
    }
  }
}

function initializeGraph(): void {
  if (!graphElement.value || !hasGraphContent.value) return
  const compactLabels = window.innerWidth <= 680
  const ink = graphToken('--graph-cy-ink')
  const muted = graphToken('--graph-cy-muted')
  const rule = graphToken('--graph-cy-rule')
  const paper = graphToken('--graph-cy-paper')
  const raised = graphToken('--graph-cy-raised')
  const accent = graphToken('--graph-cy-accent')
  const accentSoft = graphToken('--graph-cy-accent-soft')
  const evidence = graphToken('--graph-cy-evidence')
  const evidenceSoft = graphToken('--graph-cy-evidence-soft')
  const fontSans = graphToken('--font-sans')

  graph?.destroy()
  graph = cytoscape({
    container: graphElement.value,
    elements: elements(),
    minZoom: 0.2,
    maxZoom: 3,
    wheelSensitivity: 0.2,
    style: [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          'font-family': fontSans,
          'font-size': compactLabels ? 8 : 10,
          'font-weight': 500,
          'text-max-width': compactLabels ? '76px' : '128px',
          'text-wrap': 'ellipsis',
          'background-color': paper,
          'border-color': rule,
          'border-width': 1.25,
          color: ink,
          'text-background-color': paper,
          'text-background-opacity': 0.82,
          'text-background-padding': 2,
          'text-valign': 'bottom',
          'text-margin-y': 8,
          'transition-property': 'opacity, border-width, border-color',
          'transition-duration': '120ms',
        },
      },
      {
        selector: 'node[nodeType = "knowledge_base"]',
        style: {
          'background-color': accentSoft,
          'border-color': accent,
          'border-width': 2,
          width: 46,
          height: 46,
        },
      },
      {
        selector: 'node[nodeType = "knowledge_entry"]',
        style: {
          'background-color': paper,
          'border-color': accent,
          'border-width': 2,
          width: 34,
          height: 34,
        },
      },
      {
        selector: 'node[nodeType = "document"]',
        style: {
          'background-color': evidenceSoft,
          'border-color': evidence,
          shape: 'round-rectangle',
          width: 32,
          height: 28,
        },
      },
      {
        selector: 'node[nodeType = "tag"]',
        style: {
          'background-color': raised,
          'border-color': muted,
          shape: 'round-rectangle',
          width: 24,
          height: 16,
        },
      },
      {
        selector: 'edge',
        style: {
          width: 1,
          'line-color': rule,
          'target-arrow-color': rule,
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.55,
          'curve-style': 'bezier',
          opacity: 0.55,
          'transition-property': 'opacity, width, line-color',
          'transition-duration': '120ms',
        },
      },
      {
        selector: 'edge[edgeType = "cites"]',
        style: { 'line-color': evidence, 'target-arrow-color': evidence },
      },
      {
        selector: 'edge[edgeType = "tagged"]',
        style: { 'line-style': 'dotted' },
      },
      {
        selector: 'edge[edgeType = "related"]',
        style: {
          'line-style': 'dashed',
          'line-color': accent,
          'target-arrow-shape': 'none',
        },
      },
      {
        selector: 'node.map-hover, node.map-related',
        style: { 'border-color': accent, 'border-width': 2.5 },
      },
      {
        selector: 'node.map-selected',
        style: { 'border-color': accent, 'border-width': 4 },
      },
      {
        selector: 'edge.map-selected, edge.map-related',
        style: {
          width: 2,
          opacity: 0.95,
          label: 'data(edgeLabel)',
          'font-family': fontSans,
          'font-size': 8,
          color: muted,
          'text-background-color': paper,
          'text-background-opacity': 0.9,
          'text-background-padding': 2,
        },
      },
      { selector: 'node.map-muted', style: { opacity: 0.22 } },
      { selector: 'edge.map-muted', style: { opacity: 0.1 } },
    ],
    layout: {
      name: 'cose',
      animate: false,
      fit: true,
      padding: compactLabels ? 28 : 48,
      nodeDimensionsIncludeLabels: true,
    },
  })
  graph.on('tap', 'node, edge', selectElement)
  graph.on('mouseover', 'node', (event) => event.target.addClass('map-hover'))
  graph.on('mouseout', 'node', (event) => event.target.removeClass('map-hover'))
  graph.on('tap', (event) => {
    if (event.target === graph) clearGraphFocus()
  })
  applyFilters()
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(() => graph?.resize())
  resizeObserver.observe(graphElement.value)
}

function fitGraph(): void {
  graph?.fit(undefined, window.innerWidth <= 680 ? 28 : 48)
}

function zoomGraph(factor: number): void {
  if (!graph) return
  const level = Math.min(graph.maxZoom(), Math.max(graph.minZoom(), graph.zoom() * factor))
  graph.zoom({
    level,
    renderedPosition: { x: graph.width() / 2, y: graph.height() / 2 },
  })
}

async function openSelected(): Promise<void> {
  if (!selectedNode.value?.entity_id) return
  if (selectedNode.value.type === 'knowledge_entry') {
    await router.push(
      `/knowledge-bases/${knowledgeBaseId}/knowledge/${selectedNode.value.entity_id}`,
    )
  } else if (selectedNode.value.type === 'document') {
    const relativePath = metadataText(selectedNode.value.metadata, 'relative_path')
    await router.push({
      path: `/knowledge-bases/${knowledgeBaseId}/documents`,
      query: { query: relativePath, focusDocument: selectedNode.value.entity_id },
    })
  }
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  clearGraphFocus()
  try {
    const [knowledgeBase, response] = await Promise.all([
      getKnowledgeBase(knowledgeBaseId),
      getKnowledgeMap(knowledgeBaseId),
    ])
    shellKbName.value = knowledgeBase.name
    knowledgeBaseDescription.value = knowledgeBase.description
    graphData.value = response
    loading.value = false
    await nextTick()
    initializeGraph()
  } catch {
    error.value = '知识图谱加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

watch([nodeFilters, edgeFilters], applyFilters, { deep: true })
onMounted(() => {
  window.addEventListener('keydown', handleEscape)
  void load()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscape)
  resizeObserver?.disconnect()
  graph?.destroy()
})
</script>

<template>
  <main class="knowledge-map-page">
    <header class="knowledge-map-header">
      <div>
        <h1>知识图谱</h1>
        <p>探索知识、资料和标签之间由真实数据派生的关系。</p>
      </div>
    </header>

    <div v-if="error" class="conv-error knowledge-map-error" role="alert">{{ error }}</div>
    <div v-else-if="loading" class="knowledge-map-loading" role="status">
      正在加载知识关系…
    </div>
    <div v-else class="knowledge-map-layout" :class="{ 'has-inspector': inspectorOpen }">
      <section
        class="knowledge-map-workspace"
        :class="{ 'is-empty': !hasGraphContent }"
        aria-label="知识关系图"
      >
        <div v-if="hasGraphContent" class="knowledge-map-toolbar">
          <div class="knowledge-map-filter-groups" aria-label="图谱筛选与图例">
            <fieldset class="knowledge-map-filter-group">
              <legend>节点</legend>
              <label v-for="option in nodeFilterOptions" :key="option.type">
                <input
                  v-model="nodeFilters[option.type]"
                  type="checkbox"
                  :aria-label="`显示${option.label}节点`"
                />
                <span class="map-node-swatch" :data-node-type="option.type" aria-hidden="true" />
                <span>{{ option.label }}</span>
              </label>
            </fieldset>
            <fieldset class="knowledge-map-filter-group">
              <legend>关系</legend>
              <label v-for="option in edgeFilterOptions" :key="option.type">
                <input
                  v-model="edgeFilters[option.type]"
                  type="checkbox"
                  :aria-label="`显示${option.label}关系`"
                />
                <span class="map-edge-swatch" :data-edge-type="option.type" aria-hidden="true" />
                <span>{{ option.label }}</span>
              </label>
            </fieldset>
          </div>
          <div class="knowledge-map-controls" aria-label="图谱视图控制">
            <button type="button" aria-label="缩小图谱" title="缩小" @click="zoomGraph(0.82)">−</button>
            <button type="button" aria-label="放大图谱" title="放大" @click="zoomGraph(1.22)">＋</button>
            <ElButton class="secondary-button" @click="fitGraph">适应画布</ElButton>
          </div>
        </div>

        <div v-if="!hasGraphContent" class="knowledge-map-empty">
          <span class="knowledge-map-empty-mark" aria-hidden="true">↗</span>
          <h2>这里还没有足够的知识关系</h2>
          <p>
            导入资料、进行问答并沉淀 Knowledge 后，<br />TraceMind 会从真实数据中派生知识关系。
          </p>
          <div class="knowledge-map-empty-actions">
            <RouterLink class="primary-link" :to="`/knowledge-bases/${knowledgeBaseId}/chat`">
              开始问答
            </RouterLink>
            <RouterLink class="secondary-link" :to="`/knowledge-bases/${knowledgeBaseId}/documents`">
              查看资料
            </RouterLink>
          </div>
        </div>
        <div
          v-show="hasGraphContent"
          ref="graphElement"
          class="knowledge-map-canvas"
          data-testid="knowledge-map-canvas"
        />
      </section>

      <button
        v-if="inspectorOpen"
        class="knowledge-map-inspector-backdrop"
        type="button"
        aria-label="关闭图谱详情"
        @click="clearGraphFocus"
      />
      <aside v-if="inspectorOpen" class="knowledge-map-inspector" aria-label="所选图谱项目">
        <header class="knowledge-map-inspector-header">
          <span class="eyebrow">关系详情</span>
          <button type="button" aria-label="关闭图谱详情" @click="clearGraphFocus">×</button>
        </header>

        <template v-if="selectedNode">
          <div class="knowledge-map-inspector-identity">
            <span class="map-node-swatch" :data-node-type="selectedNode.type" aria-hidden="true" />
            <span>{{ nodeTypeLabels[selectedNode.type] }}</span>
          </div>
          <h2>{{ selectedNode.label }}</h2>

          <dl class="knowledge-map-facts">
            <template v-if="selectedNode.type === 'knowledge_base'">
              <div v-if="knowledgeBaseDescription"><dt>说明</dt><dd>{{ knowledgeBaseDescription }}</dd></div>
              <div><dt>知识</dt><dd>{{ metadataNumber(selectedNode.metadata, 'entry_count') ?? 0 }} 条</dd></div>
              <div><dt>文档</dt><dd>{{ metadataNumber(selectedNode.metadata, 'document_count') ?? 0 }} 份</dd></div>
              <div><dt>位置</dt><dd>当前知识库</dd></div>
            </template>

            <template v-else-if="selectedNode.type === 'knowledge_entry'">
              <div>
                <dt>验证</dt>
                <dd>{{ validationStatusLabels[metadataText(selectedNode.metadata, 'validation_status')] ?? metadataText(selectedNode.metadata, 'validation_status') }}</dd>
              </div>
              <div v-if="metadataList(selectedNode.metadata, 'tags').length">
                <dt>标签</dt>
                <dd class="knowledge-map-tag-list">
                  <span v-for="tag in metadataList(selectedNode.metadata, 'tags')" :key="tag">{{ tag }}</span>
                </dd>
              </div>
              <div v-if="metadataText(selectedNode.metadata, 'updated_at')">
                <dt>更新</dt><dd>{{ formatDate(metadataText(selectedNode.metadata, 'updated_at')) }}</dd>
              </div>
            </template>

            <template v-else-if="selectedNode.type === 'document'">
              <div v-if="metadataText(selectedNode.metadata, 'relative_path')">
                <dt>路径</dt><dd class="map-technical-value">{{ metadataText(selectedNode.metadata, 'relative_path') }}</dd>
              </div>
              <div v-if="metadataText(selectedNode.metadata, 'source_type')">
                <dt>来源</dt><dd>{{ sourceTypeLabel(metadataText(selectedNode.metadata, 'source_type')) }}</dd>
              </div>
            </template>

            <template v-else>
              <div><dt>关联知识</dt><dd>{{ metadataNumber(selectedNode.metadata, 'entry_count') ?? 0 }} 条</dd></div>
            </template>
          </dl>

          <button
            v-if="['knowledge_entry', 'document'].includes(selectedNode.type)"
            class="text-action map-open-action"
            type="button"
            @click="openSelected"
          >
            打开{{ selectedNode.type === 'document' ? '资料' : '知识详情' }} →
          </button>
        </template>

        <template v-else-if="selectedEdge">
          <div class="knowledge-map-inspector-identity">
            <span class="map-edge-swatch" :data-edge-type="selectedEdge.type" aria-hidden="true" />
            <span>{{ edgeTypeLabels[selectedEdge.type] }}</span>
          </div>
          <h2>
            {{ nodeById.get(selectedEdge.source)?.label }}
            <span aria-hidden="true">{{ selectedEdge.type === 'related' ? '↔' : '→' }}</span>
            {{ nodeById.get(selectedEdge.target)?.label }}
          </h2>
          <p v-if="selectedEdge.type === 'contains'" class="muted-text">知识库包含此项目。</p>
          <p v-else-if="selectedEdge.type === 'cites'" class="muted-text">这条知识引用了该资料。</p>
          <p v-else-if="selectedEdge.type === 'tagged'" class="muted-text">这条知识使用了该标签。</p>
          <section v-else class="knowledge-map-related-section">
            <h3>相关原因</h3>
            <ul v-if="relatedReasons.length" class="knowledge-map-reasons">
              <li v-for="reason in relatedReasons" :key="reason">{{ reason }}</li>
            </ul>
            <p v-else class="muted-text">API 未提供更具体的相关原因。</p>
          </section>
        </template>
      </aside>
    </div>
  </main>
</template>
