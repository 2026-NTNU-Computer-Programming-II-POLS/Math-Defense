import { describe, it, expect } from 'vitest'
import { applyCalcOp, checkMonomialAnswer } from './monomial'

describe('applyCalcOp — power rule', () => {
  it('differentiates a monomial', () => {
    expect(applyCalcOp({ coefficient: 3, exponent: 3 }, 'derivative')).toEqual({
      coefficient: 9,
      exponent: 2,
      collapsed: false,
    })
  })

  it('flags a collapse when the derivative drops the exponent to 0', () => {
    // d/dx(3x) = 3, a constant.
    expect(applyCalcOp({ coefficient: 3, exponent: 1 }, 'derivative')).toEqual({
      coefficient: 3,
      exponent: 0,
      collapsed: true,
    })
  })

  it('takes a second derivative directly', () => {
    // d²/dx²(3x^3) = 18x.
    expect(applyCalcOp({ coefficient: 3, exponent: 3 }, 'derivative2')).toEqual({
      coefficient: 18,
      exponent: 1,
      collapsed: false,
    })
  })

  it('flags a collapse when the second derivative zeroes the coefficient', () => {
    // d²/dx²(3x) = 0.
    expect(applyCalcOp({ coefficient: 3, exponent: 1 }, 'derivative2')).toMatchObject({
      coefficient: 0,
      collapsed: true,
    })
  })

  it('integrates to a fractional coefficient', () => {
    // ∫5x dx = (5/2)x^2.
    expect(applyCalcOp({ coefficient: 5, exponent: 1 }, 'integral')).toEqual({
      coefficient: 2.5,
      exponent: 2,
      collapsed: false,
    })
  })

  it('integrates to a clean integer coefficient', () => {
    // ∫3x^2 dx = x^3.
    expect(applyCalcOp({ coefficient: 3, exponent: 2 }, 'integral')).toEqual({
      coefficient: 1,
      exponent: 3,
      collapsed: false,
    })
  })

  it('snaps an ∫→d/dx round-trip back to an exact integer coefficient', () => {
    // ∫x^2 dx = (1/3)x^3; d/dx of that is exactly x^2 in math but 0.999…9 in
    // float. The result must snap to 1, not drift (which would render "(2/2)x").
    const integ = applyCalcOp({ coefficient: 1, exponent: 2 }, 'integral')
    const back = applyCalcOp(integ, 'derivative')
    expect(back).toEqual({ coefficient: 1, exponent: 2, collapsed: false })
  })

  it('does not snap a tiny non-zero coefficient to 0 (no false collapse)', () => {
    // A deep ∫-chain leaves |C| < 1; it must survive as a damage multiplier,
    // not be snapped to 0 and wrongly flagged collapsed.
    const r = applyCalcOp({ coefficient: 1e-9, exponent: 1 }, 'integral')
    expect(r.collapsed).toBe(false)
    expect(r.coefficient).toBeGreaterThan(0)
  })
})

describe('checkMonomialAnswer', () => {
  it('accepts the exact answer', () => {
    expect(checkMonomialAnswer('6x', { coefficient: 6, exponent: 1 })).toBe('correct')
  })

  it('accepts algebraically equivalent forms of a fractional coefficient', () => {
    const expected = { coefficient: 2.5, exponent: 2 }
    expect(checkMonomialAnswer('2.5x^2', expected)).toBe('correct')
    expect(checkMonomialAnswer('(5/2)x^2', expected)).toBe('correct')
    expect(checkMonomialAnswer('5x^2/2', expected)).toBe('correct')
  })

  it('accepts a bare constant answer', () => {
    expect(checkMonomialAnswer('6', { coefficient: 6, exponent: 0 })).toBe('correct')
  })

  it('accepts 0 for a fully-degenerate result', () => {
    expect(checkMonomialAnswer('0', { coefficient: 0, exponent: -1 })).toBe('correct')
  })

  it('accepts an implicit unit coefficient', () => {
    expect(checkMonomialAnswer('x^3', { coefficient: 1, exponent: 3 })).toBe('correct')
  })

  it('tolerates surrounding whitespace', () => {
    expect(checkMonomialAnswer('  6x  ', { coefficient: 6, exponent: 1 })).toBe('correct')
  })

  it('rejects a wrong sign', () => {
    expect(checkMonomialAnswer('-6x', { coefficient: 6, exponent: 1 })).toBe('incorrect')
  })

  it('rejects a wrong coefficient', () => {
    expect(checkMonomialAnswer('5x', { coefficient: 6, exponent: 1 })).toBe('incorrect')
  })

  it('rejects a wrong exponent', () => {
    expect(checkMonomialAnswer('6x^2', { coefficient: 6, exponent: 1 })).toBe('incorrect')
  })

  it('reports unparseable input distinctly from a wrong answer', () => {
    expect(checkMonomialAnswer('', { coefficient: 6, exponent: 1 })).toBe('unparseable')
    expect(checkMonomialAnswer('???', { coefficient: 6, exponent: 1 })).toBe('unparseable')
    // `y` is not a recognised variable.
    expect(checkMonomialAnswer('6y', { coefficient: 6, exponent: 1 })).toBe('unparseable')
  })
})
