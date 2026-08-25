<script setup lang="ts">
import { computed, inject, ref, watch, type Ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()

const kbId = computed(() => {
  const id = route.params.knowledgeBaseId
  return typeof id === 'string' && id ? id : null
})

const shellKbName = inject<Ref<string>>('shellKbName', ref(''))

watch(kbId, () => {
  shellKbName.value = ''
})
</script>

<template>
  <div class="app-shell">
    <header class="global-header">
      <RouterLink to="/" class="brand" aria-label="TraceMind 首页">
        <span
          class="brand-mark-placeholder"
          data-placeholder="true"
          title="临时品牌标记，待批准的 Compass 资产替换"
          aria-hidden="true"
          >T</span
        >
        <span class="brand-copy">
          <span class="brand-wordmark">TraceMind</span>
          <span class="brand-descriptor">Evidence · Knowledge · Trust</span>
        </span>
      </RouterLink>

      <div v-if="kbId" class="shell-context" aria-label="当前知识库上下文">
        <span class="shell-context-group">
          <span class="shell-context-label">Knowledge Base</span>
          <strong class="shell-context-value">{{ shellKbName || '知识库' }}</strong>
        </span>
      </div>

      <nav v-if="kbId" class="kb-tabs" aria-label="知识库功能">
        <RouterLink :to="`/knowledge-bases/${kbId}/chat`" class="kb-tab" active-class="active"
          >问答</RouterLink
        >
        <RouterLink
          :to="`/knowledge-bases/${kbId}/documents`"
          class="kb-tab"
          active-class="active"
          >文档</RouterLink
        >
        <RouterLink :to="`/knowledge-bases/${kbId}/knowledge`" class="kb-tab" active-class="active"
          >知识</RouterLink
        >
        <RouterLink :to="`/knowledge-bases/${kbId}/map`" class="kb-tab" active-class="active"
          >图谱</RouterLink
        >
      </nav>

      <div class="shell-actions">
        <span class="local-first-status" role="status" aria-label="本地优先运行方式">
          <span class="status-dot" aria-hidden="true"></span>
          Local-first
        </span>
        <RouterLink to="/knowledge-bases" class="global-nav-link" active-class="active"
          >知识库</RouterLink
        >
      </div>
    </header>

    <main class="app-content">
      <slot />
    </main>
  </div>
</template>
