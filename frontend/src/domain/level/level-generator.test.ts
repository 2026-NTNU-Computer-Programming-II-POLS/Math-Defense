/**
 * V3 rework — JS (v1) level generator contract.
 *
 * Pins the fraction-fill-in invariants: every generated curve is a polynomial
 * with dyadic coefficients, P* lies on the RATIONAL_QUANTUM grid, P* is the
 * unique common intersection inside the disclosure region, degree-3 multisets
 * bias P* toward the origin, and every multiset in DIFFICULTY_TABLE generates
 * within the retry budget.
 */
import { describe, it, expect } from 'vitest'
import { generateLevel } from './level-generator'
import { DIFFICULTY_TABLE, getMultisetsForStar } from '@/data/difficulty-defs'
import { RATIONAL_QUANTUM } from '@/math/rational'
import { evaluate } from '@/math/curve-evaluator'
import { countCommonIntersectionsInInterval } from '@/math/intersection-solver'
import { mulberry32 } from '@/math/MathUtils'

/** A value is dyadic if some power-of-two multiple of it is an integer. */
function isDyadic(value: number): boolean {
  let v = value
  for (let i = 0; i < 30; i++) {
    if (Number.isInteger(v)) return true
    v *= 2
  }
  return false
}

function isQuantum(value: number): boolean {
  return Number.isInteger(value / RATIONAL_QUANTUM)
}

/**
 * An rng whose first draw deterministically selects `msIndex` from the star's
 * multiset pool, then continues as a normal mulberry32 stream. Lets the test
 * exercise a specific multiset through `generateLevel`'s public surface.
 */
function rngForMultiset(star: number, msIndex: number, seed: number): () => number {
  const pool = getMultisetsForStar(star)
  const base = mulberry32(seed)
  let first = true
  return () => {
    if (first) {
      first = false
      return (msIndex + 0.5) / pool.length
    }
    return base()
  }
}

const STARS = Object.keys(DIFFICULTY_TABLE).map(Number)

describe('generateLevel (v1) — fraction fill-in invariants', () => {
  it('every multiset in DIFFICULTY_TABLE generates a structurally valid polynomial level', () => {
    for (const star of STARS) {
      const pool = getMultisetsForStar(star)
      for (let msIndex = 0; msIndex < pool.length; msIndex++) {
        const entries = pool[msIndex].entries
        let level: ReturnType<typeof generateLevel> | null = null
        for (const seed of [1, 2, 3, 4, 5, 6]) {
          try {
            level = generateLevel(star, rngForMultiset(star, msIndex, seed))
            break
          } catch {
            level = null
          }
        }
        const label = `star ${star} multiset [${entries.join(',')}]`
        expect(level, `${label} should generate within the retry budget`).not.toBeNull()

        // Polynomial-only with dyadic coefficients.
        for (const curve of level!.curves) {
          expect(curve.family, label).toBe('polynomial')
          if (curve.family === 'polynomial') {
            for (const coeff of curve.coefficients) {
              expect(isDyadic(coeff), `${label}: coeff ${coeff} is dyadic`).toBe(true)
            }
          }
        }

        // P* lies on the dyadic grid.
        expect(isQuantum(level!.endpoint.x), `${label}: endpoint.x on grid`).toBe(true)
        expect(isQuantum(level!.endpoint.y), `${label}: endpoint.y on grid`).toBe(true)

        // Every curve passes through P*.
        for (const curve of level!.curves) {
          const y = evaluate(curve, level!.endpoint.x)
          expect(Math.abs(y - level!.endpoint.y), `${label}: curve through P*`).toBeLessThan(1e-6)
        }

        // P* sits inside the disclosure region, and it is the *unique* common
        // intersection there.
        const r = level!.region
        expect(level!.endpoint.x).toBeGreaterThanOrEqual(r.xMin)
        expect(level!.endpoint.x).toBeLessThanOrEqual(r.xMax)
        expect(level!.endpoint.y).toBeGreaterThanOrEqual(r.yMin)
        expect(level!.endpoint.y).toBeLessThanOrEqual(r.yMax)
        expect(
          countCommonIntersectionsInInterval(level!.curves, r.xMin, r.xMax),
          `${label}: unique common point in region`,
        ).toBe(1)

        // Degree-3 multisets bias P* toward the origin so a*x0^3 stays on-grid.
        if (entries.includes(3)) {
          expect(Math.abs(level!.endpoint.x), `${label}: degree-3 |x0| bound`).toBeLessThanOrEqual(4)
          expect(Math.abs(level!.endpoint.y), `${label}: degree-3 |y0| bound`).toBeLessThanOrEqual(4)
        }
      }
    }
  })

  it('free coefficients land on the RATIONAL_QUANTUM grid', () => {
    // The solved constant term may land on a finer grid (e.g. 1/8, 1/64); the
    // *free* coefficients are always integer multiples of RATIONAL_QUANTUM.
    const level = generateLevel(2, rngForMultiset(2, 0, 12345))
    for (const curve of level.curves) {
      if (curve.family !== 'polynomial') continue
      const freeCount = curve.degree // degree-1: slope; degree-2: a,b; degree-3: a,b,c
      for (let i = 0; i < freeCount; i++) {
        expect(isQuantum(curve.coefficients[i])).toBe(true)
      }
    }
  })

  it('is self-deterministic: same seed → identical level', () => {
    const a = generateLevel(3, mulberry32(0xBADC0DE))
    const b = generateLevel(3, mulberry32(0xBADC0DE))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
