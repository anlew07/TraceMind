"""Deprecated LumenDesk retry policy kept as a deliberate retrieval distractor."""

from dataclasses import dataclass


@dataclass(frozen=True)
class LegacyRetryPolicy:
    retries: int = 8
    fixed_delay_ms: int = 1_000


LEGACY_RETRYABLE_CODES = frozenset(
    {"VECTOR_TIMEOUT", "INVALID_SCOPE", "UNSUPPORTED_FORMAT", "UPSTREAM_429"}
)


def legacy_retry_delay_ms(attempt: int, policy: LegacyRetryPolicy) -> int:
    """Return the old fixed delay without jitter or exponential growth."""
    if attempt < 1:
        raise ValueError("attempt must be at least one")
    return policy.fixed_delay_ms


def legacy_should_retry(error_code: str, attempt: int, policy: LegacyRetryPolicy) -> bool:
    """The legacy implementation incorrectly retries several permanent errors."""
    return error_code in LEGACY_RETRYABLE_CODES and attempt <= policy.retries


MIGRATION_NOTE = """
This module is retained only to explain historical incidents. New code must use
RetryBudget and should_retry from src/retry_policy.py. The legacy policy used eight
retries, a fixed one-second delay, no jitter, and treated INVALID_SCOPE as retryable.
Those choices caused synchronized retry storms and delayed permanent-error feedback.
"""


def is_deprecated() -> bool:
    return True


def replacement_module() -> str:
    return "src/retry_policy.py"
