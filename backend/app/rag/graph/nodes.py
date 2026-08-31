import json
from dataclasses import replace
from time import perf_counter
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.config import get_stream_writer
from langgraph.runtime import Runtime

from app.rag import StreamingCitationGuard, build_rag_context, build_rag_payload
from app.rag.graph.state import RagRuntimeContext, RagState
from app.rag.prompt import SYSTEM_PROMPT
from app.rag.query_rewrite import rewrite_retrieval_query
from app.reranker import RerankerError, RerankerUnavailableError
from app.services.exceptions import (
    HybridSearchUnavailableError,
    SemanticSearchUnavailableError,
)
from app.services.query_router import RouteMode, route_query

DIRECT_SYSTEM_PROMPT = """你是 TraceMind，一个本地优先的个人工程知识助手。
当前消息是简单社交表达，不需要检索知识库。请用简洁、自然的中文回应。
不要声称已经检索资料，不要虚构来源，也不要添加 Citation。"""
NO_ANSWER_MESSAGE = "知识库中未找到足够相关的信息。"


def route_node(state: RagState) -> dict[str, RouteMode]:
    _write_pipeline("routing", "started")
    route_mode = route_query(state["query"])
    _write_pipeline("routing", "completed", route_mode=route_mode)
    return {"route_mode": route_mode}


def select_route(state: RagState) -> RouteMode:
    return state["route_mode"]


async def resolve_scope_node(
    state: RagState,
    runtime: Runtime[RagRuntimeContext],
) -> dict[str, object]:
    prepared = await runtime.context.retrieval_service.prepare_retrieval_query(
        state["knowledge_base_id"],
        state["query"],
        document_id=state["document_id"],
    )
    return {"prepared_retrieval_query": prepared}


async def rewrite_node(
    state: RagState,
    runtime: Runtime[RagRuntimeContext],
) -> dict[str, object]:
    _write_pipeline("query_rewrite", "started")
    semantic_query = state["prepared_retrieval_query"].semantic_query
    result = await rewrite_retrieval_query(
        runtime.context.model,
        query=semantic_query,
        history=state.get("conversation_history", ()),
        timeout_seconds=runtime.context.settings.query_rewrite_timeout_seconds,
        max_query_chars=runtime.context.settings.query_rewrite_max_query_chars,
    )
    if result.mode == "rewritten":
        _write_pipeline("query_rewrite", "completed")
    elif result.mode == "not_applicable":
        _write_pipeline("query_rewrite", "skipped")
    else:
        _write_pipeline("query_rewrite", result.mode)
    return {
        "retrieval_query": result.query,
        "query_rewrite_mode": result.mode,
        "query_rewrite_latency_ms": result.latency_ms,
        "query_rewrite_fallback_reason": result.fallback_reason,
    }


async def retrieve_node(
    state: RagState,
    runtime: Runtime[RagRuntimeContext],
) -> dict[str, object]:
    _write_pipeline("retrieval", "started")
    retrieval_scope = replace(
        state["prepared_retrieval_query"],
        semantic_query=state["retrieval_query"],
    )
    try:
        prepared = await runtime.context.retrieval_service.prepare_hybrid_search(
            state["knowledge_base_id"],
            query=state["retrieval_query"],
            limit=runtime.context.settings.rag_rerank_candidate_limit,
            language=state["language"],
            document_id=state["document_id"],
            prepared_query=retrieval_scope,
        )
        result = await runtime.context.retrieval_service.execute_hybrid_search(prepared)
    except (SemanticSearchUnavailableError, HybridSearchUnavailableError):
        _write_pipeline("retrieval", "failed")
        raise
    _write_pipeline("retrieval", "completed", candidate_count=len(result.items))
    return {
        "retrieval_candidates": result.items,
        "embedding_latency_ms": result.embedding_latency_ms,
        "qdrant_latency_ms": result.qdrant_latency_ms,
        "fusion_latency_ms": result.fusion_latency_ms,
        "dense_candidate_count": result.dense_candidate_count,
        "sparse_candidate_count": result.sparse_candidate_count,
    }


async def rerank_node(
    state: RagState,
    runtime: Runtime[RagRuntimeContext],
) -> dict[str, object]:
    _write_pipeline("rerank", "started")
    candidates = state["retrieval_candidates"]
    settings = runtime.context.settings
    hybrid_results = candidates[: settings.rag_retrieval_limit]
    if not candidates or not settings.reranker_enabled:
        _write_pipeline("rerank", "skipped", candidate_count=len(hybrid_results))
        return {
            "ranked_results": hybrid_results,
            "retrieval_mode": "hybrid",
            "rerank_latency_ms": 0,
            "reranker_fallback": False,
            "reranker_fallback_reason": None,
        }

    started_at = perf_counter()
    try:
        if runtime.context.reranking_service is None:
            raise RerankerUnavailableError(reason="unavailable")
        results = await runtime.context.reranking_service.rerank(
            state["retrieval_query"],
            candidates,
            limit=min(settings.rag_retrieval_limit, len(candidates)),
        )
        _write_pipeline("rerank", "completed", candidate_count=len(results))
        return {
            "ranked_results": results,
            "retrieval_mode": "hybrid_reranker",
            "rerank_latency_ms": _elapsed_ms(started_at),
            "reranker_fallback": False,
            "reranker_fallback_reason": None,
        }
    except RerankerUnavailableError as exc:
        fallback_reason = exc.reason
    except RerankerError:
        fallback_reason = "internal_error"
    _write_pipeline("rerank", "fallback", candidate_count=len(hybrid_results))
    return {
        "ranked_results": hybrid_results,
        "retrieval_mode": "hybrid_fallback",
        "rerank_latency_ms": _elapsed_ms(started_at),
        "reranker_fallback": True,
        "reranker_fallback_reason": fallback_reason,
    }


