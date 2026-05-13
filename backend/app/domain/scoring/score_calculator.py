"""Server-side V2 score formula — mirrors the WASM canonical definition.

F-ARCH-3 / B-ARCH-6: the canonical implementation lives in
``wasm/math_engine.c::compute_total_score``. When the application layer
injects ``total_score_fn`` (loaded by ``infrastructure.wasm_runtime``) we
delegate the entire computation to that single C function — both client and
server then route through the same source of truth and the duplication the
audit flagged is removed.

When ``total_score_fn`` is None (older binary without the export, or
wasmtime unavailable in the deployment) we fall back to the Python mirror
below. Parity between the WASM, the JS fallback, and this Python fallback
is enforced by ``shared/score_parity_fixtures.json`` (consumed by both
``test_score_calculator_parity.py`` and ``score-calculator.parity.test.ts``).
A change to the formula must update wasm/math_engine.c FIRST, then mirror
the algebra in this file and the JS fallback in WasmBridge.ts, then
regenerate the fixtures.

Used to verify frontend-submitted scores for anti-cheat logging. Returns
None when any required input is absent so callers can skip gracefully.

Design notes:
  kill_value=0  → score is always 0 (0**x = 0). Zero-kill runs score nothing by design.
  cost_total=0  → s2=0, k=0.7*s1 (no-tower penalty). Penalised 30% of s1 by design.
"""
from __future__ import annotations
import logging
import math
from typing import Callable

logger = logging.getLogger(__name__)

# Type alias for the injected canonical scorer. Signature mirrors the C ABI
# of compute_total_score: prep durations are pre-summed by the caller so the
# function takes flat scalars rather than a variable-length list.
TotalScoreFn = Callable[[float, float, float, float, float, float, int], float]


def recompute_total_score(
    kill_value: int | None,
    time_total: float | None,
    time_exclude_prepare: list[float] | None,
    cost_total: int | None,
    health_origin: int | None,
    health_final: int | None,
    initial_answer: bool | None,
    pow_fn: Callable[[float, float], float] = math.pow,
    total_score_fn: TotalScoreFn | None = None,
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

    ia = int(initial_answer)

    # Preferred path: delegate to the WASM canonical implementation. Bit-exact
    # parity with the client's totalScore is then guaranteed by both ends
    # calling the same function compiled from wasm/math_engine.c.
    if total_score_fn is not None:
        return float(total_score_fn(
            float(kill_value),
            float(time_total),
            float(prep_sum),
            float(cost_total),
            float(health_origin),
            float(health_final),
            ia,
        ))

    # Fallback: pure-Python mirror of compute_total_score for environments
    # without the WASM export. Algebra MUST stay in lock-step with the C
    # source; parity fixtures fail loudly if it drifts.
    active_time = max(0.001, time_total - prep_sum)
    s1 = kill_value / active_time
    s2 = kill_value / cost_total if cost_total > 0 else 0.0
    if s1 >= s2:
        k = 0.7 * s1 + 0.3 * s2
    else:
        k = 0.5 * s1 + 0.5 * s2

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
    return float(pow_fn(max(0.0, k), exponent))
