import { flushPromises, mount } from '@vue/test-utils'
import { ElMessage, ElMessageBox } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteKnowledgeBase, listKnowledgeBases } from '@/services/knowledgeBases'
import type { KnowledgeBase, KnowledgeBaseListResponse } from '@/types/knowledgeBase'
import KnowledgeBaseView from '@/views/KnowledgeBaseView.vue'

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
  RouterLink: {
    props: ['to'],
    template: '<a :data-to="to"><slot /></a>',
  },
}))

vi.mock('@/services/knowledgeBases', () => ({
  listKnowledgeBases: vi.fn(),
  deleteKnowledgeBase: vi.fn(),
  createKnowledgeBase: vi.fn(),
  updateKnowledgeBase: vi.fn(),
}))
const mockedList = vi.mocked(listKnowledgeBases)
const mockedDelete = vi.mocked(deleteKnowledgeBase)
const kb: KnowledgeBase = {
  id: '8eaa2608',
  name: 'Backend Notes',
  description: 'Architecture records',
  created_at: '2026-07-17T01:00:00Z',
  updated_at: '2026-07-17T02:00:00Z',
}

function resp(items: KnowledgeBase[]): KnowledgeBaseListResponse {
  return { items, total: items.length, offset: 0, limit: 100 }
}

function mountView() {
  return mount(KnowledgeBaseView, {
    global: {
      stubs: {
        KnowledgeBaseFormDialog: true,
        ElDropdown: {
          props: ['trigger'],
          template: '<div class="el-dropdown"><slot /><slot name="dropdown" /></div>',
        },
        ElDropdownMenu: { template: '<div class="el-dropdown-menu"><slot /></div>' },
        ElDropdownItem: {
          props: ['disabled'],
          template:
            '<button class="el-dropdown-item" :disabled="disabled" :data-testid="$attrs[\'data-testid\']"><slot /></button>',
        },
      },
    },
  })
}

describe('KnowledgeBaseView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockedList.mockReset()
    mockedDelete.mockReset()
    routerPush.mockReset()
    vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
    vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ close: vi.fn() }))
  })

  it('loads real KB fields into editorial workspace tiles', async () => {
    mockedList.mockResolvedValue(resp([kb]))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Backend Notes')
    expect(wrapper.text()).toContain('Architecture records')
    expect(wrapper.text()).toContain('工作区')
    expect(wrapper.text()).toContain('更新于')
    expect(wrapper.text()).not.toContain('文档数量')
    expect(wrapper.get('.workspace-kb-link').attributes('data-to')).toBe(
      '/knowledge-bases/8eaa2608/chat',
    )
  })

  it('shows empty state', async () => {
    mockedList.mockResolvedValue(resp([]))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('建立第一个知识空间')
    expect(wrapper.text()).toContain('创建知识库')
  })

  it('shows error state', async () => {
    mockedList.mockRejectedValue(new Error('fail'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('加载失败')
  })

  it('opens create dialog', async () => {
    mockedList.mockResolvedValue(resp([]))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="create-knowledge-base"]').trigger('click')
    expect(wrapper.findComponent({ name: 'KnowledgeBaseFormDialog' }).exists()).toBe(true)
  })

  it('renders dropdown with contextual actions per KB', async () => {
    mockedList.mockResolvedValue(resp([kb]))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('.workspace-kb-card').element.tagName).toBe('ARTICLE')
    expect(wrapper.find('.workspace-kb-card > a.workspace-kb-link').exists()).toBe(true)
    expect(wrapper.find('.workspace-kb-card > .workspace-kb-actions .el-dropdown').exists()).toBe(
      true,
    )
    expect(wrapper.find('.el-dropdown').exists()).toBe(true)
    expect(wrapper.find('.el-dropdown-menu').exists()).toBe(true)
    const editBtn = wrapper.findAll('.el-dropdown-item').find((b) => b.text() === '编辑')
    const delBtn = wrapper.get('[data-testid="delete-8eaa2608"]')
    expect(editBtn).toBeTruthy()
    expect(wrapper.get('[data-testid="data-management-8eaa2608"]').text()).toBe('数据与恢复')
    expect(delBtn.text()).toBe('删除')
  })

  it('opens Data Management from the knowledge-space overflow menu', async () => {
    mockedList.mockResolvedValue(resp([kb]))
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="data-management-8eaa2608"]').trigger('click')

    expect(routerPush).toHaveBeenCalledWith('/knowledge-bases/8eaa2608/data-management')
  })

  it('invokes delete flow on dropdown item click', async () => {
    mockedList.mockResolvedValue(resp([kb]))
    mockedDelete.mockResolvedValue(undefined)
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="delete-8eaa2608"]').trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalled()
    expect(mockedDelete).toHaveBeenCalledWith('8eaa2608')
  })

  it('routes a newly created knowledge base directly into chat', async () => {
    mockedList.mockResolvedValue(resp([]))
    const wrapper = mountView()
    await flushPromises()

    await wrapper.getComponent({ name: 'KnowledgeBaseFormDialog' }).vm.$emit('saved', kb, 'created')
    await flushPromises()

    expect(routerPush).toHaveBeenCalledWith('/knowledge-bases/8eaa2608/chat')
  })

  it('refreshes in place after a rename', async () => {
    mockedList.mockResolvedValue(resp([kb]))
    const wrapper = mountView()
    await flushPromises()

    await wrapper
      .getComponent({ name: 'KnowledgeBaseFormDialog' })
      .vm.$emit('saved', { ...kb, name: 'Renamed' }, 'updated')
    await flushPromises()

    expect(mockedList).toHaveBeenCalledTimes(2)
    expect(routerPush).not.toHaveBeenCalled()
  })
})
