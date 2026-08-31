from __future__ import annotations

import argparse
import hashlib
from collections import Counter
from pathlib import Path

from pydantic import ValidationError

from evals.retrieval.v1_1_models import (
    ConversationCaseV11,
    CorpusManifestV11,
    RetrievalCaseV11,
)


def _load_jsonl(path: Path, model: type[RetrievalCaseV11]) -> list[RetrievalCaseV11]:
    rows: list[RetrievalCaseV11] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise ValueError(f"dataset could not be read: {path}") from exc
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            rows.append(model.model_validate_json(line))
        except (ValidationError, ValueError) as exc:
            raise ValueError(f"invalid dataset line {line_number}: {exc}") from exc
    ids = [row.id for row in rows]
    duplicates = sorted(item for item, count in Counter(ids).items() if count > 1)
    if duplicates:
        raise ValueError(f"duplicate case IDs: {', '.join(duplicates)}")
    return rows


def load_cases_v1_1(path: Path) -> list[RetrievalCaseV11]:
    return _load_jsonl(path, RetrievalCaseV11)


def load_conversation_cases_v1_1(path: Path) -> list[ConversationCaseV11]:
    rows: list[ConversationCaseV11] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise ValueError(f"conversation dataset could not be read: {path}") from exc
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            rows.append(ConversationCaseV11.model_validate_json(line))
        except (ValidationError, ValueError) as exc:
            raise ValueError(f"invalid conversation line {line_number}: {exc}") from exc
    ids = [row.id for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate conversation case IDs")
    return rows


def load_manifest_v1_1(path: Path) -> CorpusManifestV11:
    try:
        return CorpusManifestV11.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValidationError, ValueError) as exc:
        raise ValueError(f"manifest could not be loaded: {path}") from exc


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _section_for_line(lines: list[str], line_number: int) -> str | None:
    for index in range(line_number - 1, -1, -1):
        if lines[index].startswith("## "):
            return lines[index][3:].strip()
    return None


def validate_dataset_v1_1(
    corpus_root: Path,
    dataset_path: Path,
    manifest_path: Path,
) -> tuple[list[RetrievalCaseV11], CorpusManifestV11]:
    cases = load_cases_v1_1(dataset_path)
    manifest = load_manifest_v1_1(manifest_path)
    errors: list[str] = []
    files = {item.relative_path: item for item in manifest.files}
    contents: dict[str, list[str]] = {}
    for relative_path, item in files.items():
        path = (corpus_root / relative_path).resolve()
        try:
            path.relative_to(corpus_root.resolve())
        except ValueError:
            errors.append(f"manifest path escapes corpus root: {relative_path}")
            continue
        if not path.is_file():
            errors.append(f"manifest file is missing: {relative_path}")
            continue
        if file_sha256(path) != item.sha256:
            errors.append(f"manifest SHA-256 mismatch: {relative_path}")
        contents[relative_path] = path.read_text(encoding="utf-8").splitlines()

    if len(cases) != manifest.expected_question_count:
        errors.append("dataset question count does not match manifest")
    actual_splits = Counter(case.split for case in cases)
    if dict(actual_splits) != manifest.expected_splits:
        errors.append(
            f"split distribution {dict(actual_splits)} does not match {manifest.expected_splits}"
        )
    for case in cases:
        for evidence_index, evidence in enumerate(case.gold_evidence):
            label = f"{case.id} evidence {evidence_index}"
            lines = contents.get(evidence.relative_path)
            if lines is None:
                errors.append(f"{label} references an unknown corpus file")
                continue
            if Path(evidence.relative_path).name != evidence.document_name:
                errors.append(f"{label} document_name does not match relative_path")
            if evidence.line_end > len(lines):
                errors.append(f"{label} line range exceeds the corpus file")
                continue
            selected = "\n".join(lines[evidence.line_start - 1 : evidence.line_end])
            if evidence.anchor_text not in selected:
                errors.append(f"{label} anchor_text is not present in the declared line range")
            if evidence.section_title is not None:
                section = _section_for_line(lines, evidence.line_start)
                if section != evidence.section_title:
                    errors.append(
                        f"{label} belongs to section {section!r}, not {evidence.section_title!r}"
                    )
    if manifest.corpus_kind == "synthetic":
        required_tags = {
            "zh",
            "en",
            "mixed",
            "semantic",
            "keyword",
            "code",
            "config",
            "path",
            "hard",
            "negative",
        }
        actual_tags = {tag for case in cases for tag in case.tags}
        missing_tags = sorted(required_tags - actual_tags)
        if missing_tags:
            errors.append(f"dataset is missing required tags: {', '.join(missing_tags)}")
    if errors:
        raise ValueError("\n".join(errors))
    return cases, manifest


def validate_conversations_v1_1(
    path: Path,
    retrieval_cases: list[RetrievalCaseV11],
) -> list[ConversationCaseV11]:
    rows = load_conversation_cases_v1_1(path)
    retrieval_ids = {case.id for case in retrieval_cases}
    errors = [
        f"{row.id} references unknown retrieval case {row.retrieval_case_id}"
        for row in rows
        if row.retrieval_case_id not in retrieval_ids
    ]
    if Counter(row.split for row in rows) != Counter({"dev": 8, "holdout": 4}):
        errors.append("conversation split distribution must be dev=8, holdout=4")
    if errors:
        raise ValueError("\n".join(errors))
    return rows


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="校验 Retrieval Evaluation v1.1 数据集")
    parser.add_argument("--corpus-root", type=Path, required=True)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--conversations", type=Path)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    cases, _ = validate_dataset_v1_1(args.corpus_root, args.dataset, args.manifest)
    if args.conversations is not None:
        validate_conversations_v1_1(args.conversations, cases)
    print(f"v1.1 数据集校验通过：{len(cases)} 条问题")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
