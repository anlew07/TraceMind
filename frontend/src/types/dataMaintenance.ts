export interface ArchiveEntityCounts {
  knowledge_bases: 1
  documents: number
  document_versions: number
  conversations: number
  messages: number
  knowledge_entries: number
}

export interface KnowledgeBaseArchiveRestoreResponse {
  knowledge_base_id: string
  archive_id: string
  entity_counts: ArchiveEntityCounts
  restore_status: 'succeeded'
  rebuild_status: 'not_started'
}

export type AuditSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'

export interface ConsistencyAuditFinding {
  finding_id: string
  code: string
  severity: AuditSeverity
  entity_type: string
  entity_id: string
  knowledge_base_id: string | null
  safe_message: string
  details: Record<string, string | number | boolean | null>
}

export interface ConsistencyAuditResponse {
  audit_id: string
  scope: 'knowledge_base' | 'global'
  status: 'completed' | 'partial'
  knowledge_base_id: string | null
  started_at: string
  completed_at: string
  summary: {
    healthy: boolean
    warning_count: number
    error_count: number
    critical_count: number
  }
  findings: ConsistencyAuditFinding[]
}

export type RepairItemStatus =
  | 'pending'
  | 'running'
  | 'planned'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'not_repairable'
  | 'verification_failed'

export type RepairOperationStatus =
  | 'planned'
  | 'queued'
  | 'running'
  | 'partially_failed'
  | 'failed'
  | 'succeeded'

export interface ConsistencyRepairItem {
  finding_id: string
  finding_code: string
  entity_type: string
  entity_id: string
  repairable: boolean
  status: RepairItemStatus
  action: string
  requires_parse: boolean
  requires_index: boolean
  deletes_qdrant_points: boolean
  cleans_journal: boolean
  started_at: string | null
  completed_at: string | null
  safe_message: string
}

export interface ConsistencyRepairResponse {
  knowledge_base_id: string
  audit_id: string
  operation_id: string | null
  dry_run: boolean
  status: RepairOperationStatus
  items: ConsistencyRepairItem[]
  started_at: string | null
  completed_at: string | null
}

export interface ConsistencyRepairRequest {
  audit_id: string
  knowledge_base_id: string
  finding_ids: string[]
  dry_run: boolean
}

export type RebuildStatus =
  | 'not_started'
  | 'queued'
  | 'running'
  | 'partially_failed'
  | 'failed'
  | 'succeeded'

export interface KnowledgeBaseRebuildResponse {
  knowledge_base_id: string
  operation_id: string | null
  status: RebuildStatus
  document_versions_total: number
  document_versions_parsed: number
  document_versions_failed: number
  documents_total: number
  documents_indexed: number
  documents_failed: number
  knowledge_entries_total: number
  knowledge_entries_indexed: number
  knowledge_entries_failed: number
  started_at: string | null
  completed_at: string | null
  error_code: string | null
  error_message: string | null
}

export interface ArchiveDownload {
  blob: Blob
  filename: string
}
