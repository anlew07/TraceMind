import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import KnowledgeBaseView from '@/views/KnowledgeBaseView.vue'
import HomeView from '@/views/HomeView.vue'

describe('HomeView', () => {
  it('uses the knowledge-space workspace as the daily home', () => {
    const wrapper = shallowMount(HomeView)

    expect(wrapper.findComponent(KnowledgeBaseView).exists()).toBe(true)
  })
})
