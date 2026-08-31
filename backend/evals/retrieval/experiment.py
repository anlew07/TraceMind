from __future__ import annotations

import argparse
import asyncio
import json
import mimetypes
import sys
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter
from typing import Any, cast
from uuid import UUID

from fastapi import UploadFile
from starlette.datastructures import Headers

from app.core.config import Settings, get_settings
from app.db.session import Database
from app.embedding import SentenceTransformerEmbeddingProvider, validate_embeddings
from app.indexing import QdrantGateway, VectorSearchHit
from app.indexing.factory import build_qdrant_gateway
from app.integrations.qdrant import QdrantClient
from app.llm.factory import create_chat_model
from app.rag.query_rewrite import rewrite_retrieval_query
from app.reranker import HttpRerankerProvider
from app.schemas.knowledge_base import KnowledgeBaseCreate
from app.services.conversation import ConversationTurn
from app.services.document import DocumentService
from app.services.document_indexing import DocumentIndexingService, SemanticSearchResult
from app.services.document_parsing import DocumentParsingService
from app.services.document_reranking import DocumentRerankingService
from app.services.knowledge_base import KnowledgeBaseService
from app.storage.local import LocalFileStorage
from evals.retrieval.v1_1_dataset import (
    load_cases_v1_1,
    load_conversation_cases_v1_1,
    validate_dataset_v1_1,
)
from evals.retrieval.v1_1_metrics import (
    compare_summaries_v1_1,
    evaluate_case_v1_1,
    summarize_v1_1,
)
from evals.retrieval.v1_1_models import (
    CaseEvaluationV11,
    EvaluationSummaryV11,
    RetrievalCaseV11,
    RetrievalHitV11,
    RetrievalModeV11,
    SplitV11,
    StageLatencyV11,
)

EVAL_PREFIX = "tracemind_retrieval_eval_v1_1_"
DEFAULT_DATASET = Path("evals/retrieval/datasets/synthetic_retrieval_v1_1.jsonl")
DEFAULT_MANIFEST = Path("evals/retrieval/datasets/synthetic_corpus_manifest_v1_1.json")
DEFAULT_CORPUS = Path("evals/retrieval/corpora/synthetic_v1_1")
DEFAULT_CONVERSATIONS = Path("evals/retrieval/datasets/conversation_rewrite_v1_1.jsonl")
_QUERY_EMBEDDING_CACHE: dict[tuple[str, str], list[float]] = {}


class EvalCachingEmbeddingProvider:
    def __init__(self, provider: SentenceTransformerEmbeddingProvider) -> None:
        self.provider = provider

    @property
    def model_name(self) -> str:
        return self.provider.model_name

    @property
    def dimension(self) -> int:
        return self.provider.dimension

    def warmup(self) -> None:
        self.provider.warmup()

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self.provider.embed_documents(texts)

    def embed_query(self, text: str) -> list[float]:
        key = (self.model_name, text)
        cached = _QUERY_EMBEDDING_CACHE.get(key)
        if cached is None:
            cached = self.provider.embed_query(text)
            _QUERY_EMBEDDING_CACHE[key] = cached
        return list(cached)


def _settings_with_overrides(
    base: Settings,
    *,
    collection: str,
    threshold: float,
    dense_prefetch: int,
    sparse_prefetch: int,
    top_k: int,
    rerank_candidates: int,
) -> Settings:
    if collection == base.qdrant_collection_name or not collection.startswith(EVAL_PREFIX):
        raise ValueError(f"evaluation collection must start with {EVAL_PREFIX!r}")
    if not 0 < threshold <= 1:
        raise ValueError("threshold must be greater than zero and at most one")
    if min(dense_prefetch, sparse_prefetch, top_k, rerank_candidates) <= 0:
        raise ValueError("retrieval limits must be greater than zero")
    if top_k > 10:
        raise ValueError("top_k must not exceed 10")
    if rerank_candidates > base.reranker_max_candidates:
        raise ValueError("rerank_candidates exceeds configured maximum")
    if rerank_candidates < top_k:
        raise ValueError("rerank_candidates must not be smaller than top_k")
    return base.model_copy(
        update={
            "qdrant_collection_name": collection,
            "semantic_search_score_threshold": threshold,
            "hybrid_dense_prefetch_limit": dense_prefetch,
            "hybrid_sparse_prefetch_limit": sparse_prefetch,
            "rag_retrieval_limit": top_k,
            "rag_rerank_candidate_limit": rerank_candidates,
        }
    )


