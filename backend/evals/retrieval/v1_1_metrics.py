from __future__ import annotations

import math
import statistics
from datetime import UTC, datetime

from evals.retrieval.matching import normalize_text
from evals.retrieval.metrics import percentile
from evals.retrieval.v1_1_models import (
    AggregateMetricV11,
    CaseEvaluationV11,
    ComparisonV11,
    EvaluationSummaryV11,
    GoldEvidenceV11,
    LatencyAggregateV11,
    MetricDeltaV11,
    RetrievalCaseV11,
    RetrievalHitV11,
    RetrievalModeV11,
    SplitV11,
    StageLatencyV11,
)

QUALITY_METRICS = (
    "hit_at_1",
    "hit_at_3",
    "hit_at_5",
    "recall_at_5",
    "recall_at_10",
    "mrr_at_10",
    "ndcg_at_5",
    "ndcg_at_10",
)
NEGATIVE_METRICS = ("negative_empty_result_rate", "negative_retrieval_rate")


def evidence_matches_hit_v1_1(evidence: GoldEvidenceV11, hit: RetrievalHitV11) -> bool:
    if evidence.source_type != hit.source_type:
        return False
    if normalize_text(evidence.relative_path) != normalize_text(hit.relative_path):
        return False
    if (
        evidence.section_title is not None
        and hit.section_title is not None
        and normalize_text(evidence.section_title) != normalize_text(hit.section_title)
    ):
        return False
    if hit.start_line is not None and hit.end_line is not None:
        if evidence.line_start > hit.end_line or hit.start_line > evidence.line_end:
            return False
    anchor = normalize_text(evidence.anchor_text)
    content = normalize_text(hit.content)
    return anchor in content or (bool(content) and content in anchor)


def _matched_indexes(case: RetrievalCaseV11, hits: list[RetrievalHitV11]) -> set[int]:
    return {
        index
        for index, evidence in enumerate(case.gold_evidence)
        for hit in hits
        if evidence_matches_hit_v1_1(evidence, hit)
    }


def _relevance_at_rank(case: RetrievalCaseV11, hit: RetrievalHitV11) -> int:
    return max(
        (
            evidence.relevance
            for evidence in case.gold_evidence
            if evidence_matches_hit_v1_1(evidence, hit)
        ),
        default=0,
    )


def _ndcg(case: RetrievalCaseV11, hits: list[RetrievalHitV11], k: int) -> float:
    relevances = [_relevance_at_rank(case, hit) for hit in hits[:k]]
    dcg = sum(
        (2**relevance - 1) / math.log2(rank + 1)
        for rank, relevance in enumerate(relevances, start=1)
    )
    ideal = sorted((item.relevance for item in case.gold_evidence), reverse=True)[:k]
    ideal_dcg = sum(
        (2**relevance - 1) / math.log2(rank + 1) for rank, relevance in enumerate(ideal, start=1)
    )
    return dcg / ideal_dcg if ideal_dcg else 0.0


def evaluate_case_v1_1(
    case: RetrievalCaseV11,
    hits: list[RetrievalHitV11],
    *,
    mode: RetrievalModeV11,
    latency: StageLatencyV11,
    dense_candidate_count: int,
    sparse_candidate_count: int,
    error: str | None = None,
) -> CaseEvaluationV11:
    unique: list[RetrievalHitV11] = []
    seen: set[str] = set()
    for hit in hits:
        if hit.retrieval_id in seen:
            continue
        seen.add(hit.retrieval_id)
        unique.append(hit.model_copy(update={"rank": len(unique) + 1}))
    matched_5 = _matched_indexes(case, unique[:5])
    matched_10 = _matched_indexes(case, unique[:10])
    required = {index for index, item in enumerate(case.gold_evidence) if item.required}
    relevant_ranks = [
        rank for rank, hit in enumerate(unique[:10], start=1) if _relevance_at_rank(case, hit) > 0
    ]
    if case.answerable:
        denominator = len(case.gold_evidence)
        metrics: dict[str, float | None] = {
            "hit_at_1": float(bool(relevant_ranks and relevant_ranks[0] == 1)),
            "hit_at_3": float(any(rank <= 3 for rank in relevant_ranks)),
            "hit_at_5": float(any(rank <= 5 for rank in relevant_ranks)),
            "recall_at_5": len(matched_5) / denominator,
            "recall_at_10": len(matched_10) / denominator,
            "mrr_at_10": 0.0 if not relevant_ranks else 1.0 / relevant_ranks[0],
            "ndcg_at_5": _ndcg(case, unique, 5),
            "ndcg_at_10": _ndcg(case, unique, 10),
            "negative_empty_result_rate": None,
            "negative_retrieval_rate": None,
        }
    else:
        metrics = {name: None for name in QUALITY_METRICS}
        metrics.update(
            {
                "negative_empty_result_rate": float(not unique),
                "negative_retrieval_rate": float(bool(unique)),
            }
        )
    return CaseEvaluationV11(
        case_id=case.id,
        query=case.query,
        mode=mode,
        tags=case.tags,
        answerable=case.answerable,
        hits=unique,
        matched_evidence=sorted(matched_10),
        missing_required_evidence=sorted(required - matched_10),
        metrics=metrics,
        latency=latency,
        dense_candidate_count=dense_candidate_count,
        sparse_candidate_count=sparse_candidate_count,
        context_chars=sum(len(hit.content) for hit in unique),
        error=error,
    )


