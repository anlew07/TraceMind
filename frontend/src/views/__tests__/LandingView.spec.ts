import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchHealth } from '@/services/health'
import LandingView from '@/views/LandingView.vue'

vi.mock('@/services/health', () => ({ fetchHealth: vi.fn() }))
const mockedFetchHealth = vi.mocked(fetchHealth)

function mountView() {
  return mount(LandingView, {
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :data-to="to"><slot /></a>' },
      },
    },
  })
}

describe('LandingView', () => {
  beforeEach(() => {
    mockedFetchHealth.mockReset()
    mockedFetchHealth.mockResolvedValue({
      status: 'ok',
      service: 'TraceMind API',
      version: '1.0.0',
    })
  })

  it('keeps the product introduction separate and enters the workspace directly', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('TraceMind')
    expect(wrapper.text()).toContain('Document · Retrieval · Evidence · Answer · Knowledge')
    expect(wrapper.get('.landing-cta').attributes('data-to')).toBe('/')
  })

  it('shows backend availability failure and supports retry', async () => {
    mockedFetchHealth
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ status: 'ok', service: 'TraceMind API', version: '1.0.0' })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('后端服务不可用')
    await wrapper.get('.landing-retry').trigger('click')
    await flushPromises()
    expect(mockedFetchHealth).toHaveBeenCalledTimes(2)
  })
})
