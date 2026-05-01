/**
 * Level generator — sample N curves that all pass through a common point P*
 * inside the playable grid (now four-quadrant: [GRID_MIN_X, GRID_MAX_X] ×
 * [GRID_MIN_Y, GRID_MAX_Y]). The point P* is the tower-defense goal: when an
 * enemy reaches it the player loses HP. Each curve produces two spawn points
 * (its first crossings with the map boundary on either side of P*), so a
 * level with k curves yields 2k spawns.
 *
 * The generator also computes a *disclosure region* — a rectangle that
 * provably contains exactly one common intersection of all curves. The UI
 * shows this rectangle to the player without revealing P* itself.
 */
import type {
  CurveDefinition,
  PolynomialCurve,
  TrigonometricCurve,
  LogarithmicCurve,
  PolynomialDegree,
  GeneratedLevel,
  DisclosureRegion,
} from '@/math/curve-types'
import { COEFFICIENT_BOUNDS } from '@/math/curve-types'
import { evaluate, evaluateDerivative, isInDomain } from '@/math/curve-evaluator'
import { countCommonIntersectionsInInterval } from '@/math/intersection-solver'
import { computeSpawnPoints, type SpawnPoint } from '@/domain/path/spawn-calculator'
import { pickRandomMultiset, type MultisetEntry } from '@/data/difficulty-defs'
import { GRID_MIN_X, GRID_MAX_X, GRID_MIN_Y, GRID_MAX_Y } from '@/data/constants'

/** Margin keeping P* off the grid boundary so both directions can produce spawns. */
const ENDPOINT_MARGIN = 3
const PLAYABLE_X_MIN = GRID_MIN_X + ENDPOINT_MARGIN
const PLAYABLE_X_MAX = GRID_MAX_X - ENDPOINT_MARGIN
const PLAYABLE_Y_MIN = GRID_MIN_Y + ENDPOINT_MARGIN
const PLAYABLE_Y_MAX = GRID_MAX_Y - ENDPOINT_MARGIN

const SLOPE_SEPARATION_THRESHOLD = 0.3
const ATTEMPTS_PER_BATCH = 50
const MAX_BATCHES = 8
const LOG_DOMAIN_BUFFER = 0.5

/** Candidate disclosure half-extents to try (largest first). */
const DISCLOSURE_HALF_EXTENTS = [3, 2.5, 2, 1.5, 1, 0.5]

export function generateLevel(starRating: number, rng: () => number): GeneratedLevel {
  const multiset = pickRandomMultiset(starRating, rng)

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_BATCH; attempt++) {
      const result = tryGenerate(multiset.entries, rng)
      if (result) {
        return {
          ...result,
          starRating,
          multisetLabel: multiset.entries.join(','),
        }
      }
    }
  }
  throw new Error(
    `Failed to generate level for star ${starRating} after ${ATTEMPTS_PER_BATCH * MAX_BATCHES} attempts`,
  )
}

interface TryGenerateResult {
  curves: CurveDefinition[]
  endpoint: { x: number; y: number }
  interval: readonly [number, number]
  region: DisclosureRegion
  spawns: SpawnPoint[]
}

function tryGenerate(
  entries: readonly MultisetEntry[],
  rng: () => number,
): TryGenerateResult | null {
  const x0 = PLAYABLE_X_MIN + rng() * (PLAYABLE_X_MAX - PLAYABLE_X_MIN)
  const y0 = PLAYABLE_Y_MIN + rng() * (PLAYABLE_Y_MAX - PLAYABLE_Y_MIN)

  const curves: CurveDefinition[] = []
  for (const entry of entries) {
    const curve = generateCurveThrough(entry, x0, y0, rng)
    if (!curve) return null
    curves.push(curve)
  }

  if (!verifySlopeSeparation(curves, x0)) return null

  // Each curve must produce 2 spawn points (one per direction off P*).
  const endpoint = { x: x0, y: y0 }
  const spawns = computeSpawnPoints(curves, endpoint)
  if (!hasTwoSpawnsPerCurve(spawns, curves.length)) return null

  // Disclosure region: pick the largest half-extent that still contains
  // exactly one common intersection (P* itself).
  const region = findDisclosureRegion(curves, x0, y0)
  if (!region) return null

  // Path interval = bounding x-range across all spawns (covers every curve
  // segment that any enemy will travel along).
  const xs = spawns.map((s) => s.x)
  const interval: readonly [number, number] = [
    Math.min(...xs, x0),
    Math.max(...xs, x0),
  ]

  return { curves, endpoint, interval, region, spawns }
}

function generateCurveThrough(
  entry: MultisetEntry,
  x0: number,
  y0: number,
  rng: () => number,
): CurveDefinition | null {
  if (typeof entry === 'number') {
    if (entry !== 1 && entry !== 2 && entry !== 3) return null
    return generatePolynomialThrough(entry, x0, y0, rng)
  }
  if (entry === 'sin') return generateTrigThrough('sin', x0, y0, rng)
  if (entry === 'cos') return generateTrigThrough('cos', x0, y0, rng)
  if (entry === 'log') return generateLogThrough(x0, y0, rng)
  return null
}

function randRange(min: number, max: number, rng: () => number): number {
  return min + rng() * (max - min)
}

