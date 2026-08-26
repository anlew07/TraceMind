import { ApiError, apiRequest, apiUrl } from './api'
import type {
  ArchiveDownload,
  ConsistencyAuditResponse,
  ConsistencyRepairRequest,
  ConsistencyRepairResponse,
  KnowledgeBaseArchiveRestoreResponse,
  KnowledgeBaseRebuildResponse,
} from '@/types/dataMaintenance'

function archiveFilename(disposition: string | null): string {
  if (!disposition) return 'knowledge-base.tracemind.zip'
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (utf8) {
    try {
      return decodeURIComponent(utf8)
    } catch {
      return utf8
    }
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'knowledge-base.tracemind.zip'
}

async function responseError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as { detail?: string } | null
  return new ApiError(response.status, body?.detail ?? '请求失败，请稍后重试')
}

export async function exportKnowledgeBaseArchive(
  knowledgeBaseId: string,
): Promise<ArchiveDownload> {
  const response = await fetch(apiUrl(`/api/v1/knowledge-bases/${knowledgeBaseId}/archive`), {
    headers: { Accept: 'application/zip' },
  })
  if (!response.ok) throw await responseError(response)
  return {
    blob: await response.blob(),
    filename: archiveFilename(response.headers.get('Content-Disposition')),
  }
}

export function restoreKnowledgeBaseArchive(
  file: File,
): Promise<KnowledgeBaseArchiveRestoreResponse> {
  const body = new FormData()
  body.append('file', file)
  return apiRequest('/api/v1/knowledge-base-archives/restore', { method: 'POST', body })
}

export function runConsistencyAudit(knowledgeBaseId: string): Promise<ConsistencyAuditResponse> {
  return apiRequest(`/api/v1/knowledge-bases/${knowledgeBaseId}/consistency-audit`, {
    method: 'POST',
  })
}

export function startConsistencyRepair(
  knowledgeBaseId: string,
  request: ConsistencyRepairRequest,
): Promise<ConsistencyRepairResponse> {
  return apiRequest(`/api/v1/knowledge-bases/${knowledgeBaseId}/consistency-repair`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export function getConsistencyRepair(
  knowledgeBaseId: string,
  operationId: string,
): Promise<ConsistencyRepairResponse> {
  return apiRequest(`/api/v1/knowledge-bases/${knowledgeBaseId}/consistency-repair/${operationId}`)
}

export function retryConsistencyRepair(
  knowledgeBaseId: string,
  operationId: string,
): Promise<ConsistencyRepairResponse> {
  return apiRequest(
    `/api/v1/knowledge-bases/${knowledgeBaseId}/consistency-repair/${operationId}/retry`,
    { method: 'POST' },
  )
}

export function getKnowledgeBaseRebuild(
  knowledgeBaseId: string,
): Promise<KnowledgeBaseRebuildResponse> {
  return apiRequest(`/api/v1/knowledge-bases/${knowledgeBaseId}/rebuild`)
}

export function startKnowledgeBaseRebuild(
  knowledgeBaseId: string,
): Promise<KnowledgeBaseRebuildResponse> {
  return apiRequest(`/api/v1/knowledge-bases/${knowledgeBaseId}/rebuild`, { method: 'POST' })
}

export function retryKnowledgeBaseRebuild(
  knowledgeBaseId: string,
): Promise<KnowledgeBaseRebuildResponse> {
  return apiRequest(`/api/v1/knowledge-bases/${knowledgeBaseId}/rebuild/retry`, {
    method: 'POST',
  })
}
