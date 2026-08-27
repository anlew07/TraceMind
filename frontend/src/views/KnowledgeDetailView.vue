<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, type Ref } from 'vue'
import { ElButton, ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import EvidenceSourceList from '@/components/EvidenceSourceList.vue'
import KnowledgeEntryFormDialog from '@/components/KnowledgeEntryFormDialog.vue'
import MarkdownContent from '@/components/MarkdownContent.vue'
import { getKnowledgeBase } from '@/services/knowledgeBases'
import {
  deleteKnowledgeEntry,
  getKnowledgeEntry,
  requestKnowledgeEntryIndex,
  updateKnowledgeEntry,
} from '@/services/knowledgeEntries'
import type { KnowledgeEntry, KnowledgeEntryInput } from '@/types/knowledgeEntry'

const route = useRoute()
const router = useRouter()
const knowledgeBaseId = String(route.params.knowledgeBaseId)
const entryId = String(route.params.entryId)
const shellKbName = inject<Ref<string>>('shellKbName', ref(''))
const entry = ref<KnowledgeEntry | null>(null)
const error = ref('')
const editVisible = ref(false)
const submitting = ref(false)
const statusLabels = { unverified: '未验证', verified: '已验证', outdated: '已过期' } as const
const indexLabels = {
  not_indexed: '未建立索引',
  pending: '等待索引',
  processing: '正在索引',
  succeeded: '索引就绪',
  failed: '索引失败',
} as const
let indexPollTimer: number | undefined

const ragAvailability = computed(() => {
  if (!entry.value) return ''
  if (entry.value.validation_status !== 'verified') return '不参与问答检索'
  if (entry.value.index_status === 'succeeded') return '可用于问答检索'
  if (entry.value.index_status === 'pending' || entry.value.index_status === 'processing') {
    return '正在准备问答检索'
  }
  return '暂不可用于问答检索'
})

const ragAvailabilityTone = computed(() => {
  if (!entry.value || entry.value.validation_status !== 'verified') return 'inactive'
  if (entry.value.index_status === 'succeeded') return 'available'
  if (entry.value.index_status === 'failed') return 'failed'
  return 'pending'
})

const ragAvailabilityDescription = computed(() => {
  if (!entry.value) return ''
  if (entry.value.validation_status === 'unverified') {
    return '完成验证后，系统才会为这条知识建立检索索引。'
  }
  if (entry.value.validation_status === 'outdated') {
    return '这条知识已标记为过期，不会用于新的问答检索。'
  }
  if (entry.value.index_status === 'succeeded') {
    return '这条已验证知识已进入当前知识库的问答检索。'
  }
  if (entry.value.index_status === 'failed') {
    return '知识内容仍保持已验证；仅检索索引建立失败。'
  }
  return '知识已验证，检索索引仍在准备中。'
})

const indexDescription = computed(() => {
  if (!entry.value) return ''
  if (entry.value.index_status === 'succeeded') {
    return `已索引 ${entry.value.indexed_chunk_count} 个知识片段。`
  }
  if (entry.value.index_status === 'failed') {
    return '知识验证状态未改变；可以重新提交索引。'
  }
  if (entry.value.index_status === 'pending') return '索引任务正在等待处理。'
  if (entry.value.index_status === 'processing') return '正在更新用于问答检索的知识片段。'
  return '当前没有可用于问答检索的知识索引。'
})

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value))
}

function scheduleIndexPoll(): void {
  window.clearTimeout(indexPollTimer)
  if (entry.value && ['pending', 'processing'].includes(entry.value.index_status)) {
    indexPollTimer = window.setTimeout(() => void load(), 2_000)
  }
}

async function load(): Promise<void> {
  try {
    entry.value = await getKnowledgeEntry(knowledgeBaseId, entryId)
    scheduleIndexPoll()
  } catch {
    error.value = '知识详情加载失败，请稍后重试'
  }
}

