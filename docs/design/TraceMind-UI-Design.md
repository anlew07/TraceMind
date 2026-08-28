# TraceMind UI / UX 设计

本文是当前路由、页面行为、响应式规则和产品视觉约束的单一事实来源。通用视觉 DNA 见仓库根目录的 [design.md](../../design.md)；修改前端表现层前应同时核对实际组件和本文件。

## 1. 产品界面定位

TraceMind 是本地优先、证据可核验的个人知识工作区。界面应克制、清晰、适合长时间阅读，不做管理后台、通用 SaaS Dashboard、IDE、ChatGPT 仿制品或 Coding Agent 界面。

核心原则：

- 内容优先于装饰，Evidence 优先于状态炫技。
- 知识对象使用可阅读的账本或资源行，不用 CRUD 表格表达。
- 每页只保留一个主操作，次级操作进入上下文或 `···` 菜单。
- 不用卡片包裹每个区域，不重复展示同一份来源或状态。
- Execution Trace 只展示可观测执行事实，不展示或暗示模型私有思维过程。

## 2. 当前路由

| 路由 | 页面 |
| --- | --- |
| `/` | 首次访问进入 Landing，完成本地入口选择后进入 Workspace |
| `/landing` | 克制的产品入口页 |
| `/knowledge-bases` | Knowledge Base Workspace |
| `/knowledge-bases/:knowledgeBaseId/chat` | Conversation |
| `/knowledge-bases/:knowledgeBaseId/documents` | Documents |
| `/knowledge-bases/:knowledgeBaseId/retrieval` | Retrieval Workspace |
| `/knowledge-bases/:knowledgeBaseId/knowledge` | Knowledge Ledger |
| `/knowledge-bases/:knowledgeBaseId/knowledge/:entryId` | Knowledge Detail |
| `/knowledge-bases/:knowledgeBaseId/map` | Knowledge Map |
| `/knowledge-bases/:knowledgeBaseId/data-management` | Data & Recovery |

根路由只读取本地 Landing 偏好，不拦截深层链接。首次使用说明应指向 `/`，而不是绕过入口逻辑直接指向 Workspace。

## 3. 信息层级

### L1：主要内容

- 用户问题与回答；
- Document、Knowledge Base 与 KnowledgeEntry；
- 检索结果；
- Citation、Source 与 Evidence。

### L2：上下文信息

- 文件路径、章节、页码、Chunk 与代码行范围；
- 版本、更新时间和业务状态；
- Knowledge 验证状态与索引可用性。

### L3：执行与调试

- Query Rewrite、Retrieval 与 Reranker 模式；
- fallback、latency、candidate count、scope 和 trace metadata。

L1 必须占据主要视觉空间，L2 辅助理解，L3 默认折叠。Evidence 始终属于 L1，不能因为它包含技术元数据就被埋入调试区域。

## 4. 全局框架

桌面端只保留一层约 58px 的紧凑 App Bar：

```text
TraceMind | 当前知识库 | 问答  文档  知识  图谱 | Local-first | Workspace
```

- 当前知识库名称来自页面真实数据。
- 四个知识库内目的地使用紧凑文字导航，当前项用底部强调线表示。
- Retrieval Workspace 和 Data & Recovery 是次级入口，不加入四项主导航。
- 不增加全局侧边栏、第二层导航或当前阶段不存在的知识库选择器。

`680px` 及以下收敛为 `TraceMind | 当前页 · 当前知识库 | 菜单`。业务导航、返回 Workspace 与 Local-first 说明进入一个可轻触关闭的菜单；知识库名称允许省略号截断。`768px` 宽度仍使用完整桌面导航，避免混合两套布局。

所有可关闭 Inspector 支持明确的关闭按钮和 Escape。移动菜单层级高于页面 Inspector 与 backdrop。

## 5. Workspace 与 Landing

`/knowledge-bases` 是日常 Research Desk：

- 页面标题和“创建知识库”是唯一主操作；
- Knowledge Space 只展示真实的名称、可选描述与更新时间；
- 整个主体进入 Conversation，编辑和删除放入 `···`；
- 宽屏三列，中等宽度两列，窄屏单列；
- 不增加文档数、会话数、Owner、Activity、健康度等不存在的字段。

Landing 是短小的首次入口页，只有一个进入 Workspace 的主动作。写入本地偏好失败不能阻止用户进入；显式访问 `/landing` 始终可用。

空知识库在 Conversation 中提供“导入资料”和“仍然开始对话”两个清晰选择。前者复用 Documents 的 `?import=1` 上传流程，后者只允许真实 Direct 模式能力，不伪造 Evidence。

## 6. Documents

页面结构：

```text
资料 + 说明 + 导入资料
名称或路径搜索
Document 资源行
按需 Document Inspector
折叠的 Retrieval Tools 入口
```

