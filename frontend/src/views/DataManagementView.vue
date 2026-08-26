<script setup lang="ts">
import { ElAlert, ElButton, ElMessage, ElMessageBox } from 'element-plus'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { ApiError } from '@/services/api'
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
import { getKnowledgeBase } from '@/services/knowledgeBases'
import type {
  AuditSeverity,
  ConsistencyAuditResponse,
  ConsistencyRepairResponse,
  KnowledgeBaseArchiveRestoreResponse,
  KnowledgeBaseRebuildResponse,
  RepairOperationStatus,
  RebuildStatus,
} from '@/types/dataMaintenance'
import type { KnowledgeBase } from '@/types/knowledgeBase'

const route = useRoute()
const knowledgeBaseId = String(route.params.knowledgeBaseId)
const knowledgeBase = ref<KnowledgeBase | null>(null)
const shellKbName = inject<Ref<string>>('shellKbName', ref(''))

const loading = ref(true)
const pageError = ref('')
const exporting = ref(false)
const exportError = ref('')
const restoreFile = ref<File | null>(null)
const restoring = ref(false)
const restoreError = ref('')
const restoreResult = ref<KnowledgeBaseArchiveRestoreResponse | null>(null)

const auditing = ref(false)
const auditError = ref('')
const audit = ref<ConsistencyAuditResponse | null>(null)
const selectedFindingIds = ref<string[]>([])
const planningRepair = ref(false)
const executingRepair = ref(false)
const repairError = ref('')
const repairPlan = ref<ConsistencyRepairResponse | null>(null)
const repairOperation = ref<ConsistencyRepairResponse | null>(null)

const rebuild = ref<KnowledgeBaseRebuildResponse | null>(null)
const rebuildBusy = ref(false)
const rebuildError = ref('')
const restoredRebuild = ref<KnowledgeBaseRebuildResponse | null>(null)
const restoredRebuildBusy = ref(false)
const restoredRebuildError = ref('')

let repairPollTimer: ReturnType<typeof setTimeout> | undefined
let rebuildPollTimer: ReturnType<typeof setTimeout> | undefined
let restoredRebuildPollTimer: ReturnType<typeof setTimeout> | undefined

watch(knowledgeBase, (value) => {
  shellKbName.value = value?.name ?? ''
})

const executableFindingIds = computed(
  () =>
    repairPlan.value?.items
      .filter((item) => item.repairable && item.status === 'planned')
      .map((item) => item.finding_id) ?? [],
)

const hasRepairablePlan = computed(() => executableFindingIds.value.length > 0)

