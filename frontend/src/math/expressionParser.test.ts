/**
 * expressionParser coverage — focuses on the eval-depth / length-cap parity
 * fixed alongside the Magic-tower review (F-BUG-17 follow-up). A long but
 * otherwise valid curve that fits inside MAX_EXPR_LEN must parse rather than
 * being rejected as "Invalid expression" by a too-small recursion guard.
 */
import { describe, it, expect } from 'vitest'
import { parseExpression, MAX_EXPR_LEN } from './expressionParser'

describe('parseExpression', () => {
  it('parses a basic polynomial and evaluates it', () => {
    const fn = parseExpression('2*x^2 - x + 5')
    expect(fn).not.toBeNull()
    expect(fn!(3)).toBeCloseTo(2 * 9 - 3 + 5, 10) // 20
  })

  it('rejects an unparseable expression', () => {
    expect(parseExpression('not-a-curve')).toBeNull()
    expect(parseExpression('')).toBeNull()
    expect(parseExpression('x +')).toBeNull()
  })

  it('rejects expressions longer than MAX_EXPR_LEN', () => {
    const tooLong = '1' + '+1'.repeat(MAX_EXPR_LEN) // well over the cap
    expect(tooLong.length).toBeGreaterThan(MAX_EXPR_LEN)
    expect(parseExpression(tooLong)).toBeNull()
  })

  it('parses a long additive fold that fits inside MAX_EXPR_LEN', () => {
    // ~66 `x` terms — deeper than the old MAX_EVAL_DEPTH of 64, which used to
    // throw and surface this in-length curve as "Invalid expression".
    const terms = 66
    const expr = Array(terms).fill('x').join('+')
    expect(expr.length).toBeLessThanOrEqual(MAX_EXPR_LEN)
    const fn = parseExpression(expr)
    expect(fn).not.toBeNull()
    expect(fn!(2)).toBeCloseTo(terms * 2, 10)
  })

  it('parses a deep unary-minus chain that fits inside MAX_EXPR_LEN', () => {
    // 80 leading minus signs — even sign cancels to +x.
    const expr = '-'.repeat(80) + 'x'
    expect(expr.length).toBeLessThanOrEqual(MAX_EXPR_LEN)
    const fn = parseExpression(expr)
    expect(fn).not.toBeNull()
    expect(fn!(5)).toBeCloseTo(5, 10)
  })
})
