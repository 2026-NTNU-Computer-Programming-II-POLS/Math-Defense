"""Server-side V2 score formula — mirrors frontend src/domain/scoring/score-calculator.ts.

Used to verify frontend-submitted scores for anti-cheat logging.
Returns None when any required input is absent so callers can skip gracefully.

Design notes:
  kill_value=0  → score is always 0 (0**x = 0). Zero-kill runs score nothing by design.
  cost_total=0  → s2=0, k=0.7*s1 (no-tower penalty). Penalised 30% of s1 by design.
  mUsed (0.7 or 0.5) is returned in the frontend ScoreBreakdown for debugging but not
  here; the scalar score is all that is needed for anti-cheat comparison.
"""
from __future__ import annotations
import logging

logger = logging.getLogger(__name__)


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
    if prep_sum > time_total + 0.001:
        return None
    # Clamp to 0.001 to prevent ZeroDivisionError from timing precision errors
    active_time = max(0.001, time_total - prep_sum)

    s1 = kill_value / active_time
    s2 = kill_value / cost_total if cost_total > 0 else 0.0

    if s1 >= s2:
        k = 0.7 * s1 + 0.3 * s2
    else:
        k = 0.5 * s1 + 0.5 * s2

    ia = int(initial_answer)
    exponent_denom = 1 + (2 + health_origin - health_final - ia)
    if exponent_denom < 1:
        logger.warning(
            "score_calculator: impossible HP delta (health_final=%d > health_origin=%d); "
            "clamping exponent_denom %d → 1",
            health_final,
            health_origin,
            exponent_denom,
        )
    exponent = 1.0 / max(1, exponent_denom)
    return max(0.0, k) ** exponent
