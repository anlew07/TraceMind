<script setup lang="ts">
import {
  ElAlert,
  ElButton,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElMessage,
  ElMessageBox,
} from 'element-plus'
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import KnowledgeBaseFormDialog from '@/components/KnowledgeBaseFormDialog.vue'
import { ApiError } from '@/services/api'
import { deleteKnowledgeBase, listKnowledgeBases } from '@/services/knowledgeBases'
import type { KnowledgeBase } from '@/types/knowledgeBase'

const router = useRouter()
const items = ref<KnowledgeBase[]>([])
const loading = ref(false)
const errorMessage = ref('')
const dialogVisible = ref(false)
const editingKnowledgeBase = ref<KnowledgeBase | null>(null)
const deletingId = ref<string | null>(null)

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

async function loadKnowledgeBases(): Promise<void> {
  if (loading.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await listKnowledgeBases()
    items.value = response.items
  } catch {
    errorMessage.value = '知识空间加载失败，请检查后端服务后重试'
  } finally {
    loading.value = false
  }
}

function openCreateDialog(): void {
  editingKnowledgeBase.value = null
  dialogVisible.value = true
}

function openEditDialog(knowledgeBase: KnowledgeBase): void {
  editingKnowledgeBase.value = knowledgeBase
  dialogVisible.value = true
}

function openDataManagement(knowledgeBase: KnowledgeBase): void {
  void router.push(`/knowledge-bases/${knowledgeBase.id}/data-management`)
}

async function handleSaved(
  knowledgeBase: KnowledgeBase,
  mode: 'created' | 'updated',
): Promise<void> {
  if (mode === 'created') {
    await router.push(`/knowledge-bases/${knowledgeBase.id}/chat`)
    return
  }
  await loadKnowledgeBases()
}

async function confirmDelete(knowledgeBase: KnowledgeBase): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除知识库“${knowledgeBase.name}”吗？此操作无法撤销。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  if (deletingId.value) return
  deletingId.value = knowledgeBase.id
  try {
    await deleteKnowledgeBase(knowledgeBase.id)
    ElMessage.success('知识库删除成功')
    await loadKnowledgeBases()
  } catch (error) {
    ElMessage.error(
      error instanceof ApiError && error.status === 409
        ? '知识库中仍有文档，请先删除文档'
        : '知识库删除失败，请稍后重试',
    )
  } finally {
    deletingId.value = null
  }
}

onMounted(loadKnowledgeBases)
</script>

<template>
  <main class="workspace-home">
    <div class="workspace-home-inner">
      <header class="workspace-home-header">
        <div class="workspace-home-heading">
          <span class="workspace-home-kicker">研究工作台</span>
          <h1>工作区</h1>
          <p>选择一个知识空间，继续检索、验证证据与沉淀结论。</p>
        </div>
        <ElButton type="primary" data-testid="create-knowledge-base" @click="openCreateDialog">
          创建知识库
        </ElButton>
      </header>

      <ElAlert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        show-icon
        :closable="false"
        class="workspace-alert"
      >
        <button class="workspace-inline-action" type="button" @click="loadKnowledgeBases">
          重试
        </button>
      </ElAlert>

      <section class="workspace-spaces" :aria-busy="loading" aria-labelledby="spaces-heading">
        <div class="workspace-section-heading">
          <h2 id="spaces-heading">知识空间</h2>
          <span v-if="items.length">{{ items.length }} 个空间</span>
        </div>

        <div v-if="loading && items.length === 0" class="workspace-loading" role="status">
          正在整理你的知识空间…
        </div>

        <div v-else-if="items.length === 0 && !errorMessage" class="workspace-empty">
          <span class="workspace-empty-mark" aria-hidden="true">T</span>
          <h2>建立第一个知识空间</h2>
          <p>为项目、主题或长期研究创建独立空间，再导入真实资料开始追溯。</p>
          <ElButton type="primary" @click="openCreateDialog">创建知识库</ElButton>
        </div>

        <div v-else class="workspace-kb-grid">
          <article v-for="kb in items" :key="kb.id" class="workspace-kb-card">
            <RouterLink
              :to="`/knowledge-bases/${kb.id}/chat`"
              class="workspace-kb-link"
              :aria-label="`进入 ${kb.name} 的研究会话`"
            >
              <div class="workspace-kb-copy">
                <h3>{{ kb.name }}</h3>
                <p v-if="kb.description">{{ kb.description }}</p>
                <p v-else class="workspace-kb-description-empty">尚未添加空间说明</p>
              </div>
              <div class="workspace-kb-meta">
                <time :datetime="kb.updated_at">更新于 {{ formatDate(kb.updated_at) }}</time>
                <span>继续研究 →</span>
              </div>
            </RouterLink>

            <div class="workspace-kb-actions">
              <ElDropdown trigger="click" :hide-on-click="true">
                <button class="workspace-kb-more" type="button" :aria-label="`${kb.name} 操作`">
                  ···
                </button>
                <template #dropdown>
                  <ElDropdownMenu>
                    <ElDropdownItem @click="openEditDialog(kb)">编辑</ElDropdownItem>
                    <ElDropdownItem
                      :data-testid="`data-management-${kb.id}`"
                      @click="openDataManagement(kb)"
                    >
                      数据与恢复
                    </ElDropdownItem>
                    <ElDropdownItem
                      :data-testid="`delete-${kb.id}`"
                      divided
                      style="color: var(--color-error)"
                      @click="confirmDelete(kb)"
                    >
                      删除
                    </ElDropdownItem>
                  </ElDropdownMenu>
                </template>
              </ElDropdown>
            </div>
          </article>
        </div>
      </section>
    </div>

    <KnowledgeBaseFormDialog
      v-model="dialogVisible"
      :knowledge-base="editingKnowledgeBase"
      @saved="handleSaved"
    />
  </main>
</template>
