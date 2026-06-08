"""Server-side V3 score formula — mirrors the WASM canonical definition.

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
  V3: the score base is kill_value (volume), softened by the
  survival/first-answer exponent and scaled by the rate-blend k:
      core = kill_value**(1/sqrt(denom)) * k
  The old V2 used base=k, which ignored volume and inverted the HP penalty
  when k<1. ``recompute_total_score`` returns this canonical 7-input *core*;
  the caller multiplies by SCORE_SCALE_K and difficulty_multiplier(star) to
  get the stored/displayed total_score (see session_service._verify_score).
  kill_value=0  → core is always 0 (0**x = 0). Zero-kill runs score nothing by design.
  cost_total=0  → s2=0, alpha=1, k=s1 (no penalty; the dominant rate carries
                  the blend). The pre-Q3 piecewise weight applied a 30% penalty
                  here; the continuous alpha blend removes that cliff.
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

    # Q3: continuous K blend. The old piecewise weight (0.7/0.3 vs 0.5/0.5)
    # had a discontinuity at s1 == s2 that produced visible score jumps for
    # runs that crossed it. Weighting by alpha = s1/(s1+s2) interpolates
    # smoothly; the s1+s2 == 0 zero-kill case short-circuits to k=0.
    denom_k = s1 + s2
    alpha = (s1 / denom_k) if denom_k > 0.0 else 0.0
    k = alpha * s1 + (1.0 - alpha) * s2

    exponent_denom = 1 + (2 + health_origin - health_final - ia)
    if exponent_denom < 1:
        logger.warning(
            "score_calculator: impossible HP delta (health_final=%d > health_origin=%d); "
            "clamping exponent_denom %d → 1",
            health_final,
            health_origin,
            exponent_denom,
        )
    # Q1: sqrt-softened exponent (was 1/denom). Smooths the HP-loss penalty so
    # high-difficulty plays are no longer crushed.
    exponent = 1.0 / math.sqrt(max(1, exponent_denom))
    # V3: base is kill_value (volume), softened by the exponent and
    # scaled by k. See wasm/math_engine.c::compute_total_score for the
    # rationale (old V2 used base=k, ignoring volume and inverting the HP
    # penalty when k<1). The scale K and difficulty multiplier are applied by
    # the caller, NOT here — this returns the canonical 7-input core.
    return float(pow_fn(max(0.0, kill_value), exponent) * k)


# ── V3 post-core transforms (applied by the application layer, NOT inside the
# canonical core above, so the parity fixtures keep testing the pure 7-input
# formula). Mirrored on the frontend in domain/scoring/score-calculator.ts —
# keep both in lock-step. ──

# Magnitude constant applied on top of the canonical core. The V3 core
# (killValue**exponent * k) already spans roughly tens to ~1e5 at realistic
# kill_values — the same order of magnitude as the legacy integer ``score``
# (per-level caps 5,000-100,000) — so
# COALESCE(total_score, score) mixes old and new rows without inversion and no
# extra inflation is needed (K = 1, identity). Kept as a named, front/back-
# mirrored knob for future retuning. WARNING: K > 1 risks the TOTAL_SCORE_MAX
# (1e6) clamp on high-star runs — the L5 realistic-max core is ~135k, so even
# K=10 would slam L4/L5 into the cap and flatten top-end ranking. Pure scale —
# does NOT change ranking order.
SCORE_SCALE_K = 1.0


def difficulty_multiplier(star_rating: int) -> float:
    """Reward higher-difficulty (higher star) runs. 1★→1.0 … 5★→2.0.

    0.25 and the integer (star-1) are exact in IEEE-754, so this multiplier is
    a bit-exact double on both the frontend and the backend — the server-side
    application of K * difficulty stays reproducible across languages.
    """
    return 1.0 + 0.25 * (star_rating - 1)
