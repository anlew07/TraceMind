# TraceMind Knowledge 设计

本文描述当前 KnowledgeEntry、Evidence Snapshot、验证状态、检索索引和 Knowledge Map 的稳定设计。

## 1. KnowledgeEntry 的问题与角色

Conversation 适合保留时间顺序，但不适合长期维护解决经验。KnowledgeEntry 将一个已完成的 assistant answer 转换为结构化知识，同时保留创建时的 provenance。

当前维护字段包括：

- Question
- Background
- Root Cause
- Solution
- Failed Attempts
- Tags
- Validation Status

Knowledge 只能从同一 Knowledge Base 内已持久化且完成的 assistant message 创建。客户端可以编辑维护字段，但不能提交或改写 provenance snapshot。

## 2. Provenance 与 Evidence Snapshot

`knowledge_entries` 保存不可变的 paired user question、assistant answer、实际引用的 sources 和安全 generation metadata snapshot。Service 会：

1. 解析 submitted assistant message 与对应 user message；
2. 从 answer 中提取真实 `[Sx]`；
3. 只保留同时存在于 `ConversationMessage.sources` 的引用；
4. 以 `RagSource` 校验类型和 Knowledge Base scope；
5. 复制 display-safe 字段。

Prompt、凭据、index generation、retrieval query、内部 Graph state 与未引用来源不会进入 snapshot。Conversation 外键使用 `ON DELETE SET NULL`，所以原会话删除后，知识与快照仍可保留。一个 assistant message 最多对应一个当前 KnowledgeEntry。

## 3. 验证与维护边界

Validation Status 是用户维护的知识可信状态；Index Status 是 Derived State 的运行状态，两者不能合并。

- `unverified`：不进入 RAG。
- `verified`：具备索引资格；只有索引成功且 source version 当前有效时才可检索。
- `outdated`：不进入 RAG，旧 active generation 立即失去数据库资格。

修改维护字段会使旧索引内容失效，并异步创建新 generation。原 assistant answer snapshot 不随维护字段编辑而改变，也不会被直接索引。

## 4. Verified Knowledge Retrieval

Knowledge indexing 复用 Document 的 Embedding Provider、Qdrant collection、DeterministicChunker 和 generation 激活协议。

索引正文由 Question、Background、Root Cause、Solution、Failed Attempts 和 Tags 生成。每个 Qdrant payload 明确包含：

- `source_type=knowledge_entry`
- `knowledge_base_id`
- `knowledge_entry_id`
- `index_generation`
- `knowledge_question`
- `knowledge_updated_at`
- chunk identity、content、hash、section 与 validation status

只有 verified entry 的 current active generation 会由 PostgreSQL Repository 返回。更新、状态变化和删除会投递幂等 Celery sync；attempt generation 与 source `updated_at` 都匹配时才能激活。失败 generation 会清理，队列或索引失败保留可见的 retryable state。

默认、无显式 scope 的 RAG 使用一次 Query Embedding，在同一个 Qdrant 查询中过滤 active Document 与 verified Knowledge generations。显式 Document/path scope 或 language scope 保持 document-only。Knowledge Evidence 使用 `[Sx]`，但以“已验证知识”和 Entry link 标识，不制造文件名、页码或路径。

## 5. 未采用方案

- **索引 answer snapshot**：生成文本未经用户维护，直接回灌会强化未经验证的答案。
- **把 Knowledge 当作 Markdown Document**：会制造虚假文件身份并削弱 Citation 语义。
- **第二个 Qdrant collection**：需要跨 collection score fusion，却没有提供相应可信收益。
- **同步索引**：本地 Embedding 模型会让编辑请求产生不可预测等待。
- **独立 Tag / Evidence 表**：当前 Tag 是简单过滤值，Evidence 是不可独立维护的快照；JSON/array 结构更符合当前边界。

## 6. Knowledge Map

Knowledge Map 是只读、请求时派生的 PostgreSQL projection，不是存储或 Retrieval subsystem。

节点类型：

- Knowledge Base
- Document
- KnowledgeEntry
- Tag

边类型：

- `contains`：Knowledge Base 包含 live Document / KnowledgeEntry。
- `cites`：Entry snapshot 指向同一 Knowledge Base 中仍存在的 Document。
- `tagged`：Entry 包含规范化 Tag。
- `related`：两个 Entry 共享 Tag 或 live cited Document；metadata 记录透明原因。

已删除 Document 的 snapshot 仍可在 Knowledge Detail 中显示，但不会产生 live Document node、`cites` edge 或 document-based related reason。图数据不持久化，不调用模型，不计算 embedding similarity，也不参与 RAG。

## 7. 数据恢复

Archive 导出维护字段、validation status、provenance foreign keys 与 snapshots，但不导出 Knowledge indexing runtime 字段或 Qdrant points。Restore 后 verified entry 处于 pending，其他状态处于 not_indexed。Rebuild 只为当前 verified entries 重建索引。

Qdrant 是 Derived State。索引丢失不会删除 KnowledgeEntry 或 snapshot；可通过 Rebuild 恢复。Consistency Audit / Safe Repair 只在明确 allowlist 中处理索引与孤立点，不自动改写维护字段。

## 8. 当前限制

- KnowledgeEntry 只能从已完成的持久 Conversation answer 创建。
- Tags 使用 Unicode `casefold()` 规范化；搜索是有界 SQL substring matching，不是 ranked full-text search。
- Knowledge Map 在内存中派生，面向个人数据规模，没有分页、聚类、缓存或图检索。
- 固定 Document Retrieval dataset 不能证明 KnowledgeEntry 的真实回答质量；已有专项实验只验证回归隔离、来源身份和索引资格。需要独立 Gold Dataset 才能评估 Knowledge Recall 与回答支持率。