def _storage(settings: Settings) -> LocalFileStorage:
    return LocalFileStorage(
        settings.document_storage_root,
        max_size=settings.document_max_file_size_bytes,
        chunk_size=settings.document_upload_chunk_size_bytes,
    )


def _embedding_provider(settings: Settings) -> EvalCachingEmbeddingProvider:
    return EvalCachingEmbeddingProvider(
        SentenceTransformerEmbeddingProvider(
            settings.embedding_model_name,
            settings.embedding_dimension,
            settings.embedding_batch_size,
            settings.resolved_query_embedding_device,
        )
    )


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n",
        encoding="utf-8",
    )


def _load_state(path: Path) -> dict[str, Any]:
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"evaluation state could not be loaded: {path}") from exc
    collection = state.get("collection")
    name = state.get("knowledge_base_name")
    if not isinstance(collection, str) or not collection.startswith(EVAL_PREFIX):
        raise ValueError("state does not own an evaluation collection")
    if not isinstance(name, str) or not name.startswith(EVAL_PREFIX):
        raise ValueError("state does not own an evaluation knowledge base")
    return cast(dict[str, Any], state)


async def prepare_fixture(
    *,
    corpus_root: Path,
    dataset: Path,
    manifest_path: Path,
    state_path: Path,
    collection: str,
) -> None:
    cases, manifest = validate_dataset_v1_1(corpus_root, dataset, manifest_path)
    base = get_settings()
    settings = _settings_with_overrides(
        base,
        collection=collection,
        threshold=base.semantic_search_score_threshold,
        dense_prefetch=base.hybrid_dense_prefetch_limit,
        sparse_prefetch=base.hybrid_sparse_prefetch_limit,
        top_k=base.rag_retrieval_limit,
        rerank_candidates=base.rag_rerank_candidate_limit,
    )
    if await asyncio.to_thread(state_path.exists):
        raise ValueError("state path already exists; cleanup or choose another run ID")
    corpus_resolved, dataset_resolved = await asyncio.gather(
        asyncio.to_thread(corpus_root.resolve),
        asyncio.to_thread(dataset.resolve),
    )
    database = Database(settings)
    qdrant = QdrantClient(settings)
    gateway = build_qdrant_gateway(settings, qdrant.client)
    provider = _embedding_provider(settings)
    if await qdrant.client.collection_exists(collection):
        raise ValueError("evaluation collection already exists")
    run_id = collection.removeprefix(EVAL_PREFIX)
    state: dict[str, Any] = {
        "schema_version": "1.1",
        "run_id": run_id,
        "created_at": datetime.now(UTC).isoformat(),
        "collection": collection,
        "knowledge_base_name": f"{EVAL_PREFIX}{run_id}",
        "knowledge_base_id": None,
        "corpus_kind": manifest.corpus_kind,
        "corpus_root": str(corpus_resolved),
        "dataset": str(dataset_resolved),
        "documents": [],
        "case_count": len(cases),
    }
    _write_json(state_path, state)
    try:
        async with database.session_factory() as session:
            knowledge_base = await KnowledgeBaseService(session).create(
                KnowledgeBaseCreate(
                    name=state["knowledge_base_name"],
                    description="TraceMind Retrieval Evaluation v1.1 isolated fixture",
                )
            )
            state["knowledge_base_id"] = str(knowledge_base.id)
            _write_json(state_path, state)
            storage = _storage(settings)
            document_service = DocumentService(
                session,
                storage,
                set(settings.document_allowed_extensions),
                index_gateway=gateway,
            )
            parsing_service = DocumentParsingService(session, storage, settings)
            indexing_service = DocumentIndexingService(
                session,
                settings,
                provider,
                gateway,
            )
            for item in manifest.files:
                source = (corpus_root / item.relative_path).resolve()
                file_handle = source.open("rb")
                upload = UploadFile(
                    file=file_handle,
                    filename=source.name,
                    headers=Headers(
                        {"content-type": mimetypes.guess_type(source.name)[0] or "text/plain"}
                    ),
                )
                try:
                    imported = await document_service.import_document(
                        knowledge_base.id,
                        upload,
                        relative_path=item.relative_path,
                    )
                finally:
                    await upload.close()
                version = imported.record.latest_version
                if not await parsing_service.parse_version(version.id, enqueue_index=False):
                    raise RuntimeError(f"failed to parse {item.relative_path}")
                if not await indexing_service.index_version(version.id):
                    raise RuntimeError(f"failed to index {item.relative_path}")
                state["documents"].append(
                    {
                        "relative_path": item.relative_path,
                        "document_id": str(imported.record.document.id),
                        "version_id": str(version.id),
                    }
                )
                _write_json(state_path, state)
    finally:
        await qdrant.close()
        await database.close()


