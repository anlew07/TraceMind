<script setup lang="ts">
import { ElDropdown, ElDropdownItem, ElDropdownMenu } from 'element-plus'
import { computed, inject, ref, watch, type Ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const kbId = computed(() => {
  const id = route.params.knowledgeBaseId
  return typeof id === 'string' && id ? id : null
})

const shellKbName = inject<Ref<string>>('shellKbName', ref(''))

const activeSection = computed(() => {
  if (route.name === 'conversation') return 'chat'
  if (route.name === 'documents') return 'documents'
  if (route.name === 'knowledge' || route.name === 'knowledge-detail') return 'knowledge'
  if (route.name === 'knowledge-map') return 'map'
  return null
})

const currentPageLabel = computed(() => {
  const labels: Record<string, string> = {
    chat: '问答',
    documents: '资料',
    knowledge: '知识',
    map: '图谱',
  }

  if (activeSection.value) return labels[activeSection.value]
  if (route.name === 'retrieval') return '检索'
  if (route.name === 'data-management') return '数据与恢复'
  return route.name === 'landing' ? '产品介绍' : '工作区'
})

const mobileNavigation = computed(() => {
  if (!kbId.value) return []
  return [
    { key: 'chat', label: '问答', to: `/knowledge-bases/${kbId.value}/chat` },
    { key: 'documents', label: '资料', to: `/knowledge-bases/${kbId.value}/documents` },
    { key: 'knowledge', label: '知识', to: `/knowledge-bases/${kbId.value}/knowledge` },
    { key: 'map', label: '图谱', to: `/knowledge-bases/${kbId.value}/map` },
  ]
})

function navigateFromMobileMenu(command: string | number | object) {
  if (typeof command === 'string') void router.push(command)
}

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
          <span class="shell-context-label">知识库</span>
          <strong class="shell-context-value">{{ shellKbName || '知识库' }}</strong>
        </span>
      </div>

      <nav v-if="kbId" class="kb-tabs desktop-kb-navigation" aria-label="知识库功能">
        <RouterLink
          :to="`/knowledge-bases/${kbId}/chat`"
          class="kb-tab"
          :class="{ active: activeSection === 'chat' }"
          >问答</RouterLink
        >
        <RouterLink
          :to="`/knowledge-bases/${kbId}/documents`"
          class="kb-tab"
          :class="{ active: activeSection === 'documents' }"
          >资料</RouterLink
        >
        <RouterLink
          :to="`/knowledge-bases/${kbId}/knowledge`"
          class="kb-tab"
          :class="{ active: activeSection === 'knowledge' }"
          >知识</RouterLink
        >
        <RouterLink
          :to="`/knowledge-bases/${kbId}/map`"
          class="kb-tab"
          :class="{ active: activeSection === 'map' }"
          >图谱</RouterLink
        >
      </nav>

      <div class="shell-actions desktop-shell-actions">
        <span class="local-first-status" role="status" aria-label="本地优先运行方式">
          <span class="status-dot" aria-hidden="true"></span>
          Local-first
        </span>
        <RouterLink to="/" class="global-nav-link" exact-active-class="active"
          >工作区</RouterLink
        >
      </div>

      <div
        class="mobile-shell-context"
        :class="{ 'is-workspace': !kbId }"
        aria-label="当前页面上下文"
      >
        <span class="mobile-shell-page">{{ currentPageLabel }}</span>
        <span v-if="kbId" class="mobile-shell-separator" aria-hidden="true">·</span>
        <strong v-if="kbId" class="mobile-shell-kb">{{ shellKbName || '知识库' }}</strong>
      </div>

      <ElDropdown
        v-if="kbId"
        class="mobile-navigation"
        trigger="click"
        placement="bottom-end"
        popper-class="shell-mobile-popper"
        @command="navigateFromMobileMenu"
      >
        <button
          type="button"
          class="shell-menu-trigger"
          aria-label="打开知识库导航；Local-first"
          aria-haspopup="menu"
        >
          <span class="status-dot" aria-hidden="true"></span>
          <span>菜单</span>
        </button>
        <template #dropdown>
          <ElDropdownMenu class="shell-mobile-menu" aria-label="知识库功能">
            <ElDropdownItem
              v-for="item in mobileNavigation"
              :key="item.key"
              :command="item.to"
              :class="{ active: activeSection === item.key }"
            >
              <span>{{ item.label }}</span>
              <span v-if="activeSection === item.key" class="shell-mobile-menu-current">当前</span>
            </ElDropdownItem>
            <ElDropdownItem divided command="/">返回工作区</ElDropdownItem>
            <ElDropdownItem disabled class="shell-mobile-local-first">
              <span class="status-dot" aria-hidden="true"></span>
              <span>Local-first · 本地运行</span>
            </ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>

      <span
        v-else
        class="mobile-local-status"
        role="status"
        aria-label="Local-first，本地优先运行方式"
        title="Local-first"
      >
        <span class="status-dot" aria-hidden="true"></span>
      </span>
    </header>

    <main class="app-content">
      <slot />
    </main>
  </div>
</template>
