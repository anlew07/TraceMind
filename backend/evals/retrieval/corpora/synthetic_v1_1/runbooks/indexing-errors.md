# LumenDesk Indexing Error Runbook

本文件完全虚构，仅作为检索评测中的故障手册。

## IDX-1042 Generation 数量不一致

告警 IDX-1042 表示写入 Qdrant 的 point count 与本次解析得到的 chunk count 不一致。发布流程必须保持旧 active generation，不得激活数量不完整的新 generation。

排查顺序是：确认解析块数量、读取 attempt_generation、按该 generation 精确统计 Qdrant points、检查批量 upsert 日志。不要删除整个 Collection，也不要修改数据库计数来绕过验证。

修复方式是删除失败 attempt_generation 的 points，然后对同一文档版本发起 force rebuild。重建成功并完成数量校验后，服务才允许切换 active generation。

如果清理请求失败，记录 orphan generation 并交给恢复任务重试。旧 active generation 仍可服务查询，因此清理失败与发布失败必须分开处理。

## IDX-2077 原始文件不可用

告警 IDX-2077 表示数据库存在文档版本，但 storage_path 对应的原始文件无法读取。由于原始文件属于 source of truth，系统不能仅凭旧 chunk 或向量点重新发布索引。

首先校验备份中的文件哈希和文档版本 ID。如果备份文件正确，恢复到相同 storage_path 后重新解析；如果没有可信原文件，应停止恢复并报告数据缺口。

禁止从 Qdrant payload 拼接出所谓原始文件。Payload 可能截断格式信息，也不能证明与数据库当前版本一致。

## IDX-3301 Embedding 服务繁忙

告警 IDX-3301 对应瞬时错误 EMBEDDING_BUSY。当前重试策略最多尝试四次，基础延迟 250 ms，使用 capped exponential backoff 和 20% jitter。

如果达到最大尝试次数，索引状态标记为 failed，并保留之前的 active generation。操作人员应检查模型进程资源，再显式发起重建，而不是无限重试。

INVALID_SCOPE、UNSUPPORTED_FORMAT 和 CORRUPT_SOURCE 属于永久错误，不进入自动重试。旧版策略曾错误重试这些错误，当前实现已经禁止这种行为。

## IDX-4404 Collection Schema 不兼容

告警 IDX-4404 表示 Dense vector dimension、distance、Sparse vector 或 payload index 与当前配置不一致。服务必须拒绝在不兼容 Collection 上继续 upsert。

修复时创建新的 Collection，按原文件和 PostgreSQL 元数据重建，再通过 generation 发布。不得原地猜测性修改现有向量维度，也不得复用被其他评测数据污染的 BM25 Collection。