def _hit_from_vector(hit: VectorSearchHit, rank: int) -> RetrievalHitV11:
    payload = hit.payload
    return RetrievalHitV11(
        rank=rank,
        score=hit.score,
        retrieval_id=str(payload["chunk_id"]),
        source_type=str(payload.get("source_type", "document")),
        document_name=str(payload["document_name"]),
        relative_path=str(payload.get("relative_path") or payload["document_name"]),
        section_title=str(payload["section_title"]) if payload.get("section_title") else None,
        start_line=int(payload["start_line"]) if payload.get("start_line") is not None else None,
        end_line=int(payload["end_line"]) if payload.get("end_line") is not None else None,
        content=str(payload["content"]),
        retrieval_score=hit.score,
        retrieval_rank=rank,
    )


def _hit_from_result(result: SemanticSearchResult, rank: int) -> RetrievalHitV11:
    return RetrievalHitV11(
        rank=rank,
        score=result.score,
        retrieval_id=str(result.retrieval_id),
        source_type="document",
        document_name=result.document_name,
        relative_path=result.relative_path,
        section_title=result.section_title,
        start_line=result.start_line,
        end_line=result.end_line,
        content=result.content,
        retrieval_score=result.retrieval_score,
        rerank_score=result.rerank_score,
        retrieval_rank=result.retrieval_rank,
    )


