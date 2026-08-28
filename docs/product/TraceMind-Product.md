# TraceMind 当前产品说明

TraceMind 是一个面向开发者和长期技术学习者的、本地优先、答案可追溯的个人 AI 知识库。它把资料、检索证据、对话和经过维护的经验连接成一个可持续使用的工程知识循环，而不是只对单个 PDF 进行临时聊天。

## 核心用户流程

```text
导入资料
→ 解析与确定性分块
→ 建立 Dense + BM25 检索索引
→ 提问并查看可追溯 Evidence
→ 将有效回答保存为 KnowledgeEntry
→ 验证并维护知识
→ 在后续 RAG 和 Knowledge Map 中继续使用
```

用户可以观察上传、解析和索引状态；在 Conversation 中接收 SSE 流式回答，查看 Citation、Evidence 和 RAG Execution Trace；再把完成的回答沉淀为结构化知识，而不丢失当时的问题、回答和来源快照。

## 当前能力

- 管理 Knowledge Base，导入 PDF、DOCX、Markdown、UTF-8 文本和常见代码文件。
- 使用单层 Deterministic Chunking 保存页码、章节、相对路径和代码行号等引用信息。
- 使用 Qwen3 Embedding、BM25、确定性 RRF 和可选 Cross-Encoder Reranker 检索证据。
- 支持会话上下文驱动的 Query Rewrite；失败时安全回退原始检索查询。
- 通过 LangChain ChatModel 与 LangGraph 编排 Direct / RAG、检索、重排、上下文、生成和引用校验。
- 持久化 Conversation，并区分完成、无答案、取消和失败状态。
- 创建、编辑、验证和检索 KnowledgeEntry，保留不可变的 Evidence Snapshot。
- 从当前 PostgreSQL 数据实时派生 Knowledge Map；图只用于浏览关系，不参与 RAG。
- 提供 Retrieval Workspace，用于检查 Semantic、Hybrid 或 Reranked 候选，不生成回答。
- 提供 Archive / Restore、Consistency Audit、Safe Repair 和 Rebuild Derived State。

## Knowledge 的角色

KnowledgeEntry 是用户维护的长期经验，不是对话消息的别名。它保存可编辑的 Question、Background、Root Cause、Solution、Failed Attempts、Tags 与验证状态，同时保存创建时的 Question、Answer、Evidence 和安全生成元数据快照。

只有当前为 `verified` 且索引代次有效的 KnowledgeEntry 才进入默认 RAG。索引内容来自用户维护字段，不直接索引原始 assistant answer snapshot。Knowledge 来源在引用中保持独立身份，不会伪装成 Document。

## Evidence-first 与可追溯性

回答中的 Citation 只能指向本轮真实返回的来源。Document Evidence 可包含文件名、版本、章节、页码或代码行号；Knowledge Evidence 指向经过维护的知识条目。Citation Guard 会拒绝不存在的来源编号。

RAG Execution Trace 只展示阶段、状态、耗时、候选数量、检索模式与降级信息等可观测数据，不展示模型内部推理过程。

## Local-first 与 Data Recovery

PostgreSQL 中的长期业务记录和本地 Original Files 构成持久事实来源。Qdrant、解析 Chunk、索引代次和队列运行状态属于可重建的 Derived State。归档包含恢复知识库所需的业务记录和原文件，不包含向量、模型缓存、凭据或运行日志。

Restore 先恢复 Source of Truth，并明确处于尚未重建状态；Rebuild 再重新解析文件并建立 Document 与 verified Knowledge 索引。Consistency Audit 是只读检查；Safe Repair 只执行后端重新验证并允许的派生状态修复。因此 Qdrant 数据丢失会影响检索可用性，但不等于永久知识丢失。

## 当前产品边界

- 面向个人、本地环境和可解释的小规模知识工作流，不是企业多租户知识平台。
- 代码文件按普通技术文本处理，保留路径、语言和行号；不提供 AST、Symbol Scope 或调用图。
- Knowledge Map 是确定性派生视图，不是图数据库或图检索系统，也不参与回答生成。
- PDF 只处理可提取文本层，当前不提供 OCR。
- LLM 由 OpenAI-compatible Provider 配置；使用远程 Provider 时，问题、必要会话历史和本轮 Evidence 内容会发送给该服务。需要完全本地处理时应配置本地兼容端点。
- Embedding 和 Reranker 默认使用本地模型；首次下载、冷启动和 CPU 推理可能产生明显等待。

## Non-goals

TraceMind 当前不是：

- Claude Code / Codex 类 coding agent；
- 通用 Agent 或 Multi-Agent 平台；
- 自动执行、自动改代码或自动操作外部系统的 Agent；
- 图数据库或图检索平台；
- 云同步、自动备份或企业权限管理系统。

新能力必须由真实使用问题和可验证目标驱动；未来设想不能作为当前能力描述。