每个资源行以文件名为主，随后展示相对路径、版本、大小、Chunk 数和更新时间。页面只根据真实 parse/index 状态给出一个产品状态：可用、等待解析、处理中或失败；不创造上传子阶段、归档状态或健康分。

点击资源行打开 Inspector，`···` 保留 Chunk、重新解析、重新索引、下载、版本和删除等真实操作。Inspector 默认关闭，只展示当前 API 已有的身份、路径、来源、MIME、版本、解析/索引状态和时间；Parser、Embedding、Content Hash 与 Generation 属于默认折叠的技术细节。

当前没有稳定的整文阅读或分页 API，因此不能用 Chunk Preview 拼装虚假的 Document Reader。桌面使用侧栏，中等宽度使用 overlay，窄屏使用全宽 sheet。

上传区域默认折叠，`?import=1` 打开同一个 `DocumentUploadPanel`。Retrieval Tools 只链接到独立 Retrieval Workspace，不保留第二套内嵌检索实现。

## 7. Conversation、Evidence 与 Execution Trace

宽屏工作台由 Conversation 列表、Answer 主区和按需 Evidence Inspector 组成：

```text
Conversations 200px | Answer flexible | Evidence 360px
```

### Conversation 与 Answer

- 历史列表展示标题和相对时间，重命名与删除放入 `···`。
- 用户消息使用紧凑的右对齐 muted-sage surface，最大宽度约 65%–70%。
- Assistant 回答使用更宽的左对齐 warm-paper 阅读 surface，最大宽度约 88%–94%。
- 两类消息保持非对称，不做镜像聊天气泡。
- Citation 使用统一 `[S1]`、`[S2]` 身份，点击后打开对应 Evidence。
- Evidence 摘要、Execution Trace、Trace Detail 与“保存为知识”属于对应回答的次级区块，不拆成独立 Dashboard 卡片。

### Evidence Inspector

Inspector 在初次进入、切换历史会话、收到 Sources 和回答完成后都保持关闭，也不自动选择第一条来源。只有用户点击具体 Citation 时，才选择该来源并打开 Inspector；关闭后 Answer 立即恢复可用宽度。

Document Evidence 显示文件名、章节、页码或代码行；Knowledge Evidence 显示维护后的问题和“已验证知识”，并链接到 Knowledge Detail。Knowledge 来源不能伪装成文件，来源类型也不能只靠颜色区分。

桌面使用右侧 pane，中等宽度使用不改变 Composer 布局的右侧 overlay，移动端使用全宽 panel。

### Execution Trace

实时生成期间 Trace 展开，终态后折叠为摘要；历史 Trace 默认折叠。只展示后端实际提供的阶段、状态、候选数、来源数、Scope、Retrieval / Reranker 模式、fallback 和耗时，不展示 Prompt、内部 Graph State、凭据、模型原始推理文本或向量。

## 8. Retrieval Workspace

Retrieval Workspace 是开发者检索实验台，不是第二个 Conversation 或 Benchmark Dashboard。它只执行一个用户选择的模式并停在候选 Evidence：

- Semantic：Dense Cosine Retrieval；
- Hybrid：Dense + BM25，经应用层确定性 RRF 融合；
- Reranked：Hybrid 候选经过本地 Cross-Encoder 排序。

默认模式是 Hybrid，Scope 为当前 Knowledge Base 或一个真实 `document_id`，Limit 保持 5 或 10。Language 是 Advanced Hint。显式路径解析产生的 `semantic_query` 只表示去掉路径后的查询，不等同于 Conversation-aware Query Rewrite。

结果以 Ledger 展示最终 Rank、Document 身份与可读正文。RRF Score、Cosine Score 与 Reranker Raw Logit 都不能显示为概率或百分比；Reranked 使用 API 的 `retrieval_rank` 展示重排前后位置，不由前端重建。

Result Inspector 默认关闭，只显示响应中已有的身份、位置、完整 Chunk 和排序字段。页面不执行 LangGraph、LLM Generation、三路自动比较或评测指标计算。

## 9. Knowledge

KnowledgeEntry 是从已完成回答沉淀的长期工程记录：

- List 使用 Editorial Ledger，不使用 CRUD 表格或卡片网格；
- Question 与 Solution 为主体，Validation、Tags、RAG 可用性、Index 状态和更新时间逐级弱化；
- Detail 以 Solution 为主要阅读区，Background、Root Cause 与 Failed Attempts 仅在有内容时出现；
- Evidence 明确标记为保存时快照，不能根据历史 ID 假设原 Document 仍然存在；
- 编辑只修改维护字段，不修改 provenance snapshot；
- Validation Status 与 Index Status 分开呈现，不增加独立“用于 RAG”开关；
- 只有 verified 且当前索引成功的条目才显示为可检索。

## 10. Knowledge Map

Knowledge Map 是当前 PostgreSQL 数据的确定性关系视图。节点只有 Knowledge Base、Document、KnowledgeEntry 与 Tag；边只有 `contains`、`cites`、`tagged` 与 `related`。