async def _evaluate_query(
    *,
    case: RetrievalCaseV11,
    query: str,
    mode: RetrievalModeV11,
    knowledge_base_id: UUID,
    document_ids: dict[str, UUID],
    service: DocumentIndexingService,
    gateway: QdrantGateway,
    provider: EvalCachingEmbeddingProvider,
    reranking_service: DocumentRerankingService | None,
    settings: Settings,
    top_k: int,
    rerank_candidates: int,
) -> CaseEvaluationV11:
    started_at = perf_counter()
    embedding_ms = 0.0
    qdrant_ms = 0.0
    fusion_ms = 0.0
    rerank_ms = 0.0
    dense_count = 0
    sparse_count = 0
    hits: list[RetrievalHitV11] = []
    error: str | None = None
    try:
        explicit_document_id = (
            document_ids[case.document_scope] if case.document_scope is not None else None
        )
        prepared_query = await service.prepare_retrieval_query(
            knowledge_base_id,
            query,
            document_id=explicit_document_id,
        )
        active = await service.list_active_generations(
            knowledge_base_id,
            document_id=prepared_query.scoped_document_id,
        )
        generations = [item.generation for item in active]
        if mode in {"dense", "bm25"}:
            await gateway.ensure_collection()
            if mode == "dense":
                embed_started = perf_counter()
                vector = await asyncio.to_thread(
                    provider.embed_query,
                    prepared_query.semantic_query,
                )
                validate_embeddings([vector], dimension=provider.dimension)
                embedding_ms = (perf_counter() - embed_started) * 1_000
                branch = await gateway.dense_search_with_diagnostics(
                    vector,
                    knowledge_base_id=knowledge_base_id,
                    generations=generations,
                    limit=max(top_k, settings.hybrid_dense_prefetch_limit),
                    language=case.language_filter,
                    document_id=prepared_query.scoped_document_id,
                    score_threshold=settings.semantic_search_score_threshold,
                    excluded_chunk_types=("heading",),
                )
                dense_count = branch.candidate_count
            else:
                branch = await gateway.sparse_search_with_diagnostics(
                    prepared_query.semantic_query,
                    knowledge_base_id=knowledge_base_id,
                    generations=generations,
                    limit=max(top_k, settings.hybrid_sparse_prefetch_limit),
                    language=case.language_filter,
                    document_id=prepared_query.scoped_document_id,
                    excluded_chunk_types=("heading",),
                )
                sparse_count = branch.candidate_count
            qdrant_ms = branch.qdrant_latency_ms
            hits = [_hit_from_vector(hit, rank) for rank, hit in enumerate(branch.hits[:top_k], 1)]
        else:
            candidate_limit = rerank_candidates if mode == "hybrid-reranker" else top_k
            prepared = await service.prepare_hybrid_search(
                knowledge_base_id,
                query=prepared_query.semantic_query,
                limit=candidate_limit,
                language=case.language_filter,
                document_id=prepared_query.scoped_document_id,
                prepared_query=prepared_query,
            )
            result = await service.execute_hybrid_search(prepared)
            embedding_ms = result.embedding_latency_ms
            qdrant_ms = result.qdrant_latency_ms
            fusion_ms = result.fusion_latency_ms
            dense_count = result.dense_candidate_count
            sparse_count = result.sparse_candidate_count
            ranked = result.items
            if mode == "hybrid-reranker":
                if reranking_service is None:
                    raise RuntimeError("reranker is unavailable")
                rerank_started = perf_counter()
                ranked = await reranking_service.rerank(
                    prepared_query.semantic_query,
                    ranked,
                    limit=min(top_k, len(ranked)),
                )
                rerank_ms = (perf_counter() - rerank_started) * 1_000
            hits = [_hit_from_result(item, rank) for rank, item in enumerate(ranked[:top_k], 1)]
    except Exception as exc:
        error = type(exc).__name__
    total_ms = (perf_counter() - started_at) * 1_000
    return evaluate_case_v1_1(
        case,
        hits,
        mode=mode,
        latency=StageLatencyV11(
            embedding_ms=embedding_ms,
            qdrant_ms=qdrant_ms,
            fusion_ms=fusion_ms,
            rerank_ms=rerank_ms,
            total_ms=total_ms,
        ),
        dense_candidate_count=dense_count,
        sparse_candidate_count=sparse_count,
        error=error,
    )


