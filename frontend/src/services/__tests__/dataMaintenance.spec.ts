import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  exportKnowledgeBaseArchive,
  getConsistencyRepair,
  getKnowledgeBaseRebuild,
  restoreKnowledgeBaseArchive,
  retryConsistencyRepair,
  retryKnowledgeBaseRebuild,
  runConsistencyAudit,
  startConsistencyRepair,
  startKnowledgeBaseRebuild,
} from '@/services/dataMaintenance'

const fetchMock = vi.fn<typeof fetch>()
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

function expectedApiUrl(path: string): string {
  return `${apiBaseUrl}${path}`
}

describe('dataMaintenance service', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('downloads the real archive response and preserves Content-Disposition filename', async () => {
    fetchMock.mockResolvedValue(
      new Response('archive', {
        status: 200,
        headers: { 'Content-Disposition': `attachment; filename*=UTF-8''Project.tracemind.zip` },
      }),
    )

    const result = await exportKnowledgeBaseArchive('kb-1')

    expect(fetchMock).toHaveBeenCalledWith(
      expectedApiUrl('/api/v1/knowledge-bases/kb-1/archive'),
      {
        headers: { Accept: 'application/zip' },
      },
    )
    expect(result.filename).toBe('Project.tracemind.zip')
    expect(await result.blob.text()).toBe('archive')
  })

  it('uploads restore archive as FormData without binding it to a knowledge base', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        {
          knowledge_base_id: 'restored-kb',
          archive_id: 'archive-1',
          entity_counts: {
            knowledge_bases: 1,
            documents: 1,
            document_versions: 1,
            conversations: 0,
            messages: 0,
            knowledge_entries: 0,
          },
          restore_status: 'succeeded',
          rebuild_status: 'not_started',
        },
        { status: 201 },
      ),
    )

    await restoreKnowledgeBaseArchive(new File(['archive'], 'Project.tracemind.zip'))

    const [path, init] = fetchMock.mock.calls[0]!
    expect(path).toBe(expectedApiUrl('/api/v1/knowledge-base-archives/restore'))
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeInstanceOf(FormData)
    expect((init?.body as FormData).get('file')).toBeInstanceOf(File)
  })

  it('uses the exact audit, dry-run repair, status and retry routes', async () => {
    fetchMock.mockResolvedValue(Response.json({ status: 'ok' }))
    const request = {
      audit_id: 'audit-1',
      knowledge_base_id: 'kb-1',
      finding_ids: ['finding-1'],
      dry_run: true,
    }

    await runConsistencyAudit('kb-1')
    await startConsistencyRepair('kb-1', request)
    await getConsistencyRepair('kb-1', 'repair-1')
    await retryConsistencyRepair('kb-1', 'repair-1')

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      expectedApiUrl('/api/v1/knowledge-bases/kb-1/consistency-audit'),
      expectedApiUrl('/api/v1/knowledge-bases/kb-1/consistency-repair'),
      expectedApiUrl('/api/v1/knowledge-bases/kb-1/consistency-repair/repair-1'),
      expectedApiUrl('/api/v1/knowledge-bases/kb-1/consistency-repair/repair-1/retry'),
    ])
    expect(fetchMock.mock.calls[1]![1]?.body).toBe(JSON.stringify(request))
    expect(fetchMock.mock.calls[3]![1]?.method).toBe('POST')
  })

  it('uses the latest rebuild endpoint for read, start and retry', async () => {
    fetchMock.mockResolvedValue(Response.json({ status: 'not_started' }))

    await getKnowledgeBaseRebuild('kb-1')
    await startKnowledgeBaseRebuild('kb-1')
    await retryKnowledgeBaseRebuild('kb-1')

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      expectedApiUrl('/api/v1/knowledge-bases/kb-1/rebuild'),
      expectedApiUrl('/api/v1/knowledge-bases/kb-1/rebuild'),
      expectedApiUrl('/api/v1/knowledge-bases/kb-1/rebuild/retry'),
    ])
    expect(fetchMock.mock.calls[0]![1]?.method).toBeUndefined()
    expect(fetchMock.mock.calls[1]![1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[2]![1]?.method).toBe('POST')
  })
})
