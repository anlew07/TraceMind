import { flushPromises, mount } from '@vue/test-utils'
import { ElMessage, ElMessageBox } from 'element-plus'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/services/api'
import {
  exportKnowledgeBaseArchive,
  getKnowledgeBaseRebuild,
  restoreKnowledgeBaseArchive,
  retryKnowledgeBaseRebuild,
  runConsistencyAudit,
  startConsistencyRepair,
  startKnowledgeBaseRebuild,
} from '@/services/dataMaintenance'
import { getKnowledgeBase } from '@/services/knowledgeBases'
import type {
  ConsistencyAuditResponse,
  ConsistencyRepairResponse,
  KnowledgeBaseArchiveRestoreResponse,
  KnowledgeBaseRebuildResponse,
} from '@/types/dataMaintenance'
import DataManagementView from '@/views/DataManagementView.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { knowledgeBaseId: 'kb-1' } }),
  RouterLink: {
    props: ['to'],
    template: '<a :data-to="typeof to === \'string\' ? to : JSON.stringify(to)"><slot /></a>',
  },
}))

vi.mock('@/services/knowledgeBases', () => ({ getKnowledgeBase: vi.fn() }))
vi.mock('@/services/dataMaintenance', () => ({
  exportKnowledgeBaseArchive: vi.fn(),
  restoreKnowledgeBaseArchive: vi.fn(),
  runConsistencyAudit: vi.fn(),
  startConsistencyRepair: vi.fn(),
  getConsistencyRepair: vi.fn(),
  retryConsistencyRepair: vi.fn(),
  getKnowledgeBaseRebuild: vi.fn(),
  startKnowledgeBaseRebuild: vi.fn(),
  retryKnowledgeBaseRebuild: vi.fn(),
}))

const mockedGetKnowledgeBase = vi.mocked(getKnowledgeBase)
const mockedGetRebuild = vi.mocked(getKnowledgeBaseRebuild)
const mockedExport = vi.mocked(exportKnowledgeBaseArchive)
const mockedRestore = vi.mocked(restoreKnowledgeBaseArchive)
const mockedAudit = vi.mocked(runConsistencyAudit)
const mockedRepair = vi.mocked(startConsistencyRepair)
const mockedStartRebuild = vi.mocked(startKnowledgeBaseRebuild)
const mockedRetryRebuild = vi.mocked(retryKnowledgeBaseRebuild)

const rebuildNotStarted: KnowledgeBaseRebuildResponse = {
  knowledge_base_id: 'kb-1',
  operation_id: null,
  status: 'not_started',
  document_versions_total: 0,
  document_versions_parsed: 0,
  document_versions_failed: 0,
  documents_total: 0,
  documents_indexed: 0,
  documents_failed: 0,
  knowledge_entries_total: 0,
  knowledge_entries_indexed: 0,
  knowledge_entries_failed: 0,
  started_at: null,
  completed_at: null,
  error_code: null,
  error_message: null,
}

const restoreResponse: KnowledgeBaseArchiveRestoreResponse = {
  knowledge_base_id: 'restored-kb',
  archive_id: 'archive-1',
  entity_counts: {
    knowledge_bases: 1,
    documents: 2,
    document_versions: 3,
    conversations: 4,
    messages: 5,
    knowledge_entries: 6,
  },
  restore_status: 'succeeded',
  rebuild_status: 'not_started',
}

const auditFinding: ConsistencyAuditResponse = {
  audit_id: 'audit-1',
  scope: 'knowledge_base',
  status: 'completed',
  knowledge_base_id: 'kb-1',
  started_at: '2026-08-26T01:00:00Z',
  completed_at: '2026-08-26T01:00:01Z',
  summary: { healthy: false, warning_count: 0, error_count: 1, critical_count: 0 },
  findings: [
    {
      finding_id: 'finding-1',
      code: 'latest_index_generation_missing',
      severity: 'ERROR',
      entity_type: 'document_version',
      entity_id: 'version-1',
      knowledge_base_id: 'kb-1',
      safe_message: 'Latest document index generation is missing.',
      details: { document_id: 'document-1' },
    },
  ],
}

