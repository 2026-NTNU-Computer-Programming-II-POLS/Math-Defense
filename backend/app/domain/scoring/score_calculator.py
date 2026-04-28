"""Server-side V2 score formula — mirrors frontend src/domain/scoring/score-calculator.ts.

Used to verify frontend-submitted scores for anti-cheat logging.
Returns None when any required input is absent so callers can skip gracefully.
"""
from __future__ import annotations


def recompute_total_score(
    kill_value: int | None,
    time_total: float | None,
    time_exclude_prepare: list[float] | None,
    cost_total: int | None,
    health_origin: int | None,
    health_final: int | None,
    initial_answer: bool | None,
) -> float | None:
    if (
        kill_value is None
        or time_total is None
        or time_exclude_prepare is None
        or cost_total is None
        or health_origin is None
        or health_final is None
        or initial_answer is None
    ):
        return None

    prep_sum = sum(time_exclude_prepare)
    active_time = max(0.001, time_total - prep_sum)

    s1 = kill_value / active_time
    s2 = kill_value / cost_total if cost_total > 0 else 0.0

    if s1 >= s2:
        k = 0.7 * s1 + 0.3 * s2
    else:
        k = 0.5 * s1 + 0.5 * s2

    ia = int(initial_answer)
    exponent_denom = 1 + (2 + health_origin - health_final - ia)
    exponent = 1.0 / max(1, exponent_denom)
    return max(0.0, k) ** exponent
