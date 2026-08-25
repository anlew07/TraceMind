<script setup lang="ts">
import { inject, onMounted, ref, watch, type Ref } from 'vue'
import { ElMessage, ElMessageBox, ElOption, ElSelect } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import KnowledgeEntryFormDialog from '@/components/KnowledgeEntryFormDialog.vue'
import { getKnowledgeBase } from '@/services/knowledgeBases'
import {
  deleteKnowledgeEntry,
  listKnowledgeEntries,
  updateKnowledgeEntry,
} from '@/services/knowledgeEntries'
import type { KnowledgeEntry, KnowledgeEntryInput, ValidationStatus } from '@/types/knowledgeEntry'

const route = useRoute()
const router = useRouter()
const knowledgeBaseId = String(route.params.knowledgeBaseId)
const shellKbName = inject<Ref<string>>('shellKbName', ref(''))
const entries = ref<KnowledgeEntry[]>([])
const availableTags = ref<string[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const query = ref('')
const validationStatus = ref<ValidationStatus | ''>('')
const tag = ref('')
const editingEntry = ref<KnowledgeEntry | null>(null)
const editVisible = ref(false)
const submitting = ref(false)
const statusLabels: Record<ValidationStatus, string> = {
  unverified: '未验证',
  verified: '已验证',
  outdated: '已过期',
}
const indexLabels = {
  not_indexed: '未建立索引',
  pending: '等待索引',
  processing: '索引处理中',
  succeeded: '索引就绪',
  failed: '索引失败',
} as const

function ragAvailability(entry: KnowledgeEntry): string {
  if (entry.validation_status !== 'verified') return '不参与问答检索'
  if (entry.index_status === 'succeeded') return '可用于问答检索'
  if (entry.index_status === 'pending' || entry.index_status === 'processing') {
    return '正在准备问答检索'
  }
  return '暂不可用于问答检索'
}

function ragAvailabilityTone(entry: KnowledgeEntry): string {
  if (entry.validation_status !== 'verified') return 'inactive'
  if (entry.index_status === 'succeeded') return 'available'
  if (entry.index_status === 'failed') return 'failed'
  return 'pending'
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(
    new Date(value),
  )
}

function solutionPreview(value: string): string {
  return value
    .split('\n')
    .map((line) => line.replace(/^\s{0,3}(?:#{1,6}|[-*+]|>)\s+/, '').replace(/^```.*$/, ''))
    .filter(Boolean)
    .join(' ')
    .replace(/`([^`]+)`/g, '$1')
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const result = await listKnowledgeEntries(knowledgeBaseId, {
      query: query.value,
      validationStatus: validationStatus.value,
      tag: tag.value,
    })
    entries.value = result.items
    total.value = result.total
    availableTags.value = result.available_tags
  } catch {
    error.value = '知识列表加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function openEntry(entry: KnowledgeEntry): void {
  void router.push(`/knowledge-bases/${knowledgeBaseId}/knowledge/${entry.id}`)
}

function closeRowMenu(event: Event): void {
  const target = event.currentTarget
  if (target instanceof HTMLElement) target.closest('details')?.removeAttribute('open')
}

function openEdit(entry: KnowledgeEntry, event: Event): void {
  closeRowMenu(event)
  editingEntry.value = entry
  editVisible.value = true
}

function editValue(): KnowledgeEntryInput {
  const value = editingEntry.value
  return {
    question: value?.question ?? '',
    background: value?.background ?? null,
    root_cause: value?.root_cause ?? null,
    solution: value?.solution ?? '',
    failed_attempts: value?.failed_attempts ?? [],
    validation_status: value?.validation_status ?? 'unverified',
    tags: value?.tags ?? [],
  }
}

async function save(value: KnowledgeEntryInput): Promise<void> {
  if (!editingEntry.value) return
  submitting.value = true
  try {
    const updated = await updateKnowledgeEntry(knowledgeBaseId, editingEntry.value.id, value)
    entries.value = entries.value.map((item) => (item.id === updated.id ? updated : item))
    editVisible.value = false
    editingEntry.value = null
  } catch {
    ElMessage.error('知识更新失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

async function remove(entry: KnowledgeEntry, event: Event): Promise<void> {
  closeRowMenu(event)
  try {
    await ElMessageBox.confirm(`确定删除“${entry.question}”吗？`, '删除知识', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteKnowledgeEntry(knowledgeBaseId, entry.id)
    await load()
  } catch {
    ElMessage.error('知识删除失败，请稍后重试')
  }
}

let filterTimer: number | undefined
watch(query, () => {
  window.clearTimeout(filterTimer)
  filterTimer = window.setTimeout(() => void load(), 250)
})
watch([validationStatus, tag], () => void load())

onMounted(async () => {
  try {
    shellKbName.value = (await getKnowledgeBase(knowledgeBaseId)).name
  } catch {
    error.value = '知识库不存在或加载失败'
  }
  await load()
})
</script>

<template>
  <main class="knowledge-page knowledge-ledger">
    <header class="page-header knowledge-ledger-header">
      <div>
        <h1>知识资产</h1>
        <p>整理并验证来自回答与证据的工程经验。</p>
      </div>
      <RouterLink :to="`/knowledge-bases/${knowledgeBaseId}/chat`" class="knowledge-primary-action">
        开始问答
      </RouterLink>
    </header>

    <div class="knowledge-filters" aria-label="知识筛选">
      <label class="knowledge-search-field">
        <span>搜索</span>
        <input v-model="query" aria-label="搜索知识" placeholder="问题、背景或解决方案" />
      </label>
      <label>
        <span>验证状态</span>
        <ElSelect v-model="validationStatus" aria-label="验证状态" placeholder="全部状态" clearable>
          <ElOption label="未验证" value="unverified" />
          <ElOption label="已验证" value="verified" />
          <ElOption label="已过期" value="outdated" />
        </ElSelect>
      </label>
      <label>
        <span>标签</span>
        <ElSelect v-model="tag" aria-label="标签" placeholder="全部标签" clearable>
          <ElOption v-for="item in availableTags" :key="item" :label="item" :value="item" />
        </ElSelect>
      </label>
    </div>

    <p class="knowledge-result-count" aria-live="polite">{{ total }} 条知识记录</p>
    <div v-if="error" class="conv-error" role="alert">{{ error }}</div>
    <div v-if="loading" class="loading-state">正在加载知识记录…</div>
    <div v-else-if="entries.length" class="knowledge-list" role="list">
      <article
        v-for="entry in entries"
        :key="entry.id"
        class="knowledge-row"
        :data-testid="`knowledge-entry-${entry.id}`"
        role="listitem"
      >
        <button class="knowledge-row-open" @click="openEntry(entry)">
          <div class="knowledge-row-main">
            <strong>{{ entry.question }}</strong>
            <p>{{ solutionPreview(entry.solution) }}</p>
            <div class="knowledge-row-signals">
              <span class="knowledge-status" :data-status="entry.validation_status">
                {{ statusLabels[entry.validation_status] }}
              </span>
              <div v-if="entry.tags.length" class="knowledge-row-tags" aria-label="标签">
                <span v-for="item in entry.tags" :key="item">{{ item }}</span>
              </div>
            </div>
          </div>
          <div class="knowledge-row-meta">
            <span
              class="knowledge-rag-availability"
              :data-availability="ragAvailabilityTone(entry)"
            >
              {{ ragAvailability(entry) }}
            </span>
            <span class="knowledge-index-status" :data-status="entry.index_status">
              {{ indexLabels[entry.index_status] }}
            </span>
            <time :datetime="entry.updated_at">更新于 {{ formatUpdatedAt(entry.updated_at) }}</time>
          </div>
        </button>
        <details class="knowledge-row-menu" @click.stop>
          <summary :aria-label="`管理知识：${entry.question}`">···</summary>
          <div class="knowledge-row-menu-items">
            <button type="button" @click="openEdit(entry, $event)">编辑</button>
            <button type="button" class="danger" @click="remove(entry, $event)">删除</button>
          </div>
        </details>
      </article>
    </div>
    <section v-else class="knowledge-empty" data-testid="knowledge-empty">
      <span class="knowledge-empty-mark" aria-hidden="true">◇</span>
      <h2>还没有沉淀的知识</h2>
      <p>在问答中整理有价值的回答，保存为长期知识，逐步建立可验证的个人知识库。</p>
      <RouterLink :to="`/knowledge-bases/${knowledgeBaseId}/chat`" class="knowledge-primary-action">
        开始问答
      </RouterLink>
    </section>

    <KnowledgeEntryFormDialog
      v-model="editVisible"
      title="编辑知识"
      :initial-value="editValue()"
      :submitting="submitting"
      @submit="save"
    />
  </main>
</template>