- Graph Canvas 是主工作面，Inspector 默认关闭，用户选择节点或边后才打开。
- 选择后突出真实邻域，弱化无关项；关系原因只读取 API metadata。
- Cytoscape 负责 pan、zoom、drag、selection 和现有 `cose` layout；前端不重新推导边或权重。
- KnowledgeEntry 和 Document 进入已有详情或资料路由。
- 只有 Knowledge Base 根节点时显示真实空态；仅有 Document 仍属于有效图内容。
- 该页面只用于浏览关系，不参与 Retrieval，不编辑图数据，也不通过模型生成关系。

## 11. Data & Recovery

Data & Recovery 是本地数据维护工作区，不是资源监控、Settings 或 DevOps Console。

- Archive / Restore 操作 Source of Truth；Restore 后必须明确区分“事实数据已恢复”和“可检索状态已重建”。
- Audit 是检查操作，不显示虚构健康分。
- Repair 只能执行后端 dry-run 返回为 planned 且 repairable 的 Finding ID，前端不维护修复 allowlist。
- Repair 与 Rebuild 仅在 queued / running 时轮询；失败或部分失败时保守提供 Retry。
- Rebuild 只展示 API 的 Document Version parsed、Document indexed 和 verified Knowledge indexed 计数，不伪造阶段或百分比。
- Export 和 Audit 可直接执行；Restore、Repair 与 Rebuild 需要一次明确确认。

入口位于 Knowledge Space 的次级菜单。桌面使用维护主区和窄 Inspector，中窄屏收敛为单列；不增加 CPU、GPU、内存、Storage、Cloud Backup 或自动修复能力。

## 12. 视觉语言

### 语言

普通标题、操作、状态、空态、错误与确认文案以自然中文为主。RAG、Semantic、Hybrid、Reranked、RRF、Cross-Encoder、Evidence、Execution Trace、Local-first、Embedding、BM25、LangGraph、LangChain、Qdrant 和 API 可保留英文。

### 颜色

- Background：暖白页面背景；
- Surface：只在确有层级时使用；
- Accent：深绿，用于导航、Focus、链接和主操作；
- Evidence：砖红 / 朱红，只用于 Citation 与来源身份；
- Success / Warning / Error：只表达真实语义状态；
- Border：1px hairline 分隔。

不使用渐变、玻璃拟态、重阴影或大面积高饱和色。颜色不能成为区分来源类型或状态的唯一方式。

### 字体与密度

- 系统字体：`system-ui, 'PingFang SC', 'Microsoft YaHei UI', 'Segoe UI'`；
- 等宽字体：`'Cascadia Code', 'JetBrains Mono', Consolas, monospace`；
- 层级建议：24px 页面标题、15px 阅读正文、14px UI、13px metadata、11px micro；
- 不使用巨型标题、装饰性 eyebrow 或过量大写。

### Element Plus

Element Plus 是交互实现依赖，不是视觉身份。Dialog、Dropdown、Input、Button、Loading、Message 与 Confirmation 可复用其行为，但颜色、圆角、字体和间距应服从项目 token。不引入第二套组件框架。

## 13. 响应式与 Inspector 约束

- Desktop：按需侧栏，未选择真实对象时关闭。
- Medium：右侧 overlay，不进入普通文档流，不挤压 Composer 或主阅读区。
- Mobile：全宽 panel，限制 viewport 高度并内部滚动。
- 所有可关闭 Inspector 都有带可访问名称的原生关闭按钮，并支持 Escape。
- 页面在 320px 宽度仍不能产生应用级横向滚动。

## 14. 新功能与评审清单

新增前端能力前：

1. 先判断信息属于 L1、L2 还是 L3。
2. 检查现有页面是否已有可复用模式。
3. 只使用真实 API 字段与真实状态。
4. 保持 Global Shell、Evidence、Inspector 与响应式语义一致。
5. 只有形成跨页面长期模式时才更新本文件。

交付前检查：

- [ ] Evidence / Sources 保持 L1，未被隐藏或重复展示。
- [ ] Execution / Debug 使用渐进披露。
- [ ] 知识对象未被改成 CRUD 表格或卡片堆叠。
- [ ] User / Assistant 保持非对称阅读面。
- [ ] 未增加重复导航、虚构字段或未实现能力。
- [ ] Inspector 的关闭、Escape 和窄屏行为一致。
- [ ] `npx vue-tsc --noEmit` 通过。
- [ ] `npx eslint src/ --max-warnings 100` 通过。
- [ ] `npx vitest run` 通过。
- [ ] `npx vite build` 通过。

## 15. 当前延期项

- Document Reader：缺少稳定的整文与分页 API，不用 Chunk Preview 模拟。
- Compass Logo：当前字母标记继续作为占位，正式资产需单独评审，不生成或采用未经批准的第三方图标。
