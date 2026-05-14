/**
 * Rational primitives — the single source of truth for "what is a rational,
 * and how do we parse / format / quantize / compare one".
 *
 * Pure and dependency-free: the bottom layer consumed by the level generator,
 * the curve renderer, and the Initial Answer view.
 */

/** The dyadic grid: every generated coordinate and coefficient is a multiple of this. */
export const RATIONAL_QUANTUM = 0.25

export interface Rational {
  readonly num: number
  readonly den: number
}

function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b !== 0) {
    const t = b
    b = a % b
    a = t
  }
  return a || 1
}

/** Reduce a fraction to lowest terms with a positive denominator. */
function reduce(num: number, den: number): Rational {
  if (den < 0) {
    num = -num
    den = -den
  }
  const g = gcd(num, den)
  return { num: num / g, den: den / g }
}

/** Snap a value to the nearest multiple of RATIONAL_QUANTUM. */
export function quantize(value: number): number {
  return Math.round(value / RATIONAL_QUANTUM) * RATIONAL_QUANTUM
}

/**
 * Parse a student-entered answer into a reduced rational. Accepts fractions
 * ("3/2", "-5/4"), integers ("7", "-3"), and exact decimals ("1.5", "-2.25").
 * Whitespace is trimmed from the ends. Returns `null` on malformed input or a
 * zero denominator.
 */
export function parseFraction(input: string): Rational | null {
  const s = input.trim()
  if (s === '') return null

  const fracMatch = s.match(/^([+-]?\d+)\/([+-]?\d+)$/)
  if (fracMatch) {
    const den = Number(fracMatch[2])
    if (den === 0) return null
    return reduce(Number(fracMatch[1]), den)
  }

  if (/^[+-]?\d+$/.test(s)) {
    return reduce(Number(s), 1)
  }

  const decMatch = s.match(/^([+-]?)(\d*)\.(\d*)$/)
  if (decMatch) {
    const intPart = decMatch[2]
    const fracPart = decMatch[3]
    if (intPart === '' && fracPart === '') return null
    const sign = decMatch[1] === '-' ? -1 : 1
    const num = sign * Number(intPart + fracPart)
    const den = 10 ** fracPart.length
    return reduce(num, den)
  }

  return null
}

/**
 * Convert a number to an exact rational. Exact for dyadic inputs (the only
 * values the generator produces); for non-dyadic inputs it stops doubling at a
 * safe cap and reduces the rounded result.
 */
export function numberToRational(value: number): Rational {
  let num = value
  let den = 1
  while (!Number.isInteger(num) && den < (1 << 30)) {
    num *= 2
    den *= 2
  }
  return reduce(Math.round(num), den)
}

/** Exact equality via cross-multiplication — no epsilon. */
export function rationalEquals(a: Rational, b: Rational): boolean {
  return a.num * b.den === b.num * a.den
}

/**
 * Render a dyadic value as exact KaTeX: integers as-is ("3", "-3"), fractions
 * as \frac{p}{q} with the sign pulled to the front ("-\frac{5}{4}").
 */
export function fractionToLatex(value: number): string {
  const { num, den } = numberToRational(value)
  if (den === 1) return String(num)
  const sign = num < 0 ? '-' : ''
  return `${sign}\\frac{${Math.abs(num)}}{${den}}`
}
