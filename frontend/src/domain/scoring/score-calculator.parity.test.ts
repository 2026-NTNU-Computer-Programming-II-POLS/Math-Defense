// B-ARCH-6 — shared parity fixtures for the V2 score formula.
//
// The same JSON file is consumed by backend/tests/test_score_calculator_parity.py
// so a change to the formula must regenerate the fixture set and update both
// implementations in lock-step. Without this, the Python and TS recomputations
// can drift silently and produce false-positive replay_mismatch rejections.

import { describe, expect, it } from 'vitest'
import fixturesRaw from '../../../../shared/score_parity_fixtures.json'

import { calculateScore } from './score-calculator'

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

describe('score-calculator parity', () => {
  it.each(fixtures)('matches shared fixture %#', (caseData) => {
    const breakdown = calculateScore({
      killValue: caseData.input.kill_value,
      timeTotal: caseData.input.time_total,
      timeExcludePrepare: caseData.input.time_exclude_prepare,
      costTotal: caseData.input.cost_total,
      healthOrigin: caseData.input.health_origin,
      healthFinal: caseData.input.health_final,
      initialAnswer: caseData.input.initial_answer ? 1 : 0,
    })

    if (caseData.expected === null) return

    // round4 in TS vs raw float on the Python side: allow the same 5e-5
    // upper bound on round4 error that the backend's ε already accounts for.
    expect(Math.abs(breakdown.totalScore - caseData.expected)).toBeLessThan(1e-4)
  })
})