const currentMaintenanceLabel = computed(() => {
  if (repairOperation.value)
    return `Safe Repair · ${repairStatusLabel(repairOperation.value.status)}`
  if (audit.value) {
    return audit.value.summary.healthy
      ? 'Consistency · Healthy'
      : `Consistency · ${audit.value.findings.length} findings`
  }
  if (rebuild.value && rebuild.value.status !== 'not_started') {
    return `Derived State · ${rebuildStatusLabel(rebuild.value.status)}`
  }
  return '尚未运行维护操作'
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function apiMessage(error: unknown, action: 'export' | 'restore' | 'audit' | 'repair' | 'rebuild') {
  if (!(error instanceof ApiError)) {
    return action === 'audit'
      ? '一致性检查未完成，请检查后端服务后重试。'
      : '操作未完成，请稍后重试。'
  }
  if (action === 'restore') {
    if (error.status === 409) return '归档与现有数据发生冲突。请保留现有数据，并改用不冲突的归档。'
    if (error.status === 413) return '归档超过当前安全限制，未执行恢复。'
    if (error.status === 422) return '这不是有效的 TraceMind .tracemind.zip 归档。'
    return 'Source of Truth 未能恢复；现有数据保持不变，请稍后重试。'
  }
  if (action === 'export') {
    if (error.status === 409) return '源文件在导出期间发生变化。请等待文件稳定后重试。'
    if (error.status === 413) return '当前知识库超过归档安全限制，未生成备份。'
    if (error.status === 404) return '当前知识库不存在，无法导出。'
    return '备份未能生成，请确认本地存储与后端服务可用。'
  }
  if (error.status === 409) return '当前已有维护操作，或所选状态已经变化。请刷新后重试。'
  if (error.status === 404) return '维护对象不存在，请返回 Workspace 确认知识库状态。'
  return `${action === 'audit' ? '一致性检查' : action === 'repair' ? '安全修复' : '派生状态重建'}未完成，请稍后重试。`
}

function repairStatusLabel(status: RepairOperationStatus): string {
  return {
    planned: 'Review ready',
    queued: 'Queued',
    running: 'Running',
    partially_failed: 'Partially failed',
    failed: 'Failed',
    succeeded: 'Completed',
  }[status]
}

function rebuildStatusLabel(status: RebuildStatus): string {
  return {
    not_started: 'Not started',
    queued: 'Queued',
    running: 'Running',
    partially_failed: 'Partially failed',
    failed: 'Failed',
    succeeded: 'Completed',
  }[status]
}

function severityLabel(severity: AuditSeverity): string {
  return { INFO: 'Info', WARNING: 'Warning', ERROR: 'Error', CRITICAL: 'Critical' }[severity]
}

function statusTone(status: RepairOperationStatus | RebuildStatus): string {
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'partially_failed') return 'error'
  if (status === 'queued' || status === 'running') return 'active'
  return 'quiet'
}

function rebuildRows(value: KnowledgeBaseRebuildResponse | null) {
  if (!value) return []
  return [
    {
      label: 'Document versions parsed',
      completed: value.document_versions_parsed,
      failed: value.document_versions_failed,
      total: value.document_versions_total,
    },
    {
      label: 'Documents indexed',
      completed: value.documents_indexed,
      failed: value.documents_failed,
      total: value.documents_total,
    },
    {
      label: 'Knowledge entries indexed',
      completed: value.knowledge_entries_indexed,
      failed: value.knowledge_entries_failed,
      total: value.knowledge_entries_total,
    },
  ]
}

async function loadPage(): Promise<void> {
  loading.value = true
  pageError.value = ''
  try {
    const [kb, rebuildStatus] = await Promise.all([
      getKnowledgeBase(knowledgeBaseId),
      getKnowledgeBaseRebuild(knowledgeBaseId),
    ])
    knowledgeBase.value = kb
    rebuild.value = rebuildStatus
    scheduleRebuildPoll(rebuildStatus)
  } catch (error) {
    pageError.value = apiMessage(error, 'rebuild')
  } finally {
    loading.value = false
  }
}

async function exportArchive(): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  exportError.value = ''
  try {
    const archive = await exportKnowledgeBaseArchive(knowledgeBaseId)
    const href = URL.createObjectURL(archive.blob)
    const link = document.createElement('a')
    link.href = href
    link.download = archive.filename
    link.style.display = 'none'
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(href)
    ElMessage.success('备份已开始下载')
  } catch (error) {
    exportError.value = apiMessage(error, 'export')
  } finally {
    exporting.value = false
  }
}

function selectRestoreFile(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  restoreResult.value = null
  restoredRebuild.value = null
  restoredRebuildError.value = ''
  restoreError.value = ''
  restoreFile.value = file
  if (file && !file.name.toLowerCase().endsWith('.tracemind.zip')) {
    restoreError.value = '请选择 .tracemind.zip 归档文件。'
  }
}