const repairPlan: ConsistencyRepairResponse = {
  knowledge_base_id: 'kb-1',
  audit_id: 'audit-1',
  operation_id: null,
  dry_run: true,
  status: 'planned',
  items: [
    {
      finding_id: 'finding-1',
      finding_code: 'latest_index_generation_missing',
      entity_type: 'document_version',
      entity_id: 'version-1',
      repairable: true,
      status: 'planned',
      action: 'index_latest_document_version',
      requires_parse: false,
      requires_index: true,
      deletes_qdrant_points: false,
      cleans_journal: false,
      started_at: null,
      completed_at: null,
      safe_message: 'Repair would revalidate and execute the listed derived-state action.',
    },
  ],
  started_at: null,
  completed_at: null,
}

function mountView() {
  return mount(DataManagementView, {
    global: { provide: { shellKbName: ref('') } },
  })
}

async function chooseArchive(wrapper: ReturnType<typeof mountView>) {
  const input = wrapper.get('[data-testid="restore-file"]')
  const file = new File(['archive'], 'Backup.tracemind.zip', { type: 'application/zip' })
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
  return file
}

describe('DataManagementView', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    for (const mock of [
      mockedGetKnowledgeBase,
      mockedGetRebuild,
      mockedExport,
      mockedRestore,
      mockedAudit,
      mockedRepair,
      mockedStartRebuild,
      mockedRetryRebuild,
    ]) {
      mock.mockReset()
    }
    mockedGetKnowledgeBase.mockResolvedValue({
      id: 'kb-1',
      name: 'Research Notes',
      description: 'Local notes',
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-02T00:00:00Z',
    })
    mockedGetRebuild.mockResolvedValue(rebuildNotStarted)
    vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: vi.fn() }))
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
  })

  it('renders the real local-first maintenance boundary without dashboard metrics', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('数据与恢复')
    expect(wrapper.text()).toContain('Research Notes')
    expect(wrapper.text()).toContain('只读 · 不会修改数据')
    expect(wrapper.text()).toContain('恢复是 Workspace-level 能力')
    expect(wrapper.text()).not.toMatch(/CPU|GPU|RAM|Health Score|Cloud backup|Last backup/)
  })

  it('exports the current knowledge base with loading-safe archive service', async () => {
    mockedExport.mockResolvedValue({
      blob: new Blob(['archive']),
      filename: 'Research-Notes.tracemind.zip',
    })
    const createObjectURL = vi.fn(() => 'blob:archive')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="export-archive"]').trigger('click')
    await flushPromises()

    expect(mockedExport).toHaveBeenCalledWith('kb-1')
    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:archive')
  })

  it('shows export source-change errors without exposing raw exceptions', async () => {
    mockedExport.mockRejectedValue(new ApiError(409, 'internal source path changed'))
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="export-archive"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('源文件在导出期间发生变化')
    expect(wrapper.text()).not.toContain('internal source path changed')
  })

  it('shows selected restore file and the real restore-to-rebuild outcome', async () => {
    mockedRestore.mockResolvedValue(restoreResponse)
    const wrapper = mountView()
    await flushPromises()
    const file = await chooseArchive(wrapper)

    expect(wrapper.text()).toContain('Backup.tracemind.zip')
    expect(wrapper.text()).toContain('7 B')
    await wrapper.get('[data-testid="restore-archive"]').trigger('click')
    await flushPromises()

    expect(mockedRestore).toHaveBeenCalledWith(file)
    expect(wrapper.text()).toContain('Source of Truth 已恢复')
    expect(wrapper.text()).toContain('检索 Derived State 仍需重建')
    expect(wrapper.find('a[data-to="/knowledge-bases/restored-kb/chat"]').exists()).toBe(true)
  })

  it.each([
    [409, '归档与现有数据发生冲突'],
    [413, '归档超过当前安全限制'],
    [422, '不是有效的 TraceMind'],
  ])('maps restore HTTP %s to specific product copy', async (status, copy) => {
    mockedRestore.mockRejectedValue(new ApiError(status, 'raw restore detail'))
    const wrapper = mountView()
    await flushPromises()
    await chooseArchive(wrapper)
    await wrapper.get('[data-testid="restore-archive"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain(copy)
    expect(wrapper.text()).not.toContain('raw restore detail')
  })

  it('renders a healthy read-only audit without inventing a score', async () => {
    mockedAudit.mockResolvedValue({
      ...auditFinding,
      summary: { healthy: true, warning_count: 0, error_count: 0, critical_count: 0 },
      findings: [],
    })
    const wrapper = mountView()
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('运行检查'))!
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('正常')
    expect(wrapper.text()).not.toContain('%')
    expect(mockedAudit).toHaveBeenCalledWith('kb-1')
  })

  it('uses backend dry-run as repairability authority before executing derived-state repair', async () => {
    mockedAudit.mockResolvedValue(auditFinding)
    mockedRepair.mockResolvedValueOnce(repairPlan).mockResolvedValueOnce({
      ...repairPlan,
      operation_id: 'repair-1',
      dry_run: false,
      status: 'succeeded',
      items: repairPlan.items.map((item) => ({ ...item, status: 'succeeded' })),
    })
    const wrapper = mountView()
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('运行检查'))!
      .trigger('click')
    await flushPromises()
    await wrapper.get('input[aria-label="选择 latest_index_generation_missing"]').setValue(true)
    await wrapper.get('[data-testid="review-repair"]').trigger('click')
    await flushPromises()

    expect(mockedRepair.mock.calls[0]![1].dry_run).toBe(true)
    expect(wrapper.text()).toContain('index_latest_document_version')
    await wrapper.get('[data-testid="execute-repair"]').trigger('click')
    await flushPromises()

    expect(mockedRepair.mock.calls[1]![1]).toMatchObject({
      dry_run: false,
      finding_ids: ['finding-1'],
    })
    expect(wrapper.text()).toContain('已完成')
  })

  it('keeps global audit findings read-only in a knowledge-base repair flow', async () => {
    mockedAudit.mockResolvedValue({
      ...auditFinding,
      findings: [
        ...auditFinding.findings,
        {
          ...auditFinding.findings[0]!,
          finding_id: 'global-finding',
          code: 'qdrant_audit_unavailable',
          entity_type: 'qdrant',
          entity_id: 'collection',
          knowledge_base_id: null,
        },
      ],
    })
    const wrapper = mountView()
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('运行检查'))!
      .trigger('click')
    await flushPromises()

    expect(
      wrapper.get('input[aria-label="选择 qdrant_audit_unavailable"]').attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.text()).toContain('全局 / 只读问题')
  })

  it('does not enable execution when backend dry-run marks a finding not repairable', async () => {
    mockedAudit.mockResolvedValue(auditFinding)
    mockedRepair.mockResolvedValue({
      ...repairPlan,
      items: repairPlan.items.map((item) => ({
        ...item,
        repairable: false,
        status: 'not_repairable',
        action: 'manual_review',
      })),
    })
    const wrapper = mountView()
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('运行检查'))!
      .trigger('click')
    await flushPromises()
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await wrapper.get('[data-testid="review-repair"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="execute-repair"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('manual_review')
  })

  it('starts current rebuild and exposes only real backend count fields', async () => {
    mockedStartRebuild.mockResolvedValue({
      ...rebuildNotStarted,
      operation_id: 'rebuild-1',
      status: 'succeeded',
      document_versions_total: 3,
      document_versions_parsed: 3,
      documents_total: 2,
      documents_indexed: 2,
      knowledge_entries_total: 1,
      knowledge_entries_indexed: 1,
      started_at: '2026-08-26T02:00:00Z',
      completed_at: '2026-08-26T02:01:00Z',
    })
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="start-rebuild"]').trigger('click')
    await flushPromises()

    expect(mockedStartRebuild).toHaveBeenCalledWith('kb-1')
    expect(wrapper.text()).toContain('已解析文档版本')
    expect(wrapper.text()).toContain('3 / 3')
    expect(wrapper.text()).not.toContain('Embedding 70%')
  })

  it('offers retry only for a failed latest rebuild', async () => {
    mockedGetRebuild.mockResolvedValue({
      ...rebuildNotStarted,
      operation_id: 'rebuild-1',
      status: 'failed',
      error_code: 'queue_unavailable',
      error_message: 'Derived-state rebuild could not be queued',
    })
    mockedRetryRebuild.mockResolvedValue({
      ...rebuildNotStarted,
      operation_id: 'rebuild-1',
      status: 'succeeded',
    })
    const wrapper = mountView()
    await flushPromises()

    const retry = wrapper.findAll('button').find((button) => button.text().includes('重试重建'))!
    await retry.trigger('click')
    await flushPromises()

    expect(mockedRetryRebuild).toHaveBeenCalledWith('kb-1')
  })

  it('defines single-column mobile recovery layout without horizontal overflow primitives', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8')
    const phase = css.slice(css.indexOf('/* Phase 2.6'))

    expect(phase).toContain('@media (max-width: 48rem)')
    expect(phase).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(phase).not.toContain('width: 100vw')
    expect(css).toContain('overflow-x: clip')
  })
})
