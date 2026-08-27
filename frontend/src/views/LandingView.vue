<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { fetchHealth } from '@/services/health'
import { markLandingSeen } from '@/services/landingPreference'

type ServiceStatus = 'checking' | 'available' | 'unavailable'

const serviceStatus = ref<ServiceStatus>('checking')
const router = useRouter()

function enterWorkspace(): void {
  markLandingSeen()
  void router.push('/knowledge-bases')
}

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
      <p class="landing-kicker">本地优先 · 证据可追溯</p>
      <h1>TraceMind</h1>
      <p class="landing-desc">
        把文档、代码与研究记录组织成可检索的知识，<br />让每个回答都能回到真实来源。
      </p>
      <button type="button" class="landing-cta" @click="enterWorkspace">进入工作区 →</button>
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