function generatePolynomialThrough(
  degree: PolynomialDegree,
  x0: number,
  y0: number,
  rng: () => number,
): PolynomialCurve | null {
  switch (degree) {
    case 1: {
      const b1 = COEFFICIENT_BOUNDS.polynomial[1]
      const slope = randRange(b1.slope[0], b1.slope[1], rng)
      const intercept = y0 - slope * x0
      return { family: 'polynomial', degree: 1, coefficients: [slope, intercept] }
    }
    case 2: {
      const b2 = COEFFICIENT_BOUNDS.polynomial[2]
      const a = randRange(b2.a[0], b2.a[1], rng)
      const b = randRange(b2.b[0], b2.b[1], rng)
      const c = y0 - a * x0 * x0 - b * x0
      return { family: 'polynomial', degree: 2, coefficients: [a, b, c] }
    }
    case 3: {
      const b3 = COEFFICIENT_BOUNDS.polynomial[3]
      const a = randRange(b3.a[0], b3.a[1], rng)
      const b = randRange(b3.b[0], b3.b[1], rng)
      const c = randRange(b3.c[0], b3.c[1], rng)
      const d = y0 - a * x0 ** 3 - b * x0 ** 2 - c * x0
      return { family: 'polynomial', degree: 3, coefficients: [a, b, c, d] }
    }
  }
}

function generateTrigThrough(
  fn: 'sin' | 'cos',
  x0: number,
  y0: number,
  rng: () => number,
): TrigonometricCurve | null {
  const tb = COEFFICIENT_BOUNDS.trigonometric
  const a = randRange(tb.a[0], tb.a[1], rng)
  const b = randRange(tb.b[0], tb.b[1], rng)
  const d = randRange(tb.d[0], tb.d[1], rng)

  const ratio = (y0 - d) / a
  if (Math.abs(ratio) > 1) return null

  const base = fn === 'sin' ? Math.asin(ratio) : Math.acos(ratio)
  if (!isFinite(base)) return null
  const c = base - b * x0

  return { family: 'trigonometric', fn, a, b, c, d }
}

function generateLogThrough(
  x0: number,
  y0: number,
  rng: () => number,
): LogarithmicCurve | null {
  const lb = COEFFICIENT_BOUNDS.logarithmic
  const a = randRange(lb.a[0], lb.a[1], rng)
  const b = randRange(lb.b[0], lb.b[1], rng)
  const cCoeff = randRange(lb.c[0], lb.c[1], rng)

  const arg = b * x0 + cCoeff
  if (arg <= 0) return null

  const d = y0 - a * Math.log(arg)

  // Logarithmic domain ends at x = -c/b (b>0). Require buffer between domain
  // start and the playable grid so the left-side spawn can exist on the curve.
  const domainStart = -cCoeff / b
  if (domainStart > GRID_MIN_X - LOG_DOMAIN_BUFFER) return null

  return { family: 'logarithmic', a, b, c: cCoeff, d }
}

function verifySlopeSeparation(curves: CurveDefinition[], x0: number): boolean {
  for (let i = 0; i < curves.length; i++) {
    for (let j = i + 1; j < curves.length; j++) {
      const di = evaluateDerivative(curves[i]!, x0)
      const dj = evaluateDerivative(curves[j]!, x0)
      if (!isFinite(di) || !isFinite(dj)) return false
      if (Math.abs(di - dj) < SLOPE_SEPARATION_THRESHOLD) return false
    }
  }
  return true
}

function hasTwoSpawnsPerCurve(spawns: SpawnPoint[], curveCount: number): boolean {
  if (spawns.length !== curveCount * 2) return false
  const counts = new Map<number, { left: number; right: number }>()
  for (const s of spawns) {
    const c = counts.get(s.curveIndex) ?? { left: 0, right: 0 }
    if (s.side > 0) c.right += 1
    else c.left += 1
    counts.set(s.curveIndex, c)
  }
  if (counts.size !== curveCount) return false
  for (const c of counts.values()) {
    if (c.left !== 1 || c.right !== 1) return false
  }
  return true
}

/**
 * Find the largest rectangle around P* that contains exactly one common
 * intersection (i.e. P* itself). Searches a small fixed ladder of half-extents.
 */
function findDisclosureRegion(
  curves: readonly CurveDefinition[],
  x0: number,
  y0: number,
): DisclosureRegion | null {
  for (const halfExt of DISCLOSURE_HALF_EXTENTS) {
    const xMin = Math.max(GRID_MIN_X, x0 - halfExt)
    const xMax = Math.min(GRID_MAX_X, x0 + halfExt)
    const yMin = Math.max(GRID_MIN_Y, y0 - halfExt)
    const yMax = Math.min(GRID_MAX_Y, y0 + halfExt)
    if (xMax - xMin < 0.4 || yMax - yMin < 0.4) continue

    const commons = countCommonIntersectionsInInterval(curves, xMin, xMax)
    if (commons !== 1) continue

    // Verify the single common point lies inside the y-band of the box.
    if (!commonPointInsideYBand(curves, xMin, xMax, yMin, yMax)) continue

    return { xMin, xMax, yMin, yMax }
  }
  return null
}

function commonPointInsideYBand(
  curves: readonly CurveDefinition[],
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): boolean {
  // Sample first curve's value at the (single) common x; cheap because we
  // already know there's exactly one common intersection in [xMin, xMax].
  // We re-use intersection-solver indirectly by checking the midpoint.
  // For robustness, sample-test that some x in [xMin, xMax] yields y in band.
  const c0 = curves[0]!
  for (let x = xMin; x <= xMax; x += 0.05) {
    if (!isInDomain(c0, x)) continue
    const y = evaluate(c0, x)
    if (!isFinite(y)) continue
    if (y >= yMin && y <= yMax) {
      // Confirm all curves agree at this x within tolerance.
      let agree = true
      for (let i = 1; i < curves.length; i++) {
        if (!isInDomain(curves[i]!, x)) { agree = false; break }
        const yi = evaluate(curves[i]!, x)
        if (!isFinite(yi) || Math.abs(yi - y) > 1e-3) { agree = false; break }
      }
      if (agree) return true
    }
  }
  return false
}
