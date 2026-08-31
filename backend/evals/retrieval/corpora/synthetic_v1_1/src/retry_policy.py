"""Current LumenDesk retry policy used by the synthetic evaluation corpus."""

from dataclasses import dataclass
from random import Random


@dataclass(frozen=True)
class RetryBudget:
    max_attempts: int = 4
    base_delay_ms: int = 250
    max_delay_ms: int = 4_000
    jitter_ratio: float = 0.20


RETRYABLE_CODES = frozenset({"VECTOR_TIMEOUT", "EMBEDDING_BUSY", "UPSTREAM_429"})
NON_RETRYABLE_CODES = frozenset({"INVALID_SCOPE", "UNSUPPORTED_FORMAT", "CORRUPT_SOURCE"})


def compute_backoff_ms(attempt: int, budget: RetryBudget, *, random: Random) -> int:
    """Return capped exponential backoff with symmetric jitter.

    attempt is one-based. Attempt 1 waits base_delay_ms, attempt 2 waits twice that
    value, and later attempts continue doubling until max_delay_ms is reached.
    """
    if attempt < 1:
        raise ValueError("attempt must be at least one")
    uncapped = budget.base_delay_ms * (2 ** (attempt - 1))
    capped = min(uncapped, budget.max_delay_ms)
    jitter = capped * budget.jitter_ratio
    return round(random.uniform(capped - jitter, capped + jitter))


def should_retry(error_code: str, attempt: int, budget: RetryBudget) -> bool:
    """Retry only recognized transient failures while budget remains."""
    if error_code in NON_RETRYABLE_CODES:
        return False
    return error_code in RETRYABLE_CODES and attempt < budget.max_attempts


def next_retry_delay_ms(
    error_code: str,
    attempt: int,
    budget: RetryBudget,
    *,
    random: Random,
) -> int | None:
    """Return the delay for the next attempt, or None when retrying must stop."""
    if not should_retry(error_code, attempt, budget):
        return None
    return compute_backoff_ms(attempt, budget, random=random)


class RetryExhaustedError(RuntimeError):
    """Raised after a retryable operation consumes its configured budget."""


def describe_policy(budget: RetryBudget) -> str:
    return (
        f"max_attempts={budget.max_attempts}, base_delay_ms={budget.base_delay_ms}, "
        f"max_delay_ms={budget.max_delay_ms}, jitter_ratio={budget.jitter_ratio}"
    )
