# TraceMind 当前系统架构

本文是 TraceMind 唯一正式的 Current Architecture。它描述 v1.1.0 代码中的生产边界，不以旧阶段计划或未来设想代替实现事实。

## 1. 系统总体结构

```text
Vue 3 / TypeScript Frontend
        │ HTTP + SSE
        ▼
FastAPI API Layer
        ▼
Service Layer ───────────────► LangChain ChatModel / local Reranker
        │
        ├── Repository ──────► PostgreSQL
        ├── Storage ─────────► Local Original Files
        ├── Dispatcher ──────► Redis / Celery Workers
        └── Indexing Gateway ► Qdrant
```

- API 层负责 HTTP、Schema 校验、SSE、响应和安全错误映射。
- Service 层负责业务规则、事务边界、任务编排和 PostgreSQL / 文件 / Qdrant 间的补偿。
- Repository 只负责数据库访问，不提交事务、不操作文件。
- Storage 负责受控根目录内的流式写入、哈希、原子移动、trash 和 restore journal。
- Parsing 负责同步、确定性的解析与 Chunking，不访问数据库、HTTP、Celery 或模型服务。
- Integration / Provider 隔离 Qdrant、Redis、Embedding、Reranker 与 ChatModel 依赖。

PostgreSQL 保存业务实体、引用快照和运行状态；Redis 是 Celery broker/result backend；Celery 执行解析、Document/Knowledge 索引、Repair 和 Rebuild；Qdrant 保存 Dense/BM25 检索点；本地文件系统保存不可变 DocumentVersion 原文件。

## 2. Document Ingestion

```text
Upload
→ validate name / extension / size
→ stream original file + SHA-256
→ create Document / DocumentVersion
→ atomically store original file
→ commit PostgreSQL
→ enqueue Parse task
→ Parser emits ParsedBlock
→ Deterministic Chunking
→ replace DocumentChunk transactionally
→ enqueue Index task
→ Embedding + Qdrant upsert
→ activate index generation
```

同一 Knowledge Base 内，规范化文件名标识一个逻辑 Document；内容哈希相同返回 unchanged，内容变化创建递增版本。文件先落在受控临时目录，再移动到 UUID 路径；数据库失败时补偿本轮文件。删除 Document 时先移动到 `.trash`，数据库提交失败则恢复。

解析支持 PDF 文本层、DOCX、Markdown、UTF-8 文本和常见代码扩展名。PDF Citation 使用 1-based 页码；文本与代码可保留 1-based 行号；Markdown 和 DOCX 可保留章节。解析成功与索引成功是两个独立状态。

### 当前 Chunking

当前只有一层 `DeterministicChunker`，默认 `max_chars=1800`、`overlap_chars=200`。它按 ParsedBlock 逐块切分，优先保持完整行；超长单行才使用字符窗口。相同输入和配置产生稳定的顺序、正文和 SHA-256。

当前没有 Hierarchical Chunking、Parent/Child Chunk、Auto-merging 或三级分块。

### Document Indexing

索引任务以 generation UUID claim 版本，在事务外生成 Qwen3 Embedding，并把 Dense vector、BM25 sparse text 与引用 payload 写入 Qdrant。只有 point count 校验成功且当前数据库 attempt 仍匹配时，新 generation 才成为 active；旧 generation 随后尽力清理。检索只查询 PostgreSQL 声明的 active generations，因此失败或孤立点不会自动成为当前证据。

## 3. Retrieval

```text
Query
→ resolve optional document/path scope
→ Query Rewrite（Conversation RAG 中按需）
→ one query embedding
→ Qdrant Dense branch + BM25 branch
→ deterministic application-side RRF
→ candidate set
→ optional local Cross-Encoder Reranker
→ Top-K Evidence
```

默认参数来自 `Settings`：

- Dense 与 Sparse branch 至少各取 20 个候选；
- Dense branch 应用 0.50 cosine threshold，Sparse branch 和最终 RRF 不应用该阈值；
- RRF 使用稳定 payload key 消除同分顺序不确定性，并使用 `k=2`；
- Production RAG 取 10 个融合候选进入可选 Reranker，最终保留 5 个；
- Context Builder 最多使用 12,000 字符。

显式 `document_id` 或可解析的相对路径限定 Document；language scope 同样只查询 Document。无这些 scope 时，候选 generation 是 active Document 与 active verified KnowledgeEntry 的并集。

Fallback 规则是显式的：没有 active generation 返回空证据；Embedding/Qdrant 故障作为 retrieval unavailable 结束请求；Reranker 未启用时直接使用 Hybrid Top 5，连接失败、超时、OOM 或无效响应时回退 Hybrid Top 5；`/search/reranked` 调试接口不静默降级。

## 4. LangGraph Production RAG

FastAPI 在 lifespan 构建一个编译后的 LangGraph，并通过 LangChain `BaseChatModel` 调用 OpenAI-compatible Provider。每个请求使用短生命周期 `RagState`；持久 Conversation 仍由 TraceMind Service/Repository 管理，Graph 不使用 checkpointer 作为业务数据库。

```text
START
→ route
  ├─ direct → generate_direct → finalize
  └─ rag → resolve_scope → rewrite → retrieve → rerank → prepare_context
                                             ├─ no sources → no_answer → finalize
                                             └─ sources → generate_grounded → finalize
→ END
```

