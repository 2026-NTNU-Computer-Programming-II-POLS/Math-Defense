import { describe, it, expect } from 'vitest'
import { formatCoefficient, toFraction } from './formatters'

describe('formatCoefficient', () => {
  it('uses the implicit-coefficient convention for ±1', () => {
    expect(formatCoefficient(1)).toBe('')
    expect(formatCoefficient(-1)).toBe('-')
  })

  it('renders plain integers verbatim', () => {
    expect(formatCoefficient(6)).toBe('6')
    expect(formatCoefficient(-4)).toBe('-4')
  })

  it('renders a clean fraction in parentheses', () => {
    expect(formatCoefficient(2.5)).toBe('(5/2)')
    expect(formatCoefficient(1 / 3)).toBe('(1/3)')
  })

  it('snaps a float-drifted near-integer instead of rendering "(2/2)"', () => {
    // 0.999999999999 arises from an ∫→d/dx round-trip; must show "x", not "(2/2)x".
    expect(formatCoefficient(0.999999999999)).toBe('')
    expect(formatCoefficient(2.0000000001)).toBe('2')
  })

  it('does not snap a genuine fraction toward an integer', () => {
    expect(formatCoefficient(2.5)).toBe('(5/2)')
  })
})

describe('toFraction', () => {
  it('finds a small-denominator fraction', () => {
    expect(toFraction(0.5)).toBe('1/2')
    expect(toFraction(2.5)).toBe('5/2')
  })

  it('returns null when no denominator up to 10 fits', () => {
    expect(toFraction(0.123456)).toBeNull()
  })
})
