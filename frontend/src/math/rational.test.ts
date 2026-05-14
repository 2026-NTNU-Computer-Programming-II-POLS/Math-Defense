import { describe, it, expect } from 'vitest'
import {
  RATIONAL_QUANTUM,
  quantize,
  parseFraction,
  numberToRational,
  rationalEquals,
  fractionToLatex,
} from './rational'

describe('quantize', () => {
  it('snaps to the nearest multiple of RATIONAL_QUANTUM', () => {
    expect(quantize(0.3)).toBe(0.25)
    expect(quantize(0.13)).toBe(0.25)
    expect(quantize(0.12)).toBe(0)
    expect(quantize(-0.4)).toBe(-0.5)
    expect(quantize(1.75)).toBe(1.75)
  })

  it('leaves exact dyadic values untouched', () => {
    expect(quantize(RATIONAL_QUANTUM)).toBe(0.25)
    expect(quantize(3)).toBe(3)
    expect(quantize(-2.5)).toBe(-2.5)
  })
})

describe('parseFraction', () => {
  it('parses proper fractions', () => {
    expect(parseFraction('3/2')).toEqual({ num: 3, den: 2 })
    expect(parseFraction('-5/4')).toEqual({ num: -5, den: 4 })
  })

  it('reduces fractions to lowest terms', () => {
    expect(parseFraction('4/8')).toEqual({ num: 1, den: 2 })
    expect(parseFraction('6/3')).toEqual({ num: 2, den: 1 })
  })

  it('normalizes a negative denominator onto the numerator', () => {
    expect(parseFraction('5/-4')).toEqual({ num: -5, den: 4 })
    expect(parseFraction('-5/-4')).toEqual({ num: 5, den: 4 })
  })

  it('parses integers', () => {
    expect(parseFraction('7')).toEqual({ num: 7, den: 1 })
    expect(parseFraction('-3')).toEqual({ num: -3, den: 1 })
    expect(parseFraction('+3')).toEqual({ num: 3, den: 1 })
    expect(parseFraction('0')).toEqual({ num: 0, den: 1 })
  })

  it('parses exact decimals', () => {
    expect(parseFraction('1.5')).toEqual({ num: 3, den: 2 })
    expect(parseFraction('-2.25')).toEqual({ num: -9, den: 4 })
    expect(parseFraction('.5')).toEqual({ num: 1, den: 2 })
    expect(parseFraction('3.')).toEqual({ num: 3, den: 1 })
  })

  it('trims surrounding whitespace', () => {
    expect(parseFraction('  3/2  ')).toEqual({ num: 3, den: 2 })
    expect(parseFraction(' -2.25 ')).toEqual({ num: -9, den: 4 })
  })

  it('rejects a zero denominator', () => {
    expect(parseFraction('1/0')).toBeNull()
    expect(parseFraction('0/0')).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(parseFraction('')).toBeNull()
    expect(parseFraction('   ')).toBeNull()
    expect(parseFraction('.')).toBeNull()
    expect(parseFraction('abc')).toBeNull()
    expect(parseFraction('1/2/3')).toBeNull()
    expect(parseFraction('1 / 2')).toBeNull()
    expect(parseFraction('3/')).toBeNull()
  })
})

describe('numberToRational', () => {
  it('is exact for dyadic inputs', () => {
    expect(numberToRational(0)).toEqual({ num: 0, den: 1 })
    expect(numberToRational(3)).toEqual({ num: 3, den: 1 })
    expect(numberToRational(-3)).toEqual({ num: -3, den: 1 })
    expect(numberToRational(1.5)).toEqual({ num: 3, den: 2 })
    expect(numberToRational(0.25)).toEqual({ num: 1, den: 4 })
    expect(numberToRational(-2.25)).toEqual({ num: -9, den: 4 })
    expect(numberToRational(0.125)).toEqual({ num: 1, den: 8 })
  })
})

describe('rationalEquals', () => {
  it('treats equal values as equal across denominators', () => {
    expect(rationalEquals({ num: 3, den: 2 }, { num: 3, den: 2 })).toBe(true)
    expect(rationalEquals({ num: 1, den: 2 }, { num: 2, den: 4 })).toBe(true)
    expect(rationalEquals({ num: 0, den: 1 }, { num: 0, den: 5 })).toBe(true)
  })

  it('treats unequal values as unequal', () => {
    expect(rationalEquals({ num: 3, den: 2 }, { num: 5, den: 4 })).toBe(false)
    expect(rationalEquals({ num: 1, den: 2 }, { num: -1, den: 2 })).toBe(false)
  })

  it('matches equivalent parsed forms', () => {
    expect(rationalEquals(parseFraction('3/2')!, parseFraction('1.5')!)).toBe(true)
  })
})

describe('fractionToLatex', () => {
  it('renders integers as-is', () => {
    expect(fractionToLatex(3)).toBe('3')
    expect(fractionToLatex(-3)).toBe('-3')
    expect(fractionToLatex(0)).toBe('0')
  })

  it('renders proper and improper fractions with \\frac', () => {
    expect(fractionToLatex(0.5)).toBe('\\frac{1}{2}')
    expect(fractionToLatex(1.5)).toBe('\\frac{3}{2}')
    expect(fractionToLatex(0.75)).toBe('\\frac{3}{4}')
  })

  it('pulls the sign in front of the fraction', () => {
    expect(fractionToLatex(-0.5)).toBe('-\\frac{1}{2}')
    expect(fractionToLatex(-1.25)).toBe('-\\frac{5}{4}')
  })
})