def _aggregate_metric(items: list[CaseEvaluationV11], name: str) -> AggregateMetricV11:
    values = [item.metrics[name] for item in items if item.metrics.get(name) is not None]
    numeric = [float(value) for value in values if value is not None]
    value = statistics.fmean(numeric) if numeric else 0.0
    binary = all(number in {0.0, 1.0} for number in numeric)
    return AggregateMetricV11(
        value=value,
        query_count=len(numeric),
        success_count=sum(number == 1.0 for number in numeric) if binary else None,
    )


def _latency(values: list[float]) -> LatencyAggregateV11:
    return LatencyAggregateV11(
        mean=statistics.fmean(values) if values else 0.0,
        p50=percentile(values, 0.50),
        p95=percentile(values, 0.95),
        query_count=len(values),
    )


def summarize_v1_1(
    *,
    run_id: str,
    mode: RetrievalModeV11,
    split: SplitV11,
    config: dict[str, str | int | float | bool],
    evaluations: list[CaseEvaluationV11],
) -> EvaluationSummaryV11:
    metric_names = QUALITY_METRICS + NEGATIVE_METRICS
    tags = sorted({tag for item in evaluations for tag in item.tags})
    per_tag = {
        tag: {
            name: _aggregate_metric([item for item in evaluations if tag in item.tags], name)
            for name in metric_names
        }
        for tag in tags
    }
    return EvaluationSummaryV11(
        run_id=run_id,
        generated_at=datetime.now(UTC),
        mode=mode,
        split=split,
        config=config,
        case_count=len(evaluations),
        answerable_count=sum(item.answerable for item in evaluations),
        negative_count=sum(not item.answerable for item in evaluations),
        metrics={name: _aggregate_metric(evaluations, name) for name in metric_names},
        latency={
            "embedding": _latency([item.latency.embedding_ms for item in evaluations]),
            "qdrant": _latency([item.latency.qdrant_ms for item in evaluations]),
            "fusion": _latency([item.latency.fusion_ms for item in evaluations]),
            "rerank": _latency([item.latency.rerank_ms for item in evaluations]),
            "total": _latency([item.latency.total_ms for item in evaluations]),
        },
        per_tag=per_tag,
        dense_candidate_count_mean=(
            statistics.fmean(item.dense_candidate_count for item in evaluations)
            if evaluations
            else 0.0
        ),
        sparse_candidate_count_mean=(
            statistics.fmean(item.sparse_candidate_count for item in evaluations)
            if evaluations
            else 0.0
        ),
        context_chars_mean=(
            statistics.fmean(item.context_chars for item in evaluations) if evaluations else 0.0
        ),
        cases=evaluations,
    )


def compare_summaries_v1_1(
    baseline: EvaluationSummaryV11,
    current: EvaluationSummaryV11,
) -> ComparisonV11:
    baseline_cases = {item.case_id: item for item in baseline.cases}
    current_cases = {item.case_id: item for item in current.cases}
    if baseline_cases.keys() != current_cases.keys():
        raise ValueError("comparison requires identical case IDs")
    deltas: dict[str, MetricDeltaV11] = {}
    for name in QUALITY_METRICS + NEGATIVE_METRICS:
        pairs = [
            (baseline_cases[case_id].metrics.get(name), current_cases[case_id].metrics.get(name))
            for case_id in sorted(baseline_cases)
        ]
        numeric = [
            (float(left), float(right))
            for left, right in pairs
            if left is not None and right is not None
        ]
        if not numeric:
            continue
        improved = sum(right > left for left, right in numeric)
        worsened = sum(right < left for left, right in numeric)
        baseline_value = baseline.metrics[name].value
        current_value = current.metrics[name].value
        deltas[name] = MetricDeltaV11(
            baseline=baseline_value,
            current=current_value,
            delta=current_value - baseline_value,
            query_count=len(numeric),
            improved_queries=improved,
            worsened_queries=worsened,
            unchanged_queries=len(numeric) - improved - worsened,
        )
    return ComparisonV11(
        baseline_run_id=baseline.run_id,
        current_run_id=current.run_id,
        metrics=deltas,
    )