async function restoreArchive(): Promise<void> {
  if (!restoreFile.value || restoring.value || restoreError.value) return
  try {
    await ElMessageBox.confirm(
      `将从“${restoreFile.value.name}”恢复 Source of Truth。恢复后仍需单独重建检索派生状态。`,
      '确认恢复归档',
      { confirmButtonText: '恢复 Source of Truth', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  restoring.value = true
  restoreError.value = ''
  try {
    restoreResult.value = await restoreKnowledgeBaseArchive(restoreFile.value)
    ElMessage.success('Source of Truth 已恢复')
  } catch (error) {
    restoreError.value = apiMessage(error, 'restore')
  } finally {
    restoring.value = false
  }
}

function toggleFinding(findingId: string): void {
  selectedFindingIds.value = selectedFindingIds.value.includes(findingId)
    ? selectedFindingIds.value.filter((id) => id !== findingId)
    : [...selectedFindingIds.value, findingId]
  repairPlan.value = null
  repairError.value = ''
}

async function auditConsistency(): Promise<void> {
  if (auditing.value) return
  auditing.value = true
  auditError.value = ''
  repairError.value = ''
  repairPlan.value = null
  repairOperation.value = null
  selectedFindingIds.value = []
  clearTimeout(repairPollTimer)
  try {
    audit.value = await runConsistencyAudit(knowledgeBaseId)
  } catch (error) {
    auditError.value = apiMessage(error, 'audit')
  } finally {
    auditing.value = false
  }
}

async function reviewSafeRepair(): Promise<void> {
  if (!audit.value || selectedFindingIds.value.length === 0 || planningRepair.value) return
  planningRepair.value = true
  repairError.value = ''
  try {
    repairPlan.value = await startConsistencyRepair(knowledgeBaseId, {
      audit_id: audit.value.audit_id,
      knowledge_base_id: knowledgeBaseId,
      finding_ids: selectedFindingIds.value,
      dry_run: true,
    })
  } catch (error) {
    repairError.value = apiMessage(error, 'repair')
  } finally {
    planningRepair.value = false
  }
}

async function executeSafeRepair(): Promise<void> {
  if (!audit.value || !hasRepairablePlan.value || executingRepair.value) return
  try {
    await ElMessageBox.confirm(
      `后端已确认 ${executableFindingIds.value.length} 项派生状态可安全修复。不会修改 Source of Truth。`,
      '开始安全修复',
      { confirmButtonText: '开始安全修复', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  executingRepair.value = true
  repairError.value = ''
  try {
    const operation = await startConsistencyRepair(knowledgeBaseId, {
      audit_id: audit.value.audit_id,
      knowledge_base_id: knowledgeBaseId,
      finding_ids: executableFindingIds.value,
      dry_run: false,
    })
    repairOperation.value = operation
    scheduleRepairPoll(operation)
  } catch (error) {
    repairError.value = apiMessage(error, 'repair')
  } finally {
    executingRepair.value = false
  }
}

function scheduleRepairPoll(operation: ConsistencyRepairResponse): void {
  clearTimeout(repairPollTimer)
  if (!operation.operation_id || !['queued', 'running'].includes(operation.status)) return
  repairPollTimer = setTimeout(() => void refreshRepair(operation.operation_id as string), 3000)
}

async function refreshRepair(operationId: string): Promise<void> {
  try {
    const operation = await getConsistencyRepair(knowledgeBaseId, operationId)
    repairOperation.value = operation
    scheduleRepairPoll(operation)
  } catch (error) {
    repairError.value = apiMessage(error, 'repair')
  }
}

async function retryRepair(): Promise<void> {
  const operationId = repairOperation.value?.operation_id
  if (!operationId || executingRepair.value) return
  executingRepair.value = true
  repairError.value = ''
  try {
    const operation = await retryConsistencyRepair(knowledgeBaseId, operationId)
    repairOperation.value = operation
    scheduleRepairPoll(operation)
  } catch (error) {
    repairError.value = apiMessage(error, 'repair')
  } finally {
    executingRepair.value = false
  }
}

function scheduleRebuildPoll(value: KnowledgeBaseRebuildResponse): void {
  clearTimeout(rebuildPollTimer)
  if (!['queued', 'running'].includes(value.status)) return
  rebuildPollTimer = setTimeout(() => void refreshRebuild(), 3000)
}

async function refreshRebuild(): Promise<void> {
  try {
    const value = await getKnowledgeBaseRebuild(knowledgeBaseId)
    rebuild.value = value
    scheduleRebuildPoll(value)
  } catch (error) {
    rebuildError.value = apiMessage(error, 'rebuild')
  }
}

async function startRebuild(): Promise<void> {
  if (rebuildBusy.value) return
  try {
    await ElMessageBox.confirm(
      '将从当前 Source of Truth 重新生成解析结果和检索索引。现有源数据不会被替换。',
      '开始重建派生状态',
      { confirmButtonText: '开始重建', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  rebuildBusy.value = true
  rebuildError.value = ''
  try {
    const value = await startKnowledgeBaseRebuild(knowledgeBaseId)
    rebuild.value = value
    scheduleRebuildPoll(value)
  } catch (error) {
    rebuildError.value = apiMessage(error, 'rebuild')
  } finally {
    rebuildBusy.value = false
  }
}

async function retryRebuild(): Promise<void> {
  if (rebuildBusy.value) return
  rebuildBusy.value = true
  rebuildError.value = ''
  try {
    const value = await retryKnowledgeBaseRebuild(knowledgeBaseId)
    rebuild.value = value
    scheduleRebuildPoll(value)
  } catch (error) {
    rebuildError.value = apiMessage(error, 'rebuild')
  } finally {
    rebuildBusy.value = false
  }
}

function scheduleRestoredRebuildPoll(value: KnowledgeBaseRebuildResponse): void {
  clearTimeout(restoredRebuildPollTimer)
  if (!['queued', 'running'].includes(value.status)) return
  restoredRebuildPollTimer = setTimeout(() => void refreshRestoredRebuild(), 3000)
}

async function refreshRestoredRebuild(): Promise<void> {
  if (!restoreResult.value) return
  try {
    const value = await getKnowledgeBaseRebuild(restoreResult.value.knowledge_base_id)
    restoredRebuild.value = value
    scheduleRestoredRebuildPoll(value)
  } catch (error) {
    restoredRebuildError.value = apiMessage(error, 'rebuild')
  }
}

async function startRestoredRebuild(): Promise<void> {
  if (!restoreResult.value || restoredRebuildBusy.value) return
  try {
    await ElMessageBox.confirm(
      '将从刚恢复的 Source of Truth 生成 parsed chunks 和 retrieval indexes。',
      '开始恢复检索状态',
      { confirmButtonText: '开始重建', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  restoredRebuildBusy.value = true
  restoredRebuildError.value = ''
  try {
    const value = await startKnowledgeBaseRebuild(restoreResult.value.knowledge_base_id)
    restoredRebuild.value = value
    scheduleRestoredRebuildPoll(value)
  } catch (error) {
    restoredRebuildError.value = apiMessage(error, 'rebuild')
  } finally {
    restoredRebuildBusy.value = false
  }
}

onMounted(loadPage)
onBeforeUnmount(() => {
  clearTimeout(repairPollTimer)
  clearTimeout(rebuildPollTimer)
  clearTimeout(restoredRebuildPollTimer)
})
</script>

<template>
  <main class="data-management-page">
    <div v-if="loading" class="data-management-page-state" role="status">
      正在读取本地数据维护状态…
    </div>
    <div v-else-if="pageError" class="data-management-page-state is-error" role="alert">
      <p>{{ pageError }}</p>
      <ElButton @click="loadPage">重试</ElButton>
    </div>
    <div v-else class="data-management-layout">
      <div class="data-management-main">
        <header class="data-management-header">
          <div>
            <RouterLink to="/" class="data-management-back">← Workspace</RouterLink>
            <h1>Data &amp; Recovery</h1>
            <p>保护本地知识资产，并维护可以从 Source of Truth 重建的检索状态。</p>
          </div>
          <div class="data-management-context">
            <span>Current Knowledge Base</span>
            <strong>{{ knowledgeBase?.name }}</strong>
          </div>
        </header>

        <section class="maintenance-section" aria-labelledby="backup-restore-heading">
          <div class="maintenance-section-heading">
            <div>
              <h2 id="backup-restore-heading">Backup &amp; Restore</h2>
              <p>归档保存 Source of Truth；恢复不会自动建立派生检索状态。</p>
            </div>
          </div>

          <div class="archive-workflows">
            <article class="maintenance-task">
              <div class="maintenance-task-copy">
                <h3>Export Archive</h3>
                <p>保存当前 Knowledge Base 的完整本地归档。</p>
              </div>
              <dl class="maintenance-facts">
                <div>
                  <dt>Knowledge Base</dt>
                  <dd>{{ knowledgeBase?.name }}</dd>
                </div>
                <div>
                  <dt>Archive format</dt>
                  <dd class="technical-value">.tracemind.zip</dd>
                </div>
              </dl>
              <ElAlert
                v-if="exportError"
                :title="exportError"
                type="error"
                :closable="false"
                show-icon
              />
              <ElButton
                type="primary"
                data-testid="export-archive"
                :loading="exporting"
                @click="exportArchive"
              >
                {{ exporting ? '正在生成备份…' : '导出备份' }}
              </ElButton>
            </article>

            <article class="maintenance-task restore-task">
              <div class="maintenance-task-copy">
                <span class="maintenance-scope-label">Workspace-level restore</span>
                <h3>Restore Knowledge Base</h3>
                <p>从 TraceMind archive 恢复新的 Knowledge Base Source of Truth。</p>
              </div>
              <label class="archive-file-picker" :class="{ 'has-file': restoreFile }">
                <input
                  type="file"
                  accept=".zip,.tracemind.zip,application/zip"
                  data-testid="restore-file"
                  @change="selectRestoreFile"
                />
                <span>{{ restoreFile ? '更换归档' : '选择 .tracemind.zip' }}</span>
              </label>
              <dl v-if="restoreFile" class="maintenance-facts selected-file-facts">
                <div>
                  <dt>File name</dt>
                  <dd>{{ restoreFile.name }}</dd>
                </div>
                <div>
                  <dt>File size</dt>
                  <dd>{{ formatBytes(restoreFile.size) }}</dd>
                </div>
              </dl>
              <ElAlert
                v-if="restoreError"
                :title="restoreError"
                type="error"
                :closable="false"
                show-icon
              />
              <ElButton
                data-testid="restore-archive"
                :disabled="!restoreFile || Boolean(restoreError)"
                :loading="restoring"
                @click="restoreArchive"
              >
                {{ restoring ? '正在恢复…' : 'Restore' }}
              </ElButton>

              <div v-if="restoreResult" class="restore-outcome" role="status">
                <div class="maintenance-status is-warning">
                  <span class="maintenance-status-dot" aria-hidden="true"></span>
                  <strong>Source data restored</strong>
                </div>
                <p>Retrieval derived state still needs rebuild.</p>
                <dl class="maintenance-facts compact">
                  <div>
                    <dt>Documents</dt>
                    <dd>{{ restoreResult.entity_counts.documents }}</dd>
                  </div>
                  <div>
                    <dt>Conversations</dt>
                    <dd>{{ restoreResult.entity_counts.conversations }}</dd>
                  </div>
                  <div>
                    <dt>Knowledge</dt>
                    <dd>{{ restoreResult.entity_counts.knowledge_entries }}</dd>
                  </div>
                </dl>
                <ElAlert
                  v-if="restoredRebuildError"
                  :title="restoredRebuildError"
                  type="error"
                  :closable="false"
                  show-icon
                />
                <div class="maintenance-actions">
                  <ElButton
                    v-if="!restoredRebuild || restoredRebuild.status === 'not_started'"
                    type="primary"
                    :loading="restoredRebuildBusy"
                    @click="startRestoredRebuild"
                  >
                    开始重建
                  </ElButton>
                  <RouterLink
                    :to="`/knowledge-bases/${restoreResult.knowledge_base_id}/data-management`"
                    class="maintenance-text-link"
                  >
                    打开数据恢复状态
                  </RouterLink>
                  <RouterLink
                    :to="`/knowledge-bases/${restoreResult.knowledge_base_id}/chat`"
                    class="maintenance-text-link"
                  >
                    打开恢复的知识库
                  </RouterLink>
                </div>
                <div
                  v-if="restoredRebuild"
                  class="operation-summary"
                  :class="`is-${statusTone(restoredRebuild.status)}`"
                >
                  <strong>{{ rebuildStatusLabel(restoredRebuild.status) }}</strong>
                  <span>重建状态由恢复后的知识库返回</span>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section class="maintenance-section" aria-labelledby="consistency-heading">
          <div class="maintenance-section-heading with-action">
            <div>
              <h2 id="consistency-heading">Consistency</h2>
              <p>检查数据库 Source of Truth、原始文件、Chunks 与检索索引之间的一致性。</p>
              <span class="read-only-note"
                ><span aria-hidden="true">✓</span> Read-only · 不会修改数据</span
              >
            </div>
            <ElButton :loading="auditing" @click="auditConsistency">
              {{ auditing ? '正在检查…' : '运行检查' }}
            </ElButton>
          </div>

          <ElAlert v-if="auditError" :title="auditError" type="error" :closable="false" show-icon />

          <div v-if="audit" class="audit-report" aria-live="polite">
            <div class="audit-summary">
              <div
                class="maintenance-status"
                :class="audit.summary.healthy ? 'is-success' : 'is-warning'"
              >
                <span class="maintenance-status-dot" aria-hidden="true"></span>
                <strong>{{
                  audit.summary.healthy
                    ? audit.findings.length
                      ? `Healthy · ${audit.findings.length} findings`
                      : 'Healthy'
                    : `${audit.findings.length} findings`
                }}</strong>
              </div>
              <span>{{ audit.status === 'partial' ? 'Partial audit' : 'Completed audit' }}</span>
              <time :datetime="audit.completed_at">{{ formatDate(audit.completed_at) }}</time>
            </div>

            <p v-if="audit.findings.length === 0" class="maintenance-empty-result">
              未发现 consistency finding。
            </p>

            <div v-if="audit.findings.length" class="finding-ledger">
              <article
                v-for="finding in audit.findings"
                :key="finding.finding_id"
                class="finding-row"
              >
                <label class="finding-select">
                  <input
                    type="checkbox"
                    :checked="selectedFindingIds.includes(finding.finding_id)"
                    :disabled="finding.knowledge_base_id !== knowledgeBaseId"
                    :aria-label="`选择 ${finding.code}`"
                    @change="toggleFinding(finding.finding_id)"
                  />
                </label>
                <div class="finding-copy">
                  <div class="finding-heading">
                    <strong>{{ finding.safe_message }}</strong>
                    <span :class="`severity-${finding.severity.toLowerCase()}`">
                      {{ severityLabel(finding.severity) }}
                    </span>
                  </div>
                  <div class="finding-identity">
                    <code>{{ finding.code }}</code>
                    <span>{{ finding.entity_type }}</span>
                    <code>{{ finding.entity_id }}</code>
                    <span v-if="finding.knowledge_base_id !== knowledgeBaseId">
                      Global / read-only finding
                    </span>
                  </div>
                  <details v-if="Object.keys(finding.details).length" class="maintenance-detail">
                    <summary>Finding detail</summary>
                    <dl class="maintenance-facts compact">
                      <div v-for="(value, key) in finding.details" :key="key">
                        <dt>{{ key }}</dt>
                        <dd>{{ value ?? '—' }}</dd>
                      </div>
                    </dl>
                  </details>
                </div>
              </article>

              <div class="repair-review-actions">
                <span>{{ selectedFindingIds.length }} selected</span>
                <ElButton
                  data-testid="review-repair"
                  :disabled="selectedFindingIds.length === 0"
                  :loading="planningRepair"
                  @click="reviewSafeRepair"
                >
                  Review Safe Repair
                </ElButton>
              </div>
            </div>

            <ElAlert
              v-if="repairError"
              :title="repairError"
              type="error"
              :closable="false"
              show-icon
            />

            <div v-if="repairPlan" class="repair-plan">
              <div class="repair-plan-heading">
                <div>
                  <h3>Safe Repair Review</h3>
                  <p>修复资格和动作来自后端 dry-run；仅执行 planned + repairable 项。</p>
                </div>
                <span class="maintenance-scope-label">Only derived state</span>
              </div>
              <div class="repair-item-ledger">
                <div
                  v-for="item in repairPlan.items"
                  :key="item.finding_id"
                  class="repair-item-row"
                >
                  <span
                    class="maintenance-status"
                    :class="item.repairable ? 'is-success' : 'is-warning'"
                  >
                    <span class="maintenance-status-dot" aria-hidden="true"></span>
                    {{ item.status }}
                  </span>
                  <code>{{ item.action }}</code>
                  <span>{{ item.safe_message }}</span>
                </div>
              </div>
              <div class="repair-review-actions">
                <span>{{ executableFindingIds.length }} safe action(s)</span>
                <ElButton
                  type="primary"
                  data-testid="execute-repair"
                  :disabled="!hasRepairablePlan"
                  :loading="executingRepair"
                  @click="executeSafeRepair"
                >
                  开始安全修复
                </ElButton>
              </div>
            </div>

            <div v-if="repairOperation" class="operation-panel">
              <div class="operation-heading">
                <div class="maintenance-status" :class="`is-${statusTone(repairOperation.status)}`">
                  <span class="maintenance-status-dot" aria-hidden="true"></span>
                  <strong>{{ repairStatusLabel(repairOperation.status) }}</strong>
                </div>
                <ElButton
                  v-if="['failed', 'partially_failed'].includes(repairOperation.status)"
                  :loading="executingRepair"
                  @click="retryRepair"
                  >重试安全修复</ElButton
                >
              </div>
              <div class="repair-item-ledger">
                <div
                  v-for="item in repairOperation.items"
                  :key="item.finding_id"
                  class="repair-item-row"
                >
                  <span>{{ item.status }}</span>
                  <code>{{ item.action }}</code>
                  <span>{{ item.safe_message }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="maintenance-section" aria-labelledby="rebuild-heading">
          <div class="maintenance-section-heading with-action">
            <div>
              <h2 id="rebuild-heading">Rebuild Derived State</h2>
              <p>从现有 Source of Truth 重新生成 parsed chunks 和 retrieval indexes。</p>
            </div>
            <ElButton
              v-if="!rebuild || rebuild.status === 'not_started' || rebuild.status === 'succeeded'"
              type="primary"
              data-testid="start-rebuild"
              :loading="rebuildBusy"
              @click="startRebuild"
              >开始重建</ElButton
            >
            <ElButton
              v-else-if="['failed', 'partially_failed'].includes(rebuild.status)"
              :loading="rebuildBusy"
              @click="retryRebuild"
              >重试重建</ElButton
            >
          </div>

          <ElAlert
            v-if="rebuildError"
            :title="rebuildError"
            type="error"
            :closable="false"
            show-icon
          />

          <div v-if="rebuild" class="rebuild-status-panel">
            <div class="operation-heading">
              <div class="maintenance-status" :class="`is-${statusTone(rebuild.status)}`">
                <span class="maintenance-status-dot" aria-hidden="true"></span>
                <strong>{{ rebuildStatusLabel(rebuild.status) }}</strong>
              </div>
              <time v-if="rebuild.started_at" :datetime="rebuild.started_at">
                {{ formatDate(rebuild.started_at) }}
              </time>
            </div>
            <div v-if="rebuild.status !== 'not_started'" class="rebuild-ledger">
              <div v-for="row in rebuildRows(rebuild)" :key="row.label" class="rebuild-row">
                <span>{{ row.label }}</span>
                <strong>{{ row.completed }} / {{ row.total }}</strong>
                <span v-if="row.failed" class="rebuild-failed">{{ row.failed }} failed</span>
              </div>
            </div>
            <p v-if="rebuild.error_message" class="operation-safe-error">
              {{ rebuild.error_message }}
            </p>
          </div>
        </section>

        <details class="data-boundary-explanation">
          <summary>Source of Truth 与 Derived State</summary>
          <div class="data-boundary-grid">
            <section>
              <h2>Source of Truth</h2>
              <ul>
                <li>Knowledge Base metadata</li>
                <li>Documents、所有文档版本与存储原文件</li>
                <li>Conversations 与 Messages</li>
                <li>Knowledge Entries 与 Evidence snapshots</li>
              </ul>
            </section>
            <section>
              <h2>Derived State</h2>
              <ul>
                <li>Parsed chunks</li>
                <li>Document retrieval index</li>
                <li>Verified Knowledge retrieval index</li>
                <li>可从 Source of Truth 重新生成的数据</li>
              </ul>
            </section>
          </div>
        </details>
      </div>

      <aside class="data-management-inspector" aria-label="数据恢复说明">
        <span class="inspector-eyebrow">RECOVERY INSPECTOR</span>
        <h2>{{ knowledgeBase?.name }}</h2>
        <div class="inspector-section">
          <span>Latest local state</span>
          <strong>{{ currentMaintenanceLabel }}</strong>
        </div>
        <div class="inspector-section">
          <span>Backup boundary</span>
          <p>Archive 保存 Source of Truth，不把可重建索引当作永久主数据。</p>
        </div>
        <div class="inspector-section">
          <span>Recovery sequence</span>
          <ol>
            <li>Restore Source of Truth</li>
            <li>Rebuild Derived State</li>
            <li>Ready for Retrieval</li>
          </ol>
        </div>
        <p class="inspector-note">Restore 是 Workspace-level 能力，不绑定当前知识库 ID。</p>
      </aside>
    </div>
  </main>
</template>
