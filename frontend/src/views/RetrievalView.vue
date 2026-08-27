<script setup lang="ts">
import { inject, onMounted, ref, watch, type Ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import SemanticSearchPanel from '@/components/SemanticSearchPanel.vue'
import { listDocuments } from '@/services/documents'
import { getKnowledgeBase } from '@/services/knowledgeBases'
import type { DocumentItem } from '@/types/document'

const route = useRoute()
const knowledgeBaseId = String(route.params.knowledgeBaseId)
const knowledgeBaseName = ref('')
const documents = ref<DocumentItem[]>([])
const loading = ref(true)
const errorMessage = ref('')
const shellKbName = inject<Ref<string>>('shellKbName', ref(''))

watch(knowledgeBaseName, (name) => {
  shellKbName.value = name || ''
})

async function loadPage(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const [knowledgeBase, documentResponse] = await Promise.all([
      getKnowledgeBase(knowledgeBaseId),
      listDocuments(knowledgeBaseId, '', 0, 100),
    ])
    knowledgeBaseName.value = knowledgeBase.name
    documents.value = documentResponse.items
  } catch {
    errorMessage.value = '检索工作区加载失败，请检查知识库或后端服务后重试。'
  } finally {
    loading.value = false
  }
}

onMounted(loadPage)
</script>

<template>
  <main class="retrieval-page">
    <header class="retrieval-page-header">
      <div>
        <RouterLink
          :to="{ name: 'documents', params: { knowledgeBaseId } }"
          class="retrieval-back-link"
        >
          ← 资料
        </RouterLink>
        <h1>检索工作区</h1>
        <p>验证真实召回、排序和 Evidence 候选；不调用 LLM 生成。</p>
      </div>
      <div class="retrieval-page-context" aria-label="当前检索上下文">
        <span>当前知识库</span>
        <strong>{{ knowledgeBaseName || '—' }}</strong>
      </div>
    </header>

    <div v-if="loading" class="retrieval-page-state" role="status">正在加载检索工作区…</div>
    <div v-else-if="errorMessage" class="retrieval-page-state retrieval-page-error" role="alert">
      <p>{{ errorMessage }}</p>
      <button type="button" @click="loadPage">重试</button>
    </div>
    <SemanticSearchPanel v-else :knowledge-base-id="knowledgeBaseId" :documents="documents" />
  </main>
</template>