def prepare_context_node(
    state: RagState,
    runtime: Runtime[RagRuntimeContext],
) -> dict[str, object]:
    _write_pipeline("evidence", "started")
    context = build_rag_context(
        state["ranked_results"],
        runtime.context.settings.rag_max_context_chars,
    )
    if context.sources:
        get_stream_writer()(
            {
                "type": "sources",
                "source_count": len(context.sources),
                "sources": [source.model_dump(mode="json") for source in context.sources],
            }
        )
    _write_pipeline("evidence", "completed", source_count=len(context.sources))
    return {"rag_context": context}


def select_context_path(state: RagState) -> Literal["no_answer", "generate_grounded"]:
    return "generate_grounded" if state["rag_context"].sources else "no_answer"


def no_answer_node(state: RagState) -> dict[str, object]:
    get_stream_writer()({"type": "no_answer", "message": NO_ANSWER_MESSAGE})
    return {
        "answer": NO_ANSWER_MESSAGE,
        "terminal_status": "no_answer",
        "grounded": False,
        "valid_citation_count": 0,
        "invalid_citation_count": 0,
    }


async def generate_grounded_node(
    state: RagState,
    runtime: Runtime[RagRuntimeContext],
) -> dict[str, object]:
    _write_pipeline("generation", "started")
    history = (
        state.get("conversation_history", ())
        if state["query_rewrite_mode"] in {"rewritten", "fallback"}
        else ()
    )
    context = state["rag_context"]
    payload = build_rag_payload(
        state["query"],
        context,
        history,
        scoped_relative_path=state["prepared_retrieval_query"].explicit_relative_path,
    )
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=json.dumps(payload, ensure_ascii=False, separators=(",", ":"))),
    ]
    guard = StreamingCitationGuard({source.source_id for source in context.sources})
    writer = get_stream_writer()
    parts: list[str] = []
    async for chunk in runtime.context.model.astream(messages):
        safe_text = guard.push(chunk.text)
        if safe_text:
            parts.append(safe_text)
            writer({"type": "token", "text": safe_text})
    tail = guard.finish()
    if tail:
        parts.append(tail)
        writer({"type": "token", "text": tail})
    _write_pipeline("generation", "completed")
    return {
        "answer": "".join(parts),
        "grounded": guard.grounded,
        "valid_citation_count": guard.valid_citation_count,
        "invalid_citation_count": guard.invalid_citation_count,
    }


async def generate_direct_node(
    state: RagState,
    runtime: Runtime[RagRuntimeContext],
) -> dict[str, str]:
    _write_pipeline("generation", "started")
    messages = [
        SystemMessage(content=DIRECT_SYSTEM_PROMPT),
        HumanMessage(content=state["query"]),
    ]
    writer = get_stream_writer()
    parts: list[str] = []
    async for chunk in runtime.context.model.astream(messages):
        text = chunk.text
        if text:
            parts.append(text)
            writer({"type": "token", "text": text})
    _write_pipeline("generation", "completed")
    return {"answer": "".join(parts)}


def finalize_node(state: RagState) -> dict[str, str]:
    if "answer" not in state:
        raise ValueError("Generation did not produce an answer")
    terminal_status = "no_answer" if state.get("terminal_status") == "no_answer" else "completed"
    event: dict[str, object] = {
        "type": "done",
        "route_mode": state["route_mode"],
        "terminal_status": terminal_status,
        "grounded": state.get("grounded", False),
        "valid_citation_count": state.get("valid_citation_count", 0),
        "invalid_citation_count": state.get("invalid_citation_count", 0),
    }
    for key, value in (
        ("query_rewrite_mode", state.get("query_rewrite_mode")),
        ("query_rewrite_latency_ms", state.get("query_rewrite_latency_ms")),
        ("query_rewrite_fallback_reason", state.get("query_rewrite_fallback_reason")),
        ("retrieval_query", state.get("retrieval_query")),
        ("retrieval_mode", state.get("retrieval_mode")),
        ("rerank_latency_ms", state.get("rerank_latency_ms")),
        ("reranker_fallback", state.get("reranker_fallback")),
        ("reranker_fallback_reason", state.get("reranker_fallback_reason")),
        ("embedding_latency_ms", state.get("embedding_latency_ms")),
        ("qdrant_latency_ms", state.get("qdrant_latency_ms")),
        ("fusion_latency_ms", state.get("fusion_latency_ms")),
        ("dense_candidate_count", state.get("dense_candidate_count")),
        ("sparse_candidate_count", state.get("sparse_candidate_count")),
    ):
        if key in state:
            event[key] = value
    if context := state.get("rag_context"):
        event["source_count"] = len(context.sources)
    if prepared := state.get("prepared_retrieval_query"):
        event["path_scope_mode"] = prepared.path_scope_mode
        event["scoped_relative_path"] = prepared.explicit_relative_path
    get_stream_writer()(event)
    return {"terminal_status": terminal_status}


def _elapsed_ms(started_at: float) -> int:
    return round((perf_counter() - started_at) * 1_000)


PipelinePhase = Literal[
    "routing",
    "query_rewrite",
    "retrieval",
    "rerank",
    "evidence",
    "generation",
]
PipelineStatus = Literal["started", "completed", "skipped", "fallback", "failed"]


def _write_pipeline(
    phase: PipelinePhase,
    status: PipelineStatus,
    **metadata: str | int,
) -> None:
    event: dict[str, object] = {
        "type": "pipeline",
        "phase": phase,
        "status": status,
    }
    if metadata:
        event["metadata"] = metadata
    get_stream_writer()(event)
