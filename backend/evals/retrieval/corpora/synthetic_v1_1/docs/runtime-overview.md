# LumenDesk Runtime Overview

这是一份完全虚构的运行时说明，仅用于 TraceMind 检索评测。

## Generation 发布协议

LumenDesk 的索引发布使用 generation switch。新一代向量必须全部写入并完成数量校验后，数据库才把 active_generation 指向新值。查询只读取 active_generation，因此失败的构建不会暴露半成品索引。

旧 generation 在新 generation 激活后进入清理队列。清理失败不会回滚已经成功的发布，但会留下可审计的 orphan generation。恢复任务按 generation 标识重试删除，而不是按知识库执行无边界清理。

数据库记录和原始上传文件共同构成 source of truth。向量点、解析块和任务状态都是 derived state，可以从原始文件与数据库元数据重新构建。

重建时必须保持 document_id 不变，同时生成新的 index_generation。这样引用可以继续指向稳定文档，而检索只切换到已经完整发布的新索引。

## 检索阶段

查询先生成 Qwen3 dense embedding，同时把原始查询交给 Qdrant 的 BM25 sparse vector。Dense 和 Sparse 分支分别预取候选，应用层使用 deterministic reciprocal rank fusion 合并排名。

RRF 只使用分支内名次，不把 cosine score 与 BM25 score 直接相加。相同文档块在两个分支都出现时会累积两项倒数排名分数；最终排序还使用稳定的 point id 作为平分条件。

Cross-Encoder Reranker 是可选阶段。它只能重排 Hybrid 已经召回的候选，不能找回候选池中不存在的证据。Reranker 不可用时，系统保留原始 Hybrid 顺序并记录 fallback。

## 流式回答与引用

回答通过 SSE 逐段发送。检索完成后先生成 evidence source id，模型只能引用当前请求中真实存在的 source id。流式引用守卫会丢弃不存在的 Citation 标记。

Execution Trace 记录路由、改写、检索、重排、证据整理和生成阶段的状态与耗时。它是可观察的执行元数据，不是模型的 Chain of Thought，也不保存隐藏推理过程。

当检索没有返回足够证据时，完整 RAG Pipeline 以 terminal_status=no_answer 结束。这个状态属于回答链路判断，不能由 Retrieval-only 的负样本空结果率替代。

## 恢复边界

备份必须包含 PostgreSQL 业务数据和原始文件。Redis 中的任务状态与 Qdrant Collection 不作为唯一恢复来源；恢复后可以重新解析并发布新的 generation。

恢复验证至少检查文件哈希、文档版本、active generation 和引用定位。任何验证失败都应停止切换，不得用不完整恢复覆盖当前可用数据。
