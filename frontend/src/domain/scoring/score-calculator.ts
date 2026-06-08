// F-ARCH-3 / B-ARCH-6: the canonical V3 score CORE lives in
// wasm/math_engine.c::compute_total_score. This module computes the s1/s2/k/
// exponent breakdown locally for the ScoreResultView display, but the core
// value always comes from `computeTotalScoreWasm` so it agrees with the
// server-side wasmtime-py recomputation to the last ULP. When the WASM module
// hasn't been rebuilt with the export yet, the bridge's JS fallback runs the
// same algebra and parity is enforced by shared/score_parity_fixtures.json
// (consumed by both sides).
//
// `totalScore` here is the DISPLAY value = core × SCORE_SCALE_K ×
// difficultyMultiplier(star). The server applies the identical transform from
// the trusted session row, so this equals the stored/leaderboard total_score.
// The modern client does NOT submit total_score — the server is the
// sole authority — so this scaling is display-only and never gates a session.
//
// Design notes:
//   V3: the score base is killValue (volume), softened by the
//     survival/first-answer exponent and scaled by the rate-blend k. The old
//     V2 used base=k, which ignored volume and inverted the HP penalty when
//     k<1. computeTotalScoreWasm returns this canonical 7-input *core*; this
//     module then multiplies by SCORE_SCALE_K and difficultyMultiplier(star)
//     to get the displayed totalScore, mirroring the server
//     (session_service._verify_score). This is display-only: the modern client
//     does not submit total_score, so the server stays the sole authority.
//   killValue=0  → totalScore is always 0 (0**x = 0). Zero-kill runs score nothing by design.
//   costTotal=0  → s2=0, alpha=1, k=s1 (no penalty; the dominant rate carries
//                  the blend). The pre-Q3 piecewise weight applied a 30% penalty
//                  here; the continuous alpha blend removes that cliff.
//   mUsed is a debug field only; the backend anti-cheat verifier does not track it.
import { computeTotalScoreWasm } from '@/math/WasmBridge'

// V3 post-core transforms — mirror backend domain/scoring/score_calculator.py
// (SCORE_SCALE_K + difficulty_multiplier). Keep both in lock-step: the server
// applies the identical scale so the end-of-game total matches the stored /
// leaderboard value. 0.25·(star−1) is exact in IEEE-754, so the multiplier is
// bit-identical across JS and Python.
//
// K = 1 (identity): the core already lands in the thousands-to-~100k range at
// realistic kill_values. K > 1 risks the server's TOTAL_SCORE_MAX (1e6) clamp
// on high-star runs and would flatten top-end ranking — see the backend note.
export const SCORE_SCALE_K = 1
export function difficultyMultiplier(starRating: number): number {
  return 1 + 0.25 * (starRating - 1)
}

export interface ScoreInput {
  killValue: number
  timeTotal: number               // seconds
  timeExcludePrepare: number[]    // duration of each prep phase in seconds
  costTotal: number
  healthOrigin: number
  healthFinal: number
  initialAnswer: 0 | 1
  starRating: number              // 1–5; drives the difficulty multiplier
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
  const core = computeTotalScoreWasm(
    input.killValue,
    input.timeTotal,
    prepTimeSum,
    input.costTotal,
    input.healthOrigin,
    input.healthFinal,
    input.initialAnswer,
  )
  // V3: lift the core into the player-facing range and apply difficulty. The
  // server applies the identical transform from the trusted star_rating, so
  // this displayed value equals the stored/leaderboard total_score.
  const totalScore = core * SCORE_SCALE_K * difficultyMultiplier(input.starRating)

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
