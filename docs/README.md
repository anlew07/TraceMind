# TraceMind 文档入口

本目录只保留需要长期维护的当前文档、检索评测资产和版本记录。判断实现时以源代码为准，文档用于解释当前边界和操作方式，Git 历史负责保存开发过程。

## 我想了解什么

- [项目总览与快速开始](../README.md)：项目定位、主要能力、核心流程和首次启动。
- [当前产品](product/TraceMind-Product.md)：产品能力、使用闭环、数据边界和非目标。
- [开发指南](development.md)：本地环境、服务启动、配置、迁移、测试和数据维护。
- [UI / UX 设计](design/TraceMind-UI-Design.md)：当前路由、信息层级、页面交互和视觉约束。
- [Knowledge 设计](design/TraceMind-Knowledge-Design.md)：KnowledgeEntry、Evidence Snapshot、验证、索引和 Knowledge Map。
- [Reranker 指南](reranker.md)：可选本地 Cross-Encoder 的部署、资源边界和降级语义。
- [Retrieval Evaluation](retrieval-evaluation/README.md)：固定评测集、指标、隔离要求、运行方式和实验记录规范。
- [v1.1.0 Release Notes](releases/v1.1.0.md)：当前版本变更、升级说明和发布验证。
- [v1.0.0 Release Notes](releases/v1.0.0.md)：首个稳定版本的历史记录。

## 文档职责

- `README.md` 负责对外总览，不承载全部工程细节。
- `docs/product/` 只描述当前产品，不记录阶段计划。
- `docs/design/` 只保留需要持续约束实现的 UI 与 Knowledge 设计。
- `docs/retrieval-evaluation/` 保存可复现的长期评测说明及固定资产。
- `docs/releases/` 保存历史版本事实；旧版本内容不能替代当前代码事实。

不再为单次迁移、阶段、里程碑、临时实验或开发日志创建长期 Markdown。需要长期保留的新信息应合并到上述文档；仅在出现跨版本且需要持续约束的重大决策时，再评估是否需要独立记录。
