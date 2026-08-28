# TraceMind 开发指南

本文负责本地开发、运行、配置、迁移、测试和数据维护。产品能力与 UI 规范分别以[当前产品](product/TraceMind-Product.md)和[UI / UX 设计](design/TraceMind-UI-Design.md)为准。

## 环境要求

- Git
- Python 3.12
- uv
- Node.js 22.18+ 或 24.12+，以及 npm
- Docker Desktop，或支持 Docker Compose 的 Docker Engine

## 准备配置

Windows PowerShell：

```powershell
Copy-Item .env.example .env
Copy-Item frontend/.env.example frontend/.env
```

macOS / Linux：

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

根目录 `.env` 至少需要设置 `LLM_BASE_URL` 和 `LLM_MODEL`；远程 Provider 需要鉴权时再设置 `LLM_API_KEY`。真实 `.env`、API Key、密码、上传资料和模型缓存不得提交。

配置以 `.env.example` 和 `backend/app/core/config.py` 为事实来源，主要分为：

- PostgreSQL、Redis / Celery 与 Qdrant 连接；
- 文件大小、解析上限、Chunking 与任务 stale 时间；
- Embedding 模型、维度、设备和批大小；
- Dense / BM25 候选数、Dense 阈值、RAG Top-K 与 Context 上限；
- ChatModel、Query Rewrite 与可选 Reranker。

Backend 与 Celery Worker 必须使用相同的文件、解析、Chunking、Embedding 和索引配置。

## 启动本地服务

在仓库根目录启动基础设施：

```bash
docker compose up -d postgres redis qdrant
docker compose ps
```

终端 1，启动 Backend：

```bash
cd backend
uv sync --frozen
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

终端 2，启动 Celery Worker：

```bash
cd backend
uv run --no-sync celery -A app.worker.celery_app:celery_app worker --loglevel=INFO
```

Windows 本地使用 CPU Embedding 时可使用线程池：

```bash
uv run --no-sync celery -A app.worker.celery_app:celery_app worker --loglevel=INFO --pool=threads --concurrency=2 --prefetch-multiplier=1
```

终端 3，启动 Frontend：

```bash
cd frontend
npm ci
npm run dev
```

默认地址：Frontend `http://localhost:5173`，Backend `http://localhost:8000`，Swagger `http://localhost:8000/docs`。

也可以启动应用容器：

```bash
docker compose --profile app up --build
```

该 Profile 启动基础服务、Backend 和 Celery Worker；Vue 前端仍默认在宿主机运行。Backend 与 Worker 必须共享同一个 Document Storage。

## 工程边界

- API 层处理 HTTP、参数校验、SSE、响应与错误映射。
- Service 层处理业务规则、事务、任务编排和跨资源补偿。
- Repository 层只访问 PostgreSQL，不提交事务、不操作文件。
- Storage 层处理受控目录内的写入、校验、移动、删除和恢复补偿。
- Parsing 层执行确定性解析与 Chunking，不访问数据库、HTTP、Celery 或模型服务。
- Integration / Provider 封装 PostgreSQL、Redis、Qdrant、ChatModel、Embedding 与 Reranker。

当前 RAG 是固定的 LangGraph 流程，不是自主决策 Agent。Conversation 由 PostgreSQL 持久化；LangGraph State 只属于单次请求。

## 文档导入、解析与索引

导入以同一 Knowledge Base 内的规范化文件名识别逻辑 Document，并用 SHA-256 判断内容是否变化：

- 首次导入创建 Document 与 Version 1；
- 同名同内容返回 `unchanged`；
- 同名内容变化创建递增 DocumentVersion；
- Redis / Celery 暂不可用不会回滚已经保存的原文件和数据库版本，可稍后重试。

支持 PDF 文本层、DOCX、Markdown、UTF-8 文本和常见代码文件。PDF 不支持 OCR；代码按普通技术文本解析，不构建 AST、符号表或调用图。

当前只有一层 `DeterministicChunker`，默认 `1800` 字符、`200` 字符 overlap。解析成功只表示 DocumentChunk 已保存；只有新 generation 完成 Embedding、Qdrant 写入和数量校验并切换为 Active 后，版本才参与检索。

## 检索与模型

默认链路是 Qwen3 Embedding 生成 Dense Query，Qdrant 分别执行 Dense 与 BM25 召回，应用层使用稳定键和 `k=2` 的确定性 RRF 融合。Production RAG 默认取 10 个候选进入可选 Reranker，最终保留 5 个 Evidence；具体值可由环境变量覆盖。

ChatModel 通过 LangChain `BaseChatModel` 与 OpenAI-compatible 配置接入。使用远程 Provider 时，问题、必要会话历史和选中的 Evidence 内容会发送到该服务；需要完全本地处理时应配置本地兼容端点。

Reranker 不是必需组件。部署、离线缓存、CPU / CUDA 边界和故障回退见 [Reranker 指南](reranker.md)。

## 数据库迁移

在 `backend` 目录执行：

```bash
uv run alembic upgrade head
uv run alembic current
uv run alembic heads
```

模型变化必须附带 Alembic migration，并考虑 upgrade、downgrade 和存量数据兼容。回退前必须确认目标数据库和数据影响；往返验证只应使用名称以 `_test` 结尾的专用测试数据库，不得对日常开发数据执行破坏性验证。

## 数据持久性与恢复

持久事实来源是 PostgreSQL 长期业务数据与 Original Files。DocumentChunk、Qdrant Points / Generations 和任务运行状态是可重建的 Derived State。

- Archive / Restore 负责备份和恢复事实数据，不把向量、模型缓存或凭据作为归档事实。
- Consistency Audit 检查 PostgreSQL、文件和 Qdrant 的一致性。
- Safe Repair 只执行后端 allowlist 允许且重新验证通过的派生状态修复。
- Rebuild 重新解析所有版本，并为每个 Document 最新版本和当前 verified KnowledgeEntry 重建索引。

删除 Qdrant Collection、数据库、上传目录或 Docker Volume 都可能影响本地数据。执行清理前必须确认目标和恢复路径；`docker compose down` 默认保留命名 Volume，不要在不明确数据影响时追加删除 Volume 的参数。

## 验证

后端，在 `backend` 目录运行：

```bash
uv run ruff check .
uv run ruff format --check .
uv run mypy app
uv run pytest -m "not integration"
```

前端，在 `frontend` 目录运行：

```bash
npx vue-tsc --noEmit
npx eslint src/ --max-warnings 100
npx vitest run
npx vite build
```

也可从仓库根目录运行 `scripts/verify.ps1` 或 `scripts/verify.sh`。默认脚本不会创建、清空或删除数据库和 Docker Volume。

集成测试必须显式提供 `TEST_DATABASE_URL`，且数据库名以 `_test` 结尾。真实 Qdrant 集成测试应使用独立临时 Collection。涉及检索算法、Chunking、Embedding、Reranker 或 Prompt 的变化，还需要按 [Retrieval Evaluation](retrieval-evaluation/README.md) 使用固定资产记录质量、引用、延迟与成本。

## 停止服务

```bash
docker compose down
```

该命令保留命名 Volume。Backend、Worker、Frontend 和可选 Reranker 可在各自终端正常结束。