async def run_evaluation(
    *,
    state_path: Path,
    dataset_path: Path,
    mode: RetrievalModeV11,
    split: SplitV11,
    output: Path,
    top_k: int,
    threshold: float,
    dense_prefetch: int,
    sparse_prefetch: int,
    rerank_candidates: int,
    repeat: int = 1,
) -> EvaluationSummaryV11:
    state = _load_state(state_path)
    cases = [case for case in load_cases_v1_1(dataset_path) if case.split == split]
    base = get_settings()
    settings = _settings_with_overrides(
        base,
        collection=state["collection"],
        threshold=threshold,
        dense_prefetch=dense_prefetch,
        sparse_prefetch=sparse_prefetch,
        top_k=top_k,
        rerank_candidates=rerank_candidates,
    )
    database = Database(settings)
    qdrant = QdrantClient(settings)
    gateway = build_qdrant_gateway(settings, qdrant.client)
    provider = _embedding_provider(settings)
    reranker_provider = (
        HttpRerankerProvider(
            settings.reranker_base_url,
            read_timeout_seconds=settings.reranker_timeout_seconds,
            max_candidates=settings.reranker_max_candidates,
        )
        if mode == "hybrid-reranker"
        else None
    )
    reranking_service = (
        DocumentRerankingService(reranker_provider) if reranker_provider is not None else None
    )
    repetitions: list[list[CaseEvaluationV11]] = []
    try:
        provider.warmup()
        async with database.session_factory() as session:
            service = DocumentIndexingService(session, settings, provider, gateway)
            document_ids = {
                item["relative_path"]: UUID(item["document_id"]) for item in state["documents"]
            }
            if cases:
                await _evaluate_query(
                    case=cases[0],
                    query=cases[0].query,
                    mode=mode,
                    knowledge_base_id=UUID(state["knowledge_base_id"]),
                    document_ids=document_ids,
                    service=service,
                    gateway=gateway,
                    provider=provider,
                    reranking_service=reranking_service,
                    settings=settings,
                    top_k=top_k,
                    rerank_candidates=rerank_candidates,
                )
            for _ in range(repeat):
                current_repetition: list[CaseEvaluationV11] = []
                for case in cases:
                    evaluation = await _evaluate_query(
                        case=case,
                        query=case.query,
                        mode=mode,
                        knowledge_base_id=UUID(state["knowledge_base_id"]),
                        document_ids=document_ids,
                        service=service,
                        gateway=gateway,
                        provider=provider,
                        reranking_service=reranking_service,
                        settings=settings,
                        top_k=top_k,
                        rerank_candidates=rerank_candidates,
                    )
                    current_repetition.append(evaluation)
                repetitions.append(current_repetition)
    finally:
        if reranker_provider is not None:
            await reranker_provider.close()
        await qdrant.close()
        await database.close()
    run_id = output.name
    config: dict[str, str | int | float | bool] = {
        "dataset": str(dataset_path),
        "collection": state["collection"],
        "embedding_model": settings.embedding_model_name,
        "reranker_model": settings.reranker_model_name,
        "top_k": top_k,
        "semantic_threshold": threshold,
        "dense_prefetch": dense_prefetch,
        "sparse_prefetch": sparse_prefetch,
        "rerank_candidates": rerank_candidates,
        "repeat": repeat,
    }
    summary = summarize_v1_1(
        run_id=run_id,
        mode=mode,
        split=split,
        config=config,
        evaluations=repetitions[-1] if repetitions else [],
    )
    _write_json(output / "summary.json", summary.model_dump(mode="json"))
    (output / "summary.md").write_text(render_summary(summary), encoding="utf-8")
    if len(repetitions) > 1:
        summaries = [
            summarize_v1_1(
                run_id=f"{run_id}-repeat-{index + 1}",
                mode=mode,
                split=split,
                config=config,
                evaluations=items,
            )
            for index, items in enumerate(repetitions)
        ]
        first_rankings = {
            item.case_id: [hit.retrieval_id for hit in item.hits] for item in repetitions[0]
        }
        ranking_checks = [
            first_rankings[item.case_id] == [hit.retrieval_id for hit in item.hits]
            for items in repetitions[1:]
            for item in items
        ]
        _write_json(
            output / "stability.json",
            {
                "repeat_count": len(repetitions),
                "ranking_comparison_count": len(ranking_checks),
                "exact_ranking_match_rate": (
                    sum(ranking_checks) / len(ranking_checks) if ranking_checks else 1.0
                ),
                "metric_values": {
                    name: [item.metrics[name].value for item in summaries]
                    for name in summary.metrics
                },
                "total_latency_p95_ms": [item.latency["total"].p95 for item in summaries],
            },
        )
    return summary


def render_summary(summary: EvaluationSummaryV11) -> str:
    lines = [
        f"# {summary.run_id}",
        "",
        f"- mode: `{summary.mode}`",
        f"- split: `{summary.split}`",
        (
            f"- cases: {summary.case_count} "
            f"(answerable={summary.answerable_count}, negative={summary.negative_count})"
        ),
        "",
        "| Metric | Value | Query count | Success count |",
        "| --- | ---: | ---: | ---: |",
    ]
    for name, metric in summary.metrics.items():
        lines.append(
            f"| {name} | {metric.value:.4f} | {metric.query_count} | "
            f"{metric.success_count if metric.success_count is not None else '-'} |"
        )
    lines.extend(
        [
            "",
            "| Stage | Mean ms | P50 ms | P95 ms | Query count |",
            "| --- | ---: | ---: | ---: | ---: |",
        ]
    )
    for name, latency in summary.latency.items():
        lines.append(
            f"| {name} | {latency.mean:.2f} | {latency.p50:.2f} | "
            f"{latency.p95:.2f} | {latency.query_count} |"
        )
    lines.extend(["", "## Failed or negative queries", ""])
    for case in summary.cases:
        hit_at_5 = case.metrics.get("hit_at_5")
        if hit_at_5 == 0 or not case.answerable or case.error:
            lines.append(
                f"- `{case.case_id}` hit@5={hit_at_5}, returned={len(case.hits)}, "
                f"error={case.error or '-'}"
            )
    lines.append("")
    return "\n".join(lines)


