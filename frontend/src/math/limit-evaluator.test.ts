import { describe, it, expect } from 'vitest'
import { parseLimitAnswer, formatLinearFactor, generateLimitQuestion } from './limit-evaluator'

describe('formatLinearFactor', () => {
  it('renders a positive limit point as (x - a)', () => {
    expect(formatLinearFactor(5)).toBe('(x - 5)')
  })
  it('renders a negative limit point as (x + |a|) — no "x - -2" double minus', () => {
    expect(formatLinearFactor(-2)).toBe('(x + 2)')
    expect(formatLinearFactor(-14)).toBe('(x + 14)')
  })
  it('renders the origin as a bare x — no redundant "x - 0"', () => {
    expect(formatLinearFactor(0)).toBe('x')
  })
})

describe('generateLimitQuestion — display sign safety across the grid', () => {
  // The grid spans x ∈ [-14, 14]; the tower's x is reused as the limit point,
  // so every legal column must produce a clean expression and matching denom.
  it('never emits a double minus or "x - 0" for any grid column / seed', () => {
    for (let a = -14; a <= 14; a++) {
      for (let seed = 0; seed < 16; seed++) {
        const q = generateLimitQuestion(a, seed)
        expect(q.fExpr).not.toContain('- -')
        expect(q.fExpr).not.toContain('(x - 0)')
        expect(q.denom).toBe(formatLinearFactor(a))
        expect(q.denom).not.toContain('- -')
      }
    }
  })

  it('matches denom to the expected sign-normalised factor', () => {
    expect(generateLimitQuestion(-2, 0).denom).toBe('(x + 2)')
    expect(generateLimitQuestion(7, 0).denom).toBe('(x - 7)')
    expect(generateLimitQuestion(0, 0).denom).toBe('x')
  })
})

describe('generateLimitQuestion — one-sided (x→a⁺) outcome consistency', () => {
  // Under x→a⁺ every polynomial-over-(x−a) branch has a definite limit, so a
  // DNE ('constant') answer is only legitimate for the oscillatory branch.
  // Conversely the oscillatory branch must never be mislabelled as a clean value.
  it('only the oscillatory branch is tagged DNE, and it always is', () => {
    let sawConstant = false
    let sawOscillatory = false
    for (let a = -14; a <= 14; a++) {
      for (let seed = 0; seed < 64; seed++) {
        const q = generateLimitQuestion(a, seed)
        const oscillatory = q.fExpr.includes('sin(')
        if (q.correctAnswer.outcome === 'constant') {
          sawConstant = true
          expect(oscillatory).toBe(true)
        }
        if (oscillatory) {
          sawOscillatory = true
          expect(q.correctAnswer.outcome).toBe('constant')
        }
      }
    }
    // Sanity: the sweep actually exercised both directions of the implication.
    expect(sawConstant).toBe(true)
    expect(sawOscillatory).toBe(true)
  })
})

describe('parseLimitAnswer', () => {
  it('parses positive infinity forms', () => {
    expect(parseLimitAnswer('+inf')).toEqual({ outcome: '+inf', value: Infinity })
    expect(parseLimitAnswer('inf')).toEqual({ outcome: '+inf', value: Infinity })
    expect(parseLimitAnswer('infinity')).toEqual({ outcome: '+inf', value: Infinity })
    expect(parseLimitAnswer('+infinity')).toEqual({ outcome: '+inf', value: Infinity })
    expect(parseLimitAnswer('  INF  ')).toEqual({ outcome: '+inf', value: Infinity })
    expect(parseLimitAnswer('Infinity')).toEqual({ outcome: '+inf', value: Infinity })
  })

  it('parses negative infinity forms', () => {
    expect(parseLimitAnswer('-inf')).toEqual({ outcome: '-inf', value: -Infinity })
    expect(parseLimitAnswer('-infinity')).toEqual({ outcome: '-inf', value: -Infinity })
    expect(parseLimitAnswer(' -INF ')).toEqual({ outcome: '-inf', value: -Infinity })
  })

  it('parses zero (with or without sign / decimal point)', () => {
    expect(parseLimitAnswer('0')).toEqual({ outcome: 'zero', value: 0 })
    expect(parseLimitAnswer('+0')).toEqual({ outcome: 'zero', value: 0 })
    expect(parseLimitAnswer('-0')).toEqual({ outcome: 'zero', value: 0 })
    expect(parseLimitAnswer('0.0')).toEqual({ outcome: 'zero', value: 0 })
  })

  it('parses positive integers and decimals to +c', () => {
    expect(parseLimitAnswer('3')).toEqual({ outcome: '+c', value: 3 })
    expect(parseLimitAnswer('+3')).toEqual({ outcome: '+c', value: 3 })
    expect(parseLimitAnswer('2.5')).toEqual({ outcome: '+c', value: 2.5 })
    expect(parseLimitAnswer(' 7 ')).toEqual({ outcome: '+c', value: 7 })
  })

  it('parses negative integers and decimals to -c', () => {
    expect(parseLimitAnswer('-2')).toEqual({ outcome: '-c', value: -2 })
    expect(parseLimitAnswer('-1.5')).toEqual({ outcome: '-c', value: -1.5 })
    expect(parseLimitAnswer(' -4 ')).toEqual({ outcome: '-c', value: -4 })
  })

  it('parses DNE (case-insensitive) to constant outcome', () => {
    expect(parseLimitAnswer('DNE')).toEqual({ outcome: 'constant', value: 0 })
    expect(parseLimitAnswer('dne')).toEqual({ outcome: 'constant', value: 0 })
    expect(parseLimitAnswer(' DnE ')).toEqual({ outcome: 'constant', value: 0 })
  })

  it('returns null for empty or unparseable input', () => {
    expect(parseLimitAnswer('')).toBeNull()
    expect(parseLimitAnswer('   ')).toBeNull()
    expect(parseLimitAnswer('abc')).toBeNull()
    expect(parseLimitAnswer('1+1')).toBeNull()
    expect(parseLimitAnswer('NaN')).toBeNull()
    expect(parseLimitAnswer('limit')).toBeNull()
    expect(parseLimitAnswer('--3')).toBeNull()
  })
})