function editValue(): KnowledgeEntryInput {
  const value = entry.value
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
  submitting.value = true
  try {
    entry.value = await updateKnowledgeEntry(knowledgeBaseId, entryId, value)
    scheduleIndexPoll()
    editVisible.value = false
    ElMessage.success('知识已更新')
  } catch {
    ElMessage.error('知识更新失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

async function remove(): Promise<void> {
  try {
    await ElMessageBox.confirm('确定删除这条知识吗？', '删除知识', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteKnowledgeEntry(knowledgeBaseId, entryId)
    await router.push(`/knowledge-bases/${knowledgeBaseId}/knowledge`)
  } catch {
    ElMessage.error('知识删除失败，请稍后重试')
  }
}

async function retryIndex(): Promise<void> {
  if (!entry.value) return
  try {
    entry.value = await requestKnowledgeEntryIndex(knowledgeBaseId, entryId, true)
    scheduleIndexPoll()
    ElMessage.success('已重新提交知识索引')
  } catch {
    ElMessage.error('知识索引提交失败，请确认 Worker 状态后重试')
  }
}

onMounted(async () => {
  try {
    shellKbName.value = (await getKnowledgeBase(knowledgeBaseId)).name
  } catch {
    error.value = '知识库不存在或加载失败'
  }
  await load()
})

onUnmounted(() => window.clearTimeout(indexPollTimer))
</script>

<template>
  <main class="knowledge-detail-page">
    <RouterLink :to="`/knowledge-bases/${knowledgeBaseId}/knowledge`" class="back-link">
      ← 返回知识列表
    </RouterLink>
    <div v-if="error" class="conv-error" role="alert">{{ error }}</div>
    <template v-else-if="entry">
      <header class="knowledge-detail-head">
        <div class="knowledge-detail-title">
          <div class="knowledge-detail-status-line">
            <span class="knowledge-status" :data-status="entry.validation_status">
              {{ statusLabels[entry.validation_status] }}
            </span>
            <span class="knowledge-rag-availability" :data-availability="ragAvailabilityTone">
              {{ ragAvailability }}
            </span>
          </div>
          <h1>{{ entry.question }}</h1>
          <div class="knowledge-detail-byline">
            <div v-if="entry.tags.length" class="knowledge-row-tags" aria-label="标签">
              <span v-for="item in entry.tags" :key="item">{{ item }}</span>
            </div>
            <time :datetime="entry.updated_at">更新于 {{ formatDate(entry.updated_at) }}</time>
          </div>
        </div>
        <div class="knowledge-detail-actions">
          <ElButton type="primary" @click="editVisible = true">编辑知识</ElButton>
          <details class="knowledge-row-menu knowledge-detail-menu">
            <summary aria-label="更多知识操作">···</summary>
            <div class="knowledge-row-menu-items">
              <button type="button" class="danger" @click="remove">删除</button>
            </div>
          </details>
        </div>
      </header>

      <div class="knowledge-detail-layout">
        <article class="knowledge-article">
          <section v-if="entry.background" class="knowledge-record-context">
            <h2>背景</h2>
            <p>{{ entry.background }}</p>
          </section>
          <section v-if="entry.root_cause" class="knowledge-record-context">
            <h2>根因</h2>
            <p>{{ entry.root_cause }}</p>
          </section>
          <section class="knowledge-solution">
            <h2>解决方案</h2>
            <MarkdownContent class="knowledge-prose" :content="entry.solution" />
          </section>
          <section v-if="entry.failed_attempts.length">
            <h2>失败尝试</h2>
            <ul>
              <li v-for="attempt in entry.failed_attempts" :key="attempt">{{ attempt }}</li>
            </ul>
          </section>
          <section class="knowledge-origin">
            <h2>原始问答快照</h2>
            <p class="knowledge-section-note">保存知识时的问答内容，用于长期核对来源。</p>
            <div class="knowledge-question-snapshot">
              <span>原始问题</span>
              <p>{{ entry.question_snapshot }}</p>
            </div>
            <MarkdownContent class="knowledge-prose" :content="entry.answer_snapshot" />
          </section>
        </article>

        <aside class="knowledge-record-inspector" aria-label="知识记录详情">
          <section class="knowledge-inspector-section" data-testid="knowledge-status-section">
            <h2>知识状态</h2>
            <div class="knowledge-inspector-pair">
              <span>验证</span>
              <strong>{{ statusLabels[entry.validation_status] }}</strong>
            </div>
            <div class="knowledge-inspector-pair">
              <span>问答检索</span>
              <strong>{{ ragAvailability }}</strong>
            </div>
            <p>{{ ragAvailabilityDescription }}</p>
          </section>

          <section
            class="knowledge-inspector-section knowledge-evidence"
            data-testid="evidence-snapshot"
          >
            <h2>证据快照</h2>
            <p class="knowledge-section-note">保存于这条知识创建时，不随原始资料变化而改写。</p>
            <EvidenceSourceList
              v-if="entry.sources_snapshot.length"
              :sources="entry.sources_snapshot"
              :identity-prefix="entry.id"
              snapshot-mode
            />
            <p v-else class="muted-text">这条原始回答没有引用证据。</p>
          </section>

          <section class="knowledge-inspector-section" data-testid="knowledge-lineage">
            <h2>来源链路</h2>
            <ol class="knowledge-lineage-list">
              <li :data-state="entry.source_conversation_id ? 'available' : 'unavailable'">
                <span>会话</span>
                <RouterLink
                  v-if="entry.source_conversation_id"
                  :to="`/knowledge-bases/${knowledgeBaseId}/chat?conversation=${entry.source_conversation_id}`"
                  class="text-action"
                >
                  打开来源会话 →
                </RouterLink>
                <strong v-else>来源会话已不可用</strong>
              </li>
              <li>
                <span>回答</span>
                <strong>原始回答快照已保留</strong>
              </li>
              <li>
                <span>Evidence</span>
                <strong>{{ entry.sources_snapshot.length }} 条证据快照</strong>
              </li>
              <li>
                <span>知识</span>
                <strong>当前知识记录</strong>
              </li>
            </ol>
            <p v-if="!entry.source_conversation_id" class="knowledge-preserved-note">
              原始问答与证据快照仍然保留，可继续核对这条知识的依据。
            </p>
          </section>

          <section class="knowledge-inspector-section" data-testid="knowledge-index-section">
            <h2>检索索引</h2>
            <span class="knowledge-index-status" :data-status="entry.index_status">
              {{ indexLabels[entry.index_status] }}
            </span>
            <p>{{ indexDescription }}</p>
            <ElButton
              v-if="entry.validation_status === 'verified' && entry.index_status === 'failed'"
              class="knowledge-index-retry"
              @click="retryIndex"
            >
              重试索引
            </ElButton>
          </section>
        </aside>
      </div>

      <KnowledgeEntryFormDialog
        v-model="editVisible"
        title="编辑知识"
        :initial-value="editValue()"
        :submitting="submitting"
        @submit="save"
      />
    </template>
  </main>
</template>
