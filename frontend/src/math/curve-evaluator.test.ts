import { describe, it, expect } from 'vitest'
import { curveToLatex } from './curve-evaluator'
import type { PolynomialCurve } from './curve-types'

function poly(degree: 1 | 2 | 3, coefficients: number[]): PolynomialCurve {
  return { family: 'polynomial', degree, coefficients }
}

describe('curveToLatex — exact fraction rendering', () => {
  it('renders a degree-1 polynomial with dyadic coefficients as exact fractions', () => {
    expect(curveToLatex(poly(1, [0.5, -1.25]))).toBe('y = \\frac{1}{2}x - \\frac{5}{4}')
  })

  it('renders unit and integer coefficients without a \\frac', () => {
    expect(curveToLatex(poly(1, [1, 3]))).toBe('y = x + 3')
    expect(curveToLatex(poly(1, [-1, 0]))).toBe('y = -x')
  })

  it('renders a degree-2 polynomial exactly (no decimal rounding)', () => {
    expect(curveToLatex(poly(2, [0.75, -0.5, 2]))).toBe(
      'y = \\frac{3}{4}x^2 - \\frac{1}{2}x + 2',
    )
  })

  it('renders a degree-3 polynomial with a fine-grained solved term exactly', () => {
    // 0.125 would round to "0.13" under the old toFixed(2) formatter; the
    // fraction renderer keeps it exact.
    expect(curveToLatex(poly(3, [0.25, -1, 1.5, -0.125]))).toBe(
      'y = \\frac{1}{4}x^3 - x^2 + \\frac{3}{2}x - \\frac{1}{8}',
    )
  })

  it('omits zero coefficients but keeps a lone zero constant', () => {
    expect(curveToLatex(poly(2, [0.5, 0, -1]))).toBe('y = \\frac{1}{2}x^2 - 1')
    expect(curveToLatex(poly(1, [0, 0]))).toBe('y = 0')
  })
})
