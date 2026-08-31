from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SplitV11 = Literal["dev", "holdout", "acceptance"]
RetrievalModeV11 = Literal["dense", "bm25", "hybrid", "hybrid-reranker"]
SourceTypeV11 = Literal["document", "knowledge_entry"]
QueryTypeV11 = Literal[
    "semantic",
    "keyword",
    "code",
    "config",
    "path",
    "multi_evidence",
    "similar_document",
    "negative",
]


class GoldEvidenceV11(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_type: SourceTypeV11 = "document"
    relative_path: str = Field(min_length=1)
    document_name: str = Field(min_length=1)
    section_title: str | None = None
    line_start: int = Field(ge=1)
    line_end: int = Field(ge=1)
    anchor_text: str = Field(min_length=8, max_length=400)
    relevance: Literal[1, 2]
    required: bool = True

    @model_validator(mode="after")
    def validate_line_range(self) -> GoldEvidenceV11:
        if self.line_end < self.line_start:
            raise ValueError("line_end must not be smaller than line_start")
        return self


class RetrievalCaseV11(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^(syn|acc)-\d{3}$")
    split: SplitV11
    query: str = Field(min_length=1, max_length=2_000)
    query_type: QueryTypeV11
    tags: list[str] = Field(min_length=1)
    answerable: bool
    gold_evidence: list[GoldEvidenceV11]
    language_filter: str | None = None
    document_scope: str | None = None
    notes: str = ""

    @field_validator("query")
    @classmethod
    def strip_query(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("query must not be blank")
        return value

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str]) -> list[str]:
        normalized = list(dict.fromkeys(tag.strip().lower() for tag in value if tag.strip()))
        if not normalized:
            raise ValueError("tags must not be empty")
        return normalized

    @model_validator(mode="after")
    def validate_answerability(self) -> RetrievalCaseV11:
        if self.answerable and not self.gold_evidence:
            raise ValueError("answerable cases require gold evidence")
        if not self.answerable and self.gold_evidence:
            raise ValueError("negative cases must not contain gold evidence")
        if not self.answerable and "negative" not in self.tags:
            raise ValueError("negative cases require the negative tag")
        if self.query_type == "multi_evidence":
            required = [item for item in self.gold_evidence if item.required]
            if len(required) < 2:
                raise ValueError("multi-evidence cases require two required evidence items")
        return self


class CorpusFileV11(BaseModel):
    model_config = ConfigDict(extra="forbid")

    relative_path: str = Field(min_length=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    source_type: SourceTypeV11 = "document"


class CorpusManifestV11(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_version: Literal["1.1"]
    corpus_kind: Literal["synthetic", "project-realistic"]
    files: list[CorpusFileV11] = Field(min_length=1)
    expected_question_count: int = Field(gt=0)
    expected_splits: dict[str, int]
    chunking_snapshot: dict[str, str | int]
    embedding_snapshot: dict[str, str | int]
    retrieval_snapshot: dict[str, str | int | float | bool]
    notes: str = ""


class RetrievalHitV11(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rank: int = Field(ge=1)
    score: float
    retrieval_id: str
    source_type: SourceTypeV11
    document_name: str
    relative_path: str
    section_title: str | None
    start_line: int | None
    end_line: int | None
    content: str
    retrieval_score: float | None = None
    rerank_score: float | None = None
    retrieval_rank: int | None = None


class StageLatencyV11(BaseModel):
    model_config = ConfigDict(extra="forbid")

    embedding_ms: float = Field(ge=0)
    qdrant_ms: float = Field(ge=0)
    fusion_ms: float = Field(ge=0)
    rerank_ms: float = Field(ge=0)
    total_ms: float = Field(ge=0)


class CaseEvaluationV11(BaseModel):
    model_config = ConfigDict(extra="forbid")

    case_id: str
    query: str
    mode: RetrievalModeV11
    tags: list[str]
    answerable: bool
    hits: list[RetrievalHitV11]
    matched_evidence: list[int]
    missing_required_evidence: list[int]
    metrics: dict[str, float | None]
    latency: StageLatencyV11
    dense_candidate_count: int = Field(ge=0)
    sparse_candidate_count: int = Field(ge=0)
    context_chars: int = Field(ge=0)
    error: str | None = None


class AggregateMetricV11(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: float
    query_count: int = Field(ge=0)
    success_count: int | None = Field(default=None, ge=0)


class LatencyAggregateV11(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mean: float
    p50: float
    p95: float
    query_count: int = Field(ge=0)


class EvaluationSummaryV11(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.1"] = "1.1"
    run_id: str
    generated_at: datetime
    mode: RetrievalModeV11
    split: SplitV11
    config: dict[str, str | int | float | bool]
    case_count: int
    answerable_count: int
    negative_count: int
    metrics: dict[str, AggregateMetricV11]
    latency: dict[str, LatencyAggregateV11]
    per_tag: dict[str, dict[str, AggregateMetricV11]]
    dense_candidate_count_mean: float
    sparse_candidate_count_mean: float
    context_chars_mean: float
    cases: list[CaseEvaluationV11]


class MetricDeltaV11(BaseModel):
    model_config = ConfigDict(extra="forbid")

    baseline: float
    current: float
    delta: float
    query_count: int
    improved_queries: int
    worsened_queries: int
    unchanged_queries: int


class ComparisonV11(BaseModel):
    model_config = ConfigDict(extra="forbid")

    baseline_run_id: str
    current_run_id: str
    metrics: dict[str, MetricDeltaV11]


class ConversationCaseV11(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^rw-\d{3}$")
    split: Literal["dev", "holdout"]
    history: list[dict[Literal["user", "assistant"], str]] = Field(min_length=1)
    query: str = Field(min_length=1)
    expected_terms: list[str] = Field(min_length=1)
    forbidden_terms: list[str] = Field(default_factory=list)
    retrieval_case_id: str = Field(pattern=r"^syn-\d{3}$")
    tags: list[str] = Field(min_length=1)