- `route`：确定性寒暄白名单选择 Direct，其余进入 RAG。
- `resolve_scope`：解析显式 document/path scope，生成结构化检索查询。
- `rewrite`：仅在有 Conversation history 时让 ChatModel 决定 keep/rewrite；超时、模型错误或无效结构化响应都回退原 semantic query。
- `retrieve`：一次 Embedding，执行 Dense + BM25 + RRF，并记录分支候选数与耗时。
- `rerank`：可选 Cross-Encoder；失败保持 Hybrid 结果。
- `prepare_context`：把真实结果转换为带稳定 `[Sx]` 的 Evidence 和受字符上限约束的 context。
- `no_answer`：没有来源时返回固定资料不足消息，不调用 grounded generation。
- `generate_grounded`：把结构化 payload 交给 ChatModel 流式生成；Citation Guard 过滤未返回的来源编号并统计有效/无效引用。
- `finalize`：发出 terminal metadata，并由 API 层完成 Conversation 状态持久化。

LangGraph custom stream 被映射为 `pipeline`、`sources`、`token`、`no_answer` 和 `done` SSE 事件；错误由 API 层映射为安全 `error`。客户端断开或取消时，短事务会尽力把已创建的回答记录收口为 cancelled/no_answer，避免留下永久 pending 消息。

RAG Execution Trace 只包含阶段、状态、latency、candidate/source count、scope、rewrite、retrieval/reranker 模式和安全错误码等可观测信息。它不是 private chain-of-thought，不记录或展示模型思维链、Graph 内部对象、Prompt 原文或凭据。

## 5. Knowledge

`KnowledgeEntry` 保存用户维护的 Question、Background、Root Cause、Solution、Failed Attempts、Tags 与 validation status，也保存创建时的 question/answer/evidence/generation metadata snapshot。这些 snapshot 在原 Conversation 删除后仍可保留。

只有 verified 且索引代次与维护内容版本一致的 Entry 才进入 Retrieval。Knowledge indexing 复用同一个 DeterministicChunker、Embedding Provider、Qdrant collection 和 generation 激活协议；索引文本使用维护字段，排除 assistant answer snapshot。Qdrant payload 使用明确的 `source_type=knowledge_entry`，Citation 因此不会制造文件身份。

Knowledge Map 读取 PostgreSQL 中当前 Knowledge Base、Document、KnowledgeEntry 和 Tag，实时派生 `contains`、`cites`、`tagged`、`related` 边。它不写图表、不调用模型、不参与 RAG，也不是 GraphRAG。

## 6. Source of Truth 与 Derived State

```text
Persistent Source of Truth
= PostgreSQL 长期业务记录 + Local Original Files

Derived / Rebuildable State
= DocumentChunk + Qdrant points/generations + parse/index/queue operation state
```

PostgreSQL 是业务实体、版本元数据、Conversation、KnowledgeEntry 和 Evidence Snapshot 的事实来源；Original Files 是 Document 内容事实。DocumentChunk 虽存于 PostgreSQL，仍由原文件与确定性解析配置重建；Qdrant 只保存检索副本。Redis/Celery 不保存不可替代的业务事实。

## 7. Data Durability

- Archive 导出 Knowledge Base 元数据、Documents、所有 DocumentVersions、原文件、Conversations、Messages、KnowledgeEntries 和安全快照；不导出 secret、模型缓存、Chunk 或向量。
- Restore 完整验证 ZIP、hash、实体关系、路径与冲突后，原子恢复 Source of Truth；恢复后的 parse/index 状态明确为 pending/not_started。
- Consistency Audit 只读检查 PostgreSQL、Storage、Qdrant generation/payload 与 restore journal，返回 completed/partial 和结构化 findings。
- Safe Repair 先以最新 Audit 做 dry-run/revalidation，只允许后端 allowlist 中的派生状态修复；不重写用户正文或业务快照。
- Rebuild Derived State 重新解析所有版本，只索引每个 Document 最新版本和 verified KnowledgeEntry；operation/item 状态、lease、retry 与 generation fencing 支持失败恢复。

因此 Qdrant collection 丢失会让检索暂时不可用，但 PostgreSQL 业务数据与 Original Files 完整时，可通过 Rebuild 恢复派生检索状态。详细安全不变量见 [Local Data Durability](../design/local-data-durability.md)。

## 8. Frontend

Vue Router 提供以下主要界面：

- Landing 与首次入口路由；
- Knowledge Base Workspace；
- Conversation；
- Documents；
- Retrieval Workspace；
- Knowledge 列表与 Knowledge Detail；
- Knowledge Map；
- Data & Recovery。

前端通过 HTTP API 管理资源，通过 SSE 消费 RAG 事件。Evidence Inspector 是来源核验界面；Execution Trace 属于默认折叠的 L3 可观测信息。具体路由、交互和响应式规则见 [TraceMind UI Design](../design/TraceMind-UI-Design.md)。

## 9. 当前限制

- 单机、本地优先，不提供多租户、权限系统、云同步或自动备份。
- PDF 无 OCR；代码无 AST、Symbol Scope 或调用图。
- 单层 Chunking，无 Hierarchical Chunking、Auto-merging、GraphRAG 或 Agent。
- 本地 Embedding/Reranker 的冷启动与 CPU 推理可能成为延迟瓶颈。
- Knowledge Map 面向个人数据规模，没有大图分页、聚类或图检索。
