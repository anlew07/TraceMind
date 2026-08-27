# TraceMind 文档入口

本目录将文档分为 Current Documentation 与 Historical Documentation。阅读当前产品时，不要从文件名中的旧版本号、阶段编号或历史计划推断现有能力。

## 事实优先级

```text
Source Code
→ Current Documentation
→ Historical Documentation
```

代码和数据库迁移是实现事实；Current Docs 解释当前代码；Historical Docs 只记录过去的需求、决策、迁移、实验或发布状态。若三者冲突，按上述顺序判断，并修正 Current Docs。

## 推荐阅读顺序

1. [项目 README](../README.md)：产品概览、主要能力和快速开始。
2. [当前产品](product/TraceMind-Product.md)：TraceMind 当前是什么、用户流程与产品边界。
3. [当前架构](architecture/TraceMind-Architecture.md)：生产数据流、RAG、检索和恢复边界。
4. [开发指南](development.md)：本地启动、检查、迁移和集成测试说明。
5. [当前 UI 设计](design/TraceMind-UI-Design.md)：真实路由、界面行为和响应式规则。
6. [Knowledge 设计](design/TraceMind-Knowledge-Design.md)：知识条目、验证、索引与知识图谱。
7. [Retrieval Evaluation](retrieval-evaluation/README.md)：固定评测资产、隔离要求和复现方式。

## Current Documentation 职责

- `README.md`：面向新用户的产品入口，不承载全部内部实现细节。
- `docs/README.md`：文档导航、状态和事实优先级。
- `docs/product/TraceMind-Product.md`：稳定的当前产品说明，不使用版本号作为文件名。
- `docs/architecture/TraceMind-Architecture.md`：唯一正式的当前系统架构。
- `docs/development.md`：开发、运行和验证操作指南。
- `design.md`：仅定义 Visual DNA；不作为路由或功能事实来源。
- `docs/design/TraceMind-UI-Design.md`：当前 UI、路由和交互事实。
- `docs/design/TraceMind-Knowledge-Design.md`：当前 Knowledge 数据与检索设计。
- `docs/design/local-data-durability.md`：Archive、Restore、Audit、Repair 与 Rebuild 的详细不变量。
- `docs/document-ingestion.md`、`docs/document-parsing.md`、`docs/reranker.md`：专项工程指南。
- `docs/retrieval-evaluation/`：固定检索评测说明与语料。

## Historical Documentation

- `docs/releases/`：各版本发布时的能力、验证与限制。
- `docs/experiments/`：特定时间、数据集和配置下的实验记录；不能自动代表当前效果。
- `docs/architecture/adr/`：长期架构决策及其后果。
- `docs/architecture/archive/`：已退出当前实现的架构或评测证据。
- `docs/archive/`：早期需求、旧产品说明、迁移计划和开发过程日志。

Archive 中的资料不能作为当前产品能力判断依据。旧文档中写着“未实现”的能力可能已在后续版本实现；相反，旧实验中出现过的能力也可能已经删除。判断当前状态时必须回到 Current Docs 和代码。
