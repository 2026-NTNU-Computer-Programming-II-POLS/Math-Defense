// B-ARCH-6 — shared parity fixtures for the V2 score formula.
//
// The same JSON file is consumed by backend/tests/test_score_calculator_parity.py
// so a change to the formula must regenerate the fixture set and update both
// implementations in lock-step. Without this, the Python and TS recomputations
// can drift silently and produce false-positive replay_mismatch rejections.
//
// Two assertions per fixture:
//   1. The raw formula output (computeTotalScoreWasm) matches the fixture. This
//      is the cross-language parity check; it compares the same un-rounded value
//      the server verifies, so it shares the backend's tight tolerance instead
//      of a looser bound inflated by round4's ~5e-5 display rounding.
//   2. calculateScore().totalScore equals round4 of that raw value scaled by
//      SCORE_SCALE_K × difficultyMultiplier(star) — verifies the domain wrapper
//      wires the inputs through and applies the V3 magnitude/difficulty
//      transform plus display rounding.

import { describe, expect, it } from 'vitest'
import fixturesRaw from '../../../../shared/score_parity_fixtures.json'

import { computeTotalScoreWasm } from '@/math/WasmBridge'
import { calculateScore, SCORE_SCALE_K, difficultyMultiplier } from './score-calculator'

interface ParityCase {
  input: {
    kill_value: number
    time_total: number
    time_exclude_prepare: number[]
    cost_total: number
    health_origin: number
    health_final: number
    initial_answer: boolean
  }
  expected: number | null
}

const fixtures = fixturesRaw as ParityCase[]

// Shared cross-implementation parity tolerance — kept identical to
// backend/tests/test_score_calculator_parity.py. Both suites compare the raw
// formula output against the same fixtures, so the only admissible difference
// is last-ULP pow variance across libm implementations.
const PARITY_TOLERANCE = 1e-12

// Mirror of the module-private round4 in score-calculator.ts.
const round4 = (v: number): number => Math.round(v * 10000) / 10000

describe('score-calculator parity', () => {
  it.each(fixtures)('matches shared fixture %#', (caseData) => {
    if (caseData.expected === null) return

    const prepSum = caseData.input.time_exclude_prepare.reduce((a, b) => a + b, 0)
    const actual = computeTotalScoreWasm(
      caseData.input.kill_value,
      caseData.input.time_total,
      prepSum,
      caseData.input.cost_total,
      caseData.input.health_origin,
      caseData.input.health_final,
      caseData.input.initial_answer ? 1 : 0,
    )

    // Cross-language parity: raw formula output vs the shared fixture.
    expect(Math.abs(actual - caseData.expected)).toBeLessThan(PARITY_TOLERANCE)

    // Display wrapper: calculateScore must surface round4 of the same value.
    const breakdown = calculateScore({
      killValue: caseData.input.kill_value,
      timeTotal: caseData.input.time_total,
      timeExcludePrepare: caseData.input.time_exclude_prepare,
      costTotal: caseData.input.cost_total,
      healthOrigin: caseData.input.health_origin,
      healthFinal: caseData.input.health_final,
      initialAnswer: caseData.input.initial_answer ? 1 : 0,
      starRating: 1,
    })
    // V3: calculateScore lifts the core by SCORE_SCALE_K × difficulty(star).
    // The fixtures carry no star, so we pin star=1 (multiplier 1.0) here.
    expect(breakdown.totalScore).toBe(
      round4(actual * SCORE_SCALE_K * difficultyMultiplier(1)),
    )
  })
})
