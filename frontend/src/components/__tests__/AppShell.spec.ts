import { mount } from '@vue/test-utils'
import { ElDropdown } from 'element-plus'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AppShell from '@/components/AppShell.vue'

const mainCss = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8')

const routerPush = vi.fn()
const routeState = {
  name: 'home' as string,
  params: {} as Record<string, string | undefined>,
}

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: routerPush }),
  RouterLink: {
    props: ['to', 'activeClass', 'exactActiveClass'],
    template: '<a :data-to="to"><slot /></a>',
  },
}))

const dropdownStubs = {
  ElDropdown: {
    name: 'ElDropdown',
    emits: ['command'],
    template: '<div class="el-dropdown"><slot /><slot name="dropdown" /></div>',
  },
  ElDropdownMenu: { template: '<div class="el-dropdown-menu"><slot /></div>' },
  ElDropdownItem: {
    props: ['command', 'disabled', 'divided'],
    template: '<button class="el-dropdown-item" :disabled="disabled"><slot /></button>',
  },
}

function mountShell(options: Parameters<typeof mount>[1] = {}) {
  return mount(AppShell, {
    ...options,
    global: {
      ...options.global,
      stubs: {
        ...dropdownStubs,
        ...options.global?.stubs,
      },
    },
  })
}

describe('AppShell', () => {
  beforeEach(() => {
    routeState.name = 'home'
    routeState.params = {}
    routerPush.mockReset()
  })

  it('renders the compact global navigation without knowledge-base tabs', () => {
    const wrapper = mountShell({ slots: { default: '<p>Page content</p>' } })

    expect(wrapper.text()).toContain('TraceMind')
    expect(wrapper.text()).toContain('Evidence · Knowledge · Trust')
    expect(wrapper.text()).toContain('Local-first')
    expect(wrapper.text()).toContain('Workspace')
    expect(wrapper.get('.global-nav-link').attributes('data-to')).toBe('/')
    expect(wrapper.text()).toContain('Page content')
    expect(wrapper.get('.brand-mark-placeholder').attributes('data-placeholder')).toBe('true')
    expect(wrapper.find('.kb-tabs').exists()).toBe(false)
    expect(wrapper.find('.mobile-navigation').exists()).toBe(false)
    expect(wrapper.get('.mobile-shell-context').text()).toBe('Workspace')
    expect(wrapper.get('.mobile-local-status').attributes('aria-label')).toContain('Local-first')
  })

  it('renders scoped navigation and the injected knowledge-base name in one bar', () => {
    routeState.name = 'documents'
    routeState.params = { knowledgeBaseId: 'kb-1' }
    const wrapper = mountShell({
      global: { provide: { shellKbName: ref('Project KB') } },
    })

    expect(wrapper.get('.shell-context-value').text()).toBe('Project KB')
    expect(wrapper.text()).not.toContain('Retrieval')
    expect(wrapper.text()).not.toContain('Hybrid + Rerank')
    expect(wrapper.get('.kb-tab[data-to="/knowledge-bases/kb-1/documents"]').text()).toBe('文档')
    expect(wrapper.get('.kb-tab[data-to="/knowledge-bases/kb-1/documents"]').classes()).toContain(
      'active',
    )
    expect(wrapper.get('.kb-tab[data-to="/knowledge-bases/kb-1/chat"]').text()).toBe('问答')
    expect(wrapper.get('.kb-tab[data-to="/knowledge-bases/kb-1/map"]').text()).toBe('图谱')
    expect(wrapper.find('.kb-bar').exists()).toBe(false)
  })

  it('provides one mobile menu with the real knowledge-base destinations', async () => {
    routeState.name = 'knowledge-detail'
    routeState.params = { knowledgeBaseId: 'kb-1' }
    const wrapper = mountShell({
      global: { provide: { shellKbName: ref('A very long knowledge base name') } },
    })

    expect(wrapper.get('.mobile-shell-context').text()).toContain('知识')
    expect(wrapper.get('.mobile-shell-kb').text()).toBe('A very long knowledge base name')
    expect(wrapper.get('.shell-menu-trigger').attributes('aria-label')).toContain('Local-first')
    expect(wrapper.get('.shell-mobile-menu').text()).toContain('问答')
    expect(wrapper.get('.shell-mobile-menu').text()).toContain('资料')
    expect(wrapper.get('.shell-mobile-menu').text()).toContain('知识')
    expect(wrapper.get('.shell-mobile-menu').text()).toContain('图谱')
    expect(wrapper.get('.shell-mobile-menu').text()).toContain('返回 Workspace')
    expect(wrapper.get('.shell-mobile-menu').text()).toContain('Local-first')
    expect(
      wrapper.findAll('.el-dropdown-item').filter((item) => item.classes('active')),
    ).toHaveLength(1)

    wrapper.getComponent(ElDropdown).vm.$emit('command', '/knowledge-bases/kb-1/chat')
    await wrapper.vm.$nextTick()
    expect(routerPush).toHaveBeenCalledWith('/knowledge-bases/kb-1/chat')
  })

  it('keeps landing outside knowledge-base navigation', () => {
    routeState.name = 'landing'
    const wrapper = mountShell()

    expect(wrapper.get('.mobile-shell-context').text()).toBe('产品介绍')
    expect(wrapper.find('.kb-tabs').exists()).toBe(false)
    expect(wrapper.find('.mobile-navigation').exists()).toBe(false)
  })

  it('labels the Retrieval route without adding it to primary navigation', () => {
    routeState.name = 'retrieval'
    routeState.params = { knowledgeBaseId: 'kb-1' }
    const wrapper = mountShell({ global: { provide: { shellKbName: ref('Project KB') } } })

    expect(wrapper.get('.mobile-shell-context').text()).toContain('检索')
    expect(wrapper.findAll('.kb-tab')).toHaveLength(4)
    expect(wrapper.get('.kb-tabs').text()).not.toContain('检索')
    expect(wrapper.get('.shell-mobile-menu').text()).not.toContain('检索')
  })

  it('switches to a non-scrolling mobile shell with an ellipsized knowledge-base identity', () => {
    const tabletStart = mainCss.indexOf('@media (max-width: 820px)')
    const mobileStart = mainCss.indexOf('@media (max-width: 680px)', tabletStart)
    const pointerStart = mainCss.indexOf('@media (pointer: coarse)', mobileStart)
    const tabletRules = mainCss.slice(tabletStart, mobileStart)
    const mobileRules = mainCss.slice(mobileStart, pointerStart)

    expect(tabletRules).not.toContain('overflow-x: auto')
    expect(mobileRules).toContain('.desktop-kb-navigation')
    expect(mobileRules).toContain('.el-dropdown.mobile-navigation')
    expect(mobileRules).toContain('text-overflow: ellipsis')
    expect(mobileRules).toContain('height: 44px')
  })
})
