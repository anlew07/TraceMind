from pathlib import Path

import pytest

from evals.retrieval.v1_1_dataset import validate_conversations_v1_1, validate_dataset_v1_1
from evals.retrieval.v1_1_metrics import (
    compare_summaries_v1_1,
    evaluate_case_v1_1,
    summarize_v1_1,
)
from evals.retrieval.v1_1_models import (
    GoldEvidenceV11,
    RetrievalCaseV11,
    RetrievalHitV11,
    StageLatencyV11,
)
from evals.retrieval.validate_dataset import validate_dataset

BACKEND = Path(__file__).parents[2]
ROOT = BACKEND.parent
DATASETS = BACKEND / "evals/retrieval/datasets"
SYNTHETIC_CORPUS = BACKEND / "evals/retrieval/corpora/synthetic_v1_1"


def _case(*, case_id: str, answerable: bool = True) -> RetrievalCaseV11:
    evidence = [
        GoldEvidenceV11(
            relative_path="docs/example.md",
            document_name="example.md",
            section_title="Stable Section",
            line_start=10,
            line_end=12,
            anchor_text="stable evidence anchor",
            relevance=2,
            required=True,
        )
    ]
    return RetrievalCaseV11(
        id=case_id,
        split="dev",
        query="stable query",
        query_type="semantic" if answerable else "negative",
        tags=["semantic"] if answerable else ["semantic", "negative"],
        answerable=answerable,
        gold_evidence=evidence if answerable else [],
    )


def _hit(relevant: bool = True) -> RetrievalHitV11:
    return RetrievalHitV11(
        rank=1,
        score=0.8,
        retrieval_id="chunk-1" if relevant else "chunk-noise",
        source_type="document",
        document_name="example.md" if relevant else "noise.md",
        relative_path="docs/example.md" if relevant else "docs/noise.md",
        section_title="Stable Section" if relevant else "Noise",
        start_line=10 if relevant else 1,
        end_line=12 if relevant else 1,
        content="stable evidence anchor" if relevant else "unrelated content",
    )


def _latency() -> StageLatencyV11:
    return StageLatencyV11(
        embedding_ms=1,
        qdrant_ms=2,
        fusion_ms=0.1,
        rerank_ms=0,
        total_ms=4,
    )


def test_v1_1_synthetic_and_project_acceptance_datasets_are_fixed() -> None:
    synthetic, _ = validate_dataset_v1_1(
        SYNTHETIC_CORPUS,
        DATASETS / "synthetic_retrieval_v1_1.jsonl",
        DATASETS / "synthetic_corpus_manifest_v1_1.json",
    )
    assert len(synthetic) == 48
    assert sum(case.split == "dev" for case in synthetic) == 32
    assert sum(case.split == "holdout" for case in synthetic) == 16
    conversations = validate_conversations_v1_1(
        DATASETS / "conversation_rewrite_v1_1.jsonl",
        synthetic,
    )
    assert len(conversations) == 12

    acceptance, manifest = validate_dataset_v1_1(
        ROOT,
        DATASETS / "project_acceptance_v1_1.jsonl",
        DATASETS / "project_acceptance_manifest_v1_1.json",
    )
    assert len(acceptance) == 12
    assert manifest.corpus_kind == "project-realistic"


def test_v1_assets_still_validate_without_v1_1_schema() -> None:
    cases, manifest = validate_dataset(
        ROOT / "docs/retrieval-evaluation/synthetic_retrieval_corpus_v1.md",
        DATASETS / "synthetic_retrieval_v1.jsonl",
        DATASETS / "synthetic_corpus_manifest_v1.json",
        checklist_path=ROOT / "docs/retrieval-evaluation/synthetic_retrieval_checklist_v1.md",
    )
    assert len(cases) == 24
    assert manifest.dataset_version == "synthetic-retrieval-v1"


def test_negative_retrieval_metrics_use_retrieval_only_names_and_counts() -> None:
    negative_empty = evaluate_case_v1_1(
        _case(case_id="syn-901", answerable=False),
        [],
        mode="hybrid",
        latency=_latency(),
        dense_candidate_count=0,
        sparse_candidate_count=0,
    )
    negative_hit = evaluate_case_v1_1(
        _case(case_id="syn-902", answerable=False),
        [_hit(False)],
        mode="hybrid",
        latency=_latency(),
        dense_candidate_count=1,
        sparse_candidate_count=1,
    )
    summary = summarize_v1_1(
        run_id="negative",
        mode="hybrid",
        split="dev",
        config={},
        evaluations=[negative_empty, negative_hit],
    )
    assert summary.metrics["negative_empty_result_rate"].value == 0.5
    assert summary.metrics["negative_empty_result_rate"].query_count == 2
    assert summary.metrics["negative_retrieval_rate"].success_count == 1
    assert "no_answer_accuracy" not in summary.metrics


def test_aggregate_deltas_report_query_level_counts() -> None:
    cases = [_case(case_id="syn-903"), _case(case_id="syn-904")]
    baseline_evaluations = [
        evaluate_case_v1_1(
            case,
            [_hit()],
            mode="hybrid",
            latency=_latency(),
            dense_candidate_count=1,
            sparse_candidate_count=1,
        )
        for case in cases
    ]
    current_evaluations = [
        baseline_evaluations[0],
        evaluate_case_v1_1(
            cases[1],
            [_hit(False)],
            mode="hybrid",
            latency=_latency(),
            dense_candidate_count=1,
            sparse_candidate_count=1,
        ),
    ]
    baseline = summarize_v1_1(
        run_id="baseline",
        mode="hybrid",
        split="dev",
        config={},
        evaluations=baseline_evaluations,
    )
    current = summarize_v1_1(
        run_id="current",
        mode="hybrid",
        split="dev",
        config={},
        evaluations=current_evaluations,
    )
    comparison = compare_summaries_v1_1(baseline, current)
    delta = comparison.metrics["hit_at_5"]
    assert delta.delta == pytest.approx(-0.5)
    assert delta.query_count == 2
    assert delta.worsened_queries == 1
    assert delta.unchanged_queries == 1
