import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchHealth } from '@/services/health'
import { LANDING_SEEN_STORAGE_KEY } from '@/services/landingPreference'
import LandingView from '@/views/LandingView.vue'

vi.mock('@/services/health', () => ({ fetchHealth: vi.fn() }))
const mockedFetchHealth = vi.mocked(fetchHealth)

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/landing', component: LandingView },
      { path: '/knowledge-bases', component: { template: '<div>工作区</div>' } },
    ],
  })
  await router.push('/landing')
  await router.isReady()
  const wrapper = mount(LandingView, { global: { plugins: [router] } })
  return { router, wrapper }
}

describe('LandingView', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockedFetchHealth.mockReset()
    mockedFetchHealth.mockResolvedValue({
      status: 'ok',
      service: 'TraceMind API',
      version: '1.1.0',
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('keeps the product introduction separate and enters the workspace directly', async () => {
    const { router, wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('TraceMind')
    expect(wrapper.text()).toContain('Document · Retrieval · Evidence · Answer · Knowledge')
    await wrapper.get('.landing-cta').trigger('click')
    await flushPromises()

    expect(window.localStorage.getItem(LANDING_SEEN_STORAGE_KEY)).toBe('true')
    expect(router.currentRoute.value.fullPath).toBe('/knowledge-bases')
  })

  it('enters the workspace even when localStorage cannot be written', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError')
    })
    const { router, wrapper } = await mountView()

    await wrapper.get('.landing-cta').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/knowledge-bases')
  })

  it('shows backend availability failure and supports retry', async () => {
    mockedFetchHealth
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ status: 'ok', service: 'TraceMind API', version: '1.1.0' })
    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('后端服务不可用')
    await wrapper.get('.landing-retry').trigger('click')
    await flushPromises()
    expect(mockedFetchHealth).toHaveBeenCalledTimes(2)
  })
})