async def run_rewrite_evaluation(
    *,
    state_path: Path,
    retrieval_dataset: Path,
    conversation_dataset: Path,
    split: str,
    output: Path,
) -> None:
    state = _load_state(state_path)
    cases = {case.id: case for case in load_cases_v1_1(retrieval_dataset)}
    conversations = [
        row for row in load_conversation_cases_v1_1(conversation_dataset) if row.split == split
    ]
    base = get_settings()
    settings = _settings_with_overrides(
        base,
        collection=state["collection"],
        threshold=base.semantic_search_score_threshold,
        dense_prefetch=base.hybrid_dense_prefetch_limit,
        sparse_prefetch=base.hybrid_sparse_prefetch_limit,
        top_k=base.rag_retrieval_limit,
        rerank_candidates=base.rag_rerank_candidate_limit,
    )
    if not settings.rag_llm_enabled:
        raise ValueError("Query Rewrite requires the configured chat model")
    database = Database(settings)
    qdrant = QdrantClient(settings)
    gateway = build_qdrant_gateway(settings, qdrant.client)
    provider = _embedding_provider(settings)
    model = create_chat_model(settings)
    rows: list[dict[str, Any]] = []
    try:
        provider.warmup()
        async with database.session_factory() as session:
            service = DocumentIndexingService(session, settings, provider, gateway)
            document_ids = {
                item["relative_path"]: UUID(item["document_id"]) for item in state["documents"]
            }
            for item in conversations:
                target = cases[item.retrieval_case_id]
                history = tuple(
                    ConversationTurn(user=turn["user"], assistant=turn["assistant"])
                    for turn in item.history
                )
                rewrite = await rewrite_retrieval_query(
                    model,
                    query=item.query,
                    history=history,
                    timeout_seconds=settings.query_rewrite_timeout_seconds,
                    max_query_chars=settings.query_rewrite_max_query_chars,
                )
                original = await _evaluate_query(
                    case=target,
                    query=item.query,
                    mode="hybrid",
                    knowledge_base_id=UUID(state["knowledge_base_id"]),
                    document_ids=document_ids,
                    service=service,
                    gateway=gateway,
                    provider=provider,
                    reranking_service=None,
                    settings=settings,
                    top_k=settings.rag_retrieval_limit,
                    rerank_candidates=settings.rag_rerank_candidate_limit,
                )
                rewritten = await _evaluate_query(
                    case=target,
                    query=rewrite.query,
                    mode="hybrid",
                    knowledge_base_id=UUID(state["knowledge_base_id"]),
                    document_ids=document_ids,
                    service=service,
                    gateway=gateway,
                    provider=provider,
                    reranking_service=None,
                    settings=settings,
                    top_k=settings.rag_retrieval_limit,
                    rerank_candidates=settings.rag_rerank_candidate_limit,
                )
                normalized = rewrite.query.lower()
                expected_present = any(term.lower() in normalized for term in item.expected_terms)
                forbidden_present = any(term.lower() in normalized for term in item.forbidden_terms)
                original_hit = float(original.metrics["hit_at_5"] or 0)
                rewritten_hit = float(rewritten.metrics["hit_at_5"] or 0)
                rows.append(
                    {
                        "id": item.id,
                        "query": item.query,
                        "rewritten_query": rewrite.query,
                        "rewrite_mode": rewrite.mode,
                        "rewrite_latency_ms": rewrite.latency_ms,
                        "fallback_reason": rewrite.fallback_reason,
                        "expected_term_present": expected_present,
                        "forbidden_term_present": forbidden_present,
                        "original_hit_at_5": original_hit,
                        "rewritten_hit_at_5": rewritten_hit,
                        "retrieval_delta": rewritten_hit - original_hit,
                        "semantic_drift": forbidden_present or rewritten_hit < original_hit,
                        "original_ranking": [hit.relative_path for hit in original.hits],
                        "rewritten_ranking": [hit.relative_path for hit in rewritten.hits],
                    }
                )
    finally:
        await qdrant.close()
        await database.close()
    payload = {
        "schema_version": "1.1",
        "split": split,
        "query_count": len(rows),
        "improved_queries": sum(row["retrieval_delta"] > 0 for row in rows),
        "worsened_queries": sum(row["retrieval_delta"] < 0 for row in rows),
        "unchanged_queries": sum(row["retrieval_delta"] == 0 for row in rows),
        "semantic_drift_queries": sum(row["semantic_drift"] for row in rows),
        "cases": rows,
    }
    _write_json(output / "rewrite.json", payload)


