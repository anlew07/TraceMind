<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { fetchHealth } from '@/services/health'

type ServiceStatus = 'checking' | 'available' | 'unavailable'

const serviceStatus = ref<ServiceStatus>('checking')

async function checkBackend(): Promise<void> {
  serviceStatus.value = 'checking'
  try {
    await fetchHealth()
    serviceStatus.value = 'available'
  } catch {
    serviceStatus.value = 'unavailable'
  }
}

onMounted(checkBackend)
</script>

<template>
  <main class="landing-view">
    <div class="landing-center">
      <p class="landing-kicker">LOCAL-FIRST · EVIDENCE-GROUNDED</p>
      <h1>TraceMind</h1>
      <p class="landing-desc">
        把文档、代码与研究记录组织成可检索的知识，<br />让每个回答都能回到真实来源。
      </p>
      <RouterLink to="/" class="landing-cta">进入 Workspace →</RouterLink>
      <p class="landing-loop" aria-label="TraceMind 知识闭环">
        Document · Retrieval · Evidence · Answer · Knowledge
      </p>
      <div v-if="serviceStatus === 'unavailable'" class="landing-status" role="status">
        后端服务不可用 —
        <button class="landing-retry" type="button" @click="checkBackend">重试</button>
      </div>
    </div>
  </main>
</template>
