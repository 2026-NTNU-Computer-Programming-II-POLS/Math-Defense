/**
 * Pure monomial calculus — the power rule applied to a single term C·x^n,
 * plus typed-answer checking for the Calculus tower quiz.
 *
 * Lives in math/ (shared primitives) so CalculusTowerSystem (which mutates the
 * tower) and CalculusPanel (which quizzes the player) derive the operation
 * result from the SAME code. There must be no second source of truth: the
 * answer the panel grades against is exactly the state the system applies.
 */
import { parseExpression } from './expressionParser'

export type CalcOp = 'derivative' | 'derivative2' | 'integral'

export interface Monomial {
  coefficient: number
  exponent: number
}

export interface CalcOpResult {
  coefficient: number
  exponent: number
  /**
   * True when the operation degenerates the monomial — the coefficient falls
   * to 0, or the exponent drops to 0 (a bare constant). The Calculus tower
   * treats a collapse as a free fallback to f(x) = x.
   */
  collapsed: boolean
}

// Integration coefficients (1/3, 1/6, …) land just shy of their true value in
// float. Snap to 1e-12 so display and comparison stay stable.
const COEFF_PRECISION = 1e12

// A round-trip like ∫ then d/dx yields 0.999999999999 instead of 1, which then
// renders as a degenerate "(2/2)x" and keeps drifting through later ops. Snap a
// coefficient within this tolerance of an integer back to that integer so the
// state, its display, and grading all use the clean value.
const INTEGER_SNAP_EPSILON = 1e-9

// Only snaps toward a NON-ZERO integer: float drift is always toward a nonzero
// integer (a genuine zero is computed exactly, e.g. C·n·0). Snapping a tiny
// nonzero coefficient to 0 would wrongly trip the `coefficient === 0` collapse
// and erase a small-but-valid damage multiplier (a deep ∫-chain leaves |C| < 1).
function snapNearInteger(c: number): number {
  const nearest = Math.round(c)
  return nearest !== 0 && Math.abs(c - nearest) < INTEGER_SNAP_EPSILON ? nearest : c
}

/** Applies a calculus operation to the monomial C·x^n via the power rule. */
export function applyCalcOp(m: Monomial, op: CalcOp): CalcOpResult {
  let coefficient: number
  let exponent: number

  if (op === 'derivative') {
    coefficient = m.coefficient * m.exponent
    exponent = m.exponent - 1
  } else if (op === 'derivative2') {
    coefficient = m.coefficient * m.exponent * (m.exponent - 1)
    exponent = m.exponent - 2
  } else {
    coefficient = Math.round((m.coefficient / (m.exponent + 1)) * COEFF_PRECISION) / COEFF_PRECISION
    exponent = m.exponent + 1
  }

  coefficient = snapNearInteger(coefficient)

  const collapsed =
    coefficient === 0 || (op === 'derivative' && m.exponent === 0) || exponent === 0

  return { coefficient, exponent, collapsed }
}

export type AnswerVerdict = 'correct' | 'incorrect' | 'unparseable'

// Mixed-sign, non-integer sample points. Two genuinely different expressions
// agreeing at all seven is effectively impossible, while any algebraically
// equivalent form of the answer agrees at every point by construction.
const SAMPLE_POINTS = [0.37, 1.41, -0.83, 2.27, -1.92, 3.13, -2.71]

/**
 * Grades a player's typed expression against the expected monomial answer.
 * Comparison is numeric (sampled), so any algebraically equivalent form is
 * accepted — `2.5x^2`, `(5/2)x^2`, and `5x^2/2` all match (5/2)·x².
 */
export function checkMonomialAnswer(input: string, expected: Monomial): AnswerVerdict {
  const fn = parseExpression(input)
  if (!fn) return 'unparseable'

  for (const x of SAMPLE_POINTS) {
    // A zero coefficient is the zero function regardless of exponent (which may
    // even be negative for a fully-degenerate second derivative).
    const expectedVal =
      expected.coefficient === 0 ? 0 : expected.coefficient * Math.pow(x, expected.exponent)
    let actual: number
    try {
      actual = fn(x)
    } catch {
      return 'unparseable'
    }
    if (!Number.isFinite(actual)) return 'incorrect'
    const tolerance = 1e-6 * (1 + Math.abs(expectedVal))
    if (Math.abs(actual - expectedVal) > tolerance) return 'incorrect'
  }
  return 'correct'
}