async def cleanup_fixture(state_path: Path) -> None:
    state = _load_state(state_path)
    base = get_settings()
    settings = _settings_with_overrides(
        base,
        collection=state["collection"],
        threshold=base.semantic_search_score_threshold,
        dense_prefetch=base.hybrid_dense_prefetch_limit,
        sparse_prefetch=base.hybrid_sparse_prefetch_limit,
        top_k=base.rag_retrieval_limit,
        rerank_candidates=base.rag_rerank_candidate_limit,
    )
    database = Database(settings)
    qdrant = QdrantClient(settings)
    gateway = build_qdrant_gateway(settings, qdrant.client)
    try:
        async with database.session_factory() as session:
            service = DocumentService(
                session,
                _storage(settings),
                set(settings.document_allowed_extensions),
                index_gateway=gateway,
            )
            knowledge_base_id = UUID(state["knowledge_base_id"])
            for item in state["documents"]:
                await service.delete_document(knowledge_base_id, UUID(item["document_id"]))
            await KnowledgeBaseService(session).delete(knowledge_base_id)
        if await qdrant.client.collection_exists(state["collection"]):
            await qdrant.client.delete_collection(state["collection"])
        state["cleaned_at"] = datetime.now(UTC).isoformat()
        _write_json(state_path, state)
    finally:
        await qdrant.close()
        await database.close()


def _load_summary(path: Path) -> EvaluationSummaryV11:
    return EvaluationSummaryV11.model_validate_json(path.read_text(encoding="utf-8"))


async def run_matrix(
    *,
    state_path: Path,
    dataset_path: Path,
    plan_path: Path,
    output_root: Path,
    resume: bool,
) -> None:
    try:
        plan_text = await asyncio.to_thread(plan_path.read_text, encoding="utf-8")
        plan = json.loads(plan_text)
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("matrix plan could not be loaded") from exc
    if not isinstance(plan, list) or not 1 <= len(plan) <= 20:
        raise ValueError("matrix plan must contain between 1 and 20 configurations")
    for raw in plan:
        if not isinstance(raw, dict) or not isinstance(raw.get("name"), str):
            raise ValueError("every matrix configuration requires a name")
        name = raw["name"]
        if not name.replace("-", "").replace("_", "").isalnum():
            raise ValueError("matrix configuration names must be path-safe")
        if resume and (output_root / name / "summary.json").is_file():
            continue
        await run_evaluation(
            state_path=state_path,
            dataset_path=dataset_path,
            mode=raw.get("mode", "hybrid"),
            split=raw.get("split", "dev"),
            output=output_root / name,
            top_k=int(raw.get("top_k", 5)),
            threshold=float(raw.get("threshold", 0.50)),
            dense_prefetch=int(raw.get("dense_prefetch", 20)),
            sparse_prefetch=int(raw.get("sparse_prefetch", 20)),
            rerank_candidates=int(raw.get("rerank_candidates", 10)),
            repeat=int(raw.get("repeat", 1)),
        )


