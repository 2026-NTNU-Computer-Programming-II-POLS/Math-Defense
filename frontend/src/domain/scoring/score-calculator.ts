// F-ARCH-3 / B-ARCH-6: the canonical V2 score formula lives in
// wasm/math_engine.c::compute_total_score. This module computes the s1/s2/k/
// exponent breakdown locally for the ScoreResultView display, but `totalScore`
// always comes from `computeTotalScoreWasm` so frontend and the server-side
// wasmtime-py recomputation agree to the last ULP. When the WASM module
// hasn't been rebuilt with the new export yet, the bridge's JS fallback
// runs the same algebra and parity is enforced by
// shared/score_parity_fixtures.json (consumed by both sides).
//
// Design notes:
//   killValue=0  → totalScore is always 0 (0**x = 0). Zero-kill runs score nothing by design.
//   costTotal=0  → s2=0, alpha=1, k=s1 (no penalty; the dominant rate carries
//                  the blend). The pre-Q3 piecewise weight applied a 30% penalty
//                  here; the continuous alpha blend removes that cliff.
//   mUsed is a debug field only; the backend anti-cheat verifier does not track it.
import { computeTotalScoreWasm } from '@/math/WasmBridge'

export interface ScoreInput {
  killValue: number
  timeTotal: number               // seconds
  timeExcludePrepare: number[]    // duration of each prep phase in seconds
  costTotal: number
  healthOrigin: number
  healthFinal: number
  initialAnswer: 0 | 1
}

export interface ScoreBreakdown {
  s1: number
  s2: number
  k: number
  exponent: number
  totalScore: number
  activeTime: number
  mUsed: number
}

export function calculateScore(input: ScoreInput): ScoreBreakdown {
  const prepTimeSum = input.timeExcludePrepare.reduce((a, b) => a + b, 0)
  const activeTime = Math.max(0.001, input.timeTotal - prepTimeSum)

  const s1 = input.killValue / activeTime
  const s2 = input.costTotal > 0 ? input.killValue / input.costTotal : 0

  // Q3: continuous K blend. The old piecewise weight (0.7/0.3 vs 0.5/0.5) had
  // a discontinuity at s1 == s2; alpha = s1/(s1+s2) interpolates smoothly.
  // The zero-kill case (s1+s2 == 0) short-circuits to k=0 to keep 0**x = 0.
  // mUsed (debug-only field) reports the s1-side weight so legacy tooltips
  // still surface "how much of the score came from time vs cost".
  const denomK = s1 + s2
  const alpha = denomK > 0 ? s1 / denomK : 0
  const k = alpha * s1 + (1 - alpha) * s2
  const mUsed = alpha

  // Invariant: healthOrigin must equal INITIAL_HP (set by createInitialState in GameState.ts).
  // Under normal game rules healthFinal ≤ healthOrigin, so rawExponentDenom ≥ 2 and the clamp
  // below never fires. The only path to rawExponentDenom < 1 is backend data that reports a
  // session-end HP above the session-start HP — impossible without a mechanic that raises maxHp
  // beyond INITIAL_HP, which does not exist.
  const rawExponentDenom = 1 + (2 + input.healthOrigin - input.healthFinal - input.initialAnswer)
  if (rawExponentDenom < 1) {
    console.warn(
      `score-calculator: impossible HP delta (healthFinal=${input.healthFinal} > healthOrigin=${input.healthOrigin}); clamping exponentDenom ${rawExponentDenom} → 1`,
    )
  }
  const exponentDenom = Math.max(1, rawExponentDenom)
  // Q1: sqrt-softened exponent (was 1/denom). Smooths the HP-loss penalty.
  const exponent = 1 / Math.sqrt(exponentDenom)
  // Source-of-truth score lives in WASM (wasm/math_engine.c). The breakdown
  // above is recomputed locally only because ScoreResultView displays
  // intermediate fields; the value sent to/verified by the server is the
  // WASM-derived totalScore.
  const totalScore = computeTotalScoreWasm(
    input.killValue,
    input.timeTotal,
    prepTimeSum,
    input.costTotal,
    input.healthOrigin,
    input.healthFinal,
    input.initialAnswer,
  )

  return {
    s1: round4(s1),
    s2: round4(s2),
    k: round4(k),
    exponent: round4(exponent),
    totalScore: round4(totalScore),
    activeTime: round4(activeTime),
    mUsed,
  }
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000
}
