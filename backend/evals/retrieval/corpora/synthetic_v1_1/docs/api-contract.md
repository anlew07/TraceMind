# LumenDesk Search API Contract

This fictional API reference exists only for retrieval evaluation.

## Hybrid search request

POST /api/v2/workspaces/{workspace_id}/search/hybrid accepts query, limit, language, and optional document_id. The limit must be between 1 and 20. An explicit document_id narrows retrieval before ranking.

The response field ranking_mode is hybrid. The score is an application-side reciprocal-rank-fusion value and is not a calibrated probability. Clients must not compare the score with a cosine threshold.

The response includes document_name, relative_path, section_title, start_line, end_line, and content. A source is valid only when these fields come from an indexed payload; clients must never invent a missing path or line number.

## Reranked search request

POST /api/v2/workspaces/{workspace_id}/search/reranked first obtains Hybrid candidates and then calls the local Cross-Encoder. The requested output limit cannot exceed rerank_candidate_limit.

The reranked score is a raw model logit, not a probability. retrieval_score preserves the preceding RRF score, retrieval_rank preserves the Hybrid position, and rerank_score contains the Cross-Encoder output.

If the local reranker is unavailable, the full RAG workflow may fall back to Hybrid. The standalone reranked search endpoint instead reports service unavailable so diagnostic callers can distinguish fallback from a successful rerank.

## Streaming events

POST /api/v2/workspaces/{workspace_id}/rag/stream returns Server-Sent Events. Pipeline events report phase and status, source events carry evidence metadata, token events carry answer text, and a final done event carries terminal_status.

The done event may include query_rewrite_mode, query_rewrite_latency_ms, retrieval_query, embedding_latency_ms, qdrant_latency_ms, fusion_latency_ms, rerank_latency_ms, dense_candidate_count, and sparse_candidate_count.

terminal_status has two stable values: completed and no_answer. Only the complete RAG pipeline can be evaluated for No-Answer Accuracy because retrieval alone does not decide whether returned chunks provide enough answer evidence.

## Error semantics

Invalid limits return HTTP 422. A missing workspace returns HTTP 404. Vector or embedding outages return HTTP 503 without exposing provider exception details.

Error code SEARCH_SCOPE_CONFLICT means document_id and an explicit path in the query resolve to different documents. The caller must correct the scope instead of silently broadening the search.

Error code RERANKER_CANDIDATE_LIMIT means the requested output exceeds the configured candidate pool. Increasing the output limit without increasing the candidate pool is rejected deterministically.