def regression_failed(comparison: object) -> bool:
    from evals.retrieval.v1_1_models import ComparisonV11

    result = ComparisonV11.model_validate(comparison)
    limits = {
        "hit_at_5": -0.02,
        "recall_at_10": -0.02,
        "mrr_at_10": -0.03,
        "negative_retrieval_rate": 0.10,
    }
    for name, limit in limits.items():
        metric = result.metrics.get(name)
        if metric is None:
            continue
        if name == "negative_retrieval_rate":
            if metric.delta > limit:
                return True
        elif metric.delta < limit:
            return True
    return False


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="TraceMind Retrieval Evaluation v1.1")
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare = subparsers.add_parser("prepare")
    prepare.add_argument("--corpus-root", type=Path, default=DEFAULT_CORPUS)
    prepare.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    prepare.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    prepare.add_argument("--state", type=Path, required=True)
    prepare.add_argument("--collection", required=True)

    run = subparsers.add_parser("run")
    run.add_argument("--state", type=Path, required=True)
    run.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    run.add_argument(
        "--mode",
        choices=("dense", "bm25", "hybrid", "hybrid-reranker"),
        required=True,
    )
    run.add_argument("--split", choices=("dev", "holdout", "acceptance"), required=True)
    run.add_argument("--output", type=Path, required=True)
    run.add_argument("--top-k", type=int, default=5)
    run.add_argument("--threshold", type=float, default=0.50)
    run.add_argument("--dense-prefetch", type=int, default=20)
    run.add_argument("--sparse-prefetch", type=int, default=20)
    run.add_argument("--rerank-candidates", type=int, default=10)
    run.add_argument("--repeat", type=int, default=1)

    rewrite = subparsers.add_parser("rewrite")
    rewrite.add_argument("--state", type=Path, required=True)
    rewrite.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    rewrite.add_argument("--conversations", type=Path, default=DEFAULT_CONVERSATIONS)
    rewrite.add_argument("--split", choices=("dev", "holdout"), required=True)
    rewrite.add_argument("--output", type=Path, required=True)

    matrix = subparsers.add_parser("matrix")
    matrix.add_argument("--state", type=Path, required=True)
    matrix.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    matrix.add_argument("--plan", type=Path, required=True)
    matrix.add_argument("--output", type=Path, required=True)
    matrix.add_argument("--resume", action="store_true")

    compare = subparsers.add_parser("compare")
    compare.add_argument("--baseline", type=Path, required=True)
    compare.add_argument("--current", type=Path, required=True)
    compare.add_argument("--output", type=Path, required=True)
    compare.add_argument("--fail-on-regression", action="store_true")

    cleanup = subparsers.add_parser("cleanup")
    cleanup.add_argument("--state", type=Path, required=True)
    return parser


async def _main() -> int:
    args = build_parser().parse_args()
    if args.command == "prepare":
        await prepare_fixture(
            corpus_root=args.corpus_root,
            dataset=args.dataset,
            manifest_path=args.manifest,
            state_path=args.state,
            collection=args.collection,
        )
    elif args.command == "run":
        if args.repeat <= 0:
            raise ValueError("repeat must be greater than zero")
        await run_evaluation(
            state_path=args.state,
            dataset_path=args.dataset,
            mode=args.mode,
            split=args.split,
            output=args.output,
            top_k=args.top_k,
            threshold=args.threshold,
            dense_prefetch=args.dense_prefetch,
            sparse_prefetch=args.sparse_prefetch,
            rerank_candidates=args.rerank_candidates,
            repeat=args.repeat,
        )
    elif args.command == "rewrite":
        await run_rewrite_evaluation(
            state_path=args.state,
            retrieval_dataset=args.dataset,
            conversation_dataset=args.conversations,
            split=args.split,
            output=args.output,
        )
    elif args.command == "matrix":
        await run_matrix(
            state_path=args.state,
            dataset_path=args.dataset,
            plan_path=args.plan,
            output_root=args.output,
            resume=args.resume,
        )
    elif args.command == "compare":
        comparison = compare_summaries_v1_1(
            _load_summary(args.baseline),
            _load_summary(args.current),
        )
        _write_json(args.output, comparison.model_dump(mode="json"))
        if args.fail_on_regression and regression_failed(comparison):
            return 1
    elif args.command == "cleanup":
        await cleanup_fixture(args.state)
    return 0


def main() -> int:
    try:
        return asyncio.run(_main())
    except (OSError, RuntimeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
