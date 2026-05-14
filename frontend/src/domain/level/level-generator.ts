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
  PolynomialDegree,
  GeneratedLevel,
  DisclosureRegion,
} from '@/math/curve-types'
import { COEFFICIENT_BOUNDS } from '@/math/curve-types'
import { evaluate, evaluateDerivative, isInDomain } from '@/math/curve-evaluator'
import { RATIONAL_QUANTUM } from '@/math/rational'
import { countCommonIntersectionsInInterval } from '@/math/intersection-solver'
import { computeSpawnPoints, type SpawnPoint } from '@/domain/path/spawn-calculator'
import { pickRandomMultiset, type MultisetEntry } from '@/data/difficulty-defs'
import { GRID_MIN_X, GRID_MAX_X, GRID_MIN_Y, GRID_MAX_Y } from '@/data/constants'
import {
  createPrng,
  generateLevelDeterministic,
  isUsingWasm,
  prngNextF64,
  type PrngHandle,
} from '@/math/WasmBridge'

/** Margin keeping P* off the grid boundary so both directions can produce spawns. */
const ENDPOINT_MARGIN = 3
const PLAYABLE_X_MIN = GRID_MIN_X + ENDPOINT_MARGIN
const PLAYABLE_X_MAX = GRID_MAX_X - ENDPOINT_MARGIN
const PLAYABLE_Y_MIN = GRID_MIN_Y + ENDPOINT_MARGIN
const PLAYABLE_Y_MAX = GRID_MAX_Y - ENDPOINT_MARGIN

const SLOPE_SEPARATION_THRESHOLD = 0.3
const ATTEMPTS_PER_BATCH = 50
const MAX_BATCHES = 8

/** When a multiset has a degree-3 entry, P* is drawn from [-4, 4] so a*x0^3 stays on-grid. */
const DEGREE3_ENDPOINT_BOUND = 4

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

/**
 * Phase 4 (construction plan §3.8): bit-exact level generator routed entirely
 * through the WASM build. Used by replay_version=2 sessions to obtain a
 * level that any client running the same .wasm will reproduce byte-for-byte.
 *
 * Caller owns the PrngHandle: this function consumes draws from it but does
 * not dispose it (later `Game.setSeed` may need to keep drawing). Returns
 * `null` if WASM is unavailable or the multiset cannot be satisfied — the
 * caller is expected to surface a v2-replay-incompatibility error in that
 * case rather than silently falling back to the JS path (§3.8 again).
 */
export function generateLevelV2(
  starRating: number,
  rngHandle: PrngHandle,
  multisetEntries: ReadonlyArray<MultisetEntry>,
): GeneratedLevel | null {
  if (!isUsingWasm()) return null
  const result = generateLevelDeterministic(starRating, rngHandle, multisetEntries)
  if (!result) return null
  // The bridge's BridgeSpawnPoint is structurally identical to SpawnPoint;
  // edge/side/curveIndex carry the same values. A direct cast is safe.
  const spawns = result.spawns as unknown as SpawnPoint[]
  const xs = spawns.map((s) => s.x)
  const interval: readonly [number, number] = [
    Math.min(...xs, result.endpoint.x),
    Math.max(...xs, result.endpoint.x),
  ]
  const region: DisclosureRegion = {
    xMin: result.region.xMin,
    xMax: result.region.xMax,
    yMin: result.region.yMin,
    yMax: result.region.yMax,
  }
  return {
    curves: result.curves,
    endpoint: { x: result.endpoint.x, y: result.endpoint.y },
    region,
    interval,
    starRating,
    multisetLabel: multisetEntries.join(','),
  }
}

/**
 * Convenience wrapper: pickRandomMultiset using a PrngHandle, then generate.
 * Mirrors `generateLevel` for the v2 path, but pulls draws from the WASM PRNG
 * so the same seed yields the same multiset selection across browsers.
 */
export function generateLevelV2WithSeed(
  starRating: number,
  rngHandle: PrngHandle,
): GeneratedLevel | null {
  if (!isUsingWasm()) return null
  // Use a draw from the same handle for multiset selection so the rng state
  // stays in step with v1's `pickRandomMultiset(starRating, rng)`.
  const multiset = pickRandomMultiset(starRating, () => prngNextF64(rngHandle))
  return generateLevelV2(starRating, rngHandle, multiset.entries)
}

/** Convenience wrapper that creates and disposes its own PrngHandle. */
export function generateLevelDeterministicFromSeed(
  starRating: number,
  seed: number,
): GeneratedLevel | null {
  const handle = createPrng(seed >>> 0, 0)
  try {
    return generateLevelV2WithSeed(starRating, handle)
  } finally {
    handle.dispose()
  }
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
  // P* is a dyadic rational so the displayed equations are exact and the common
  // point is genuinely a fraction the student can derive. A degree-3 multiset
  // biases P* toward the origin to keep the cubic on-grid.
  const hasDegree3 = entries.includes(3)
  const xLo = hasDegree3 ? Math.max(PLAYABLE_X_MIN, -DEGREE3_ENDPOINT_BOUND) : PLAYABLE_X_MIN
  const xHi = hasDegree3 ? Math.min(PLAYABLE_X_MAX, DEGREE3_ENDPOINT_BOUND) : PLAYABLE_X_MAX
  const yLo = hasDegree3 ? Math.max(PLAYABLE_Y_MIN, -DEGREE3_ENDPOINT_BOUND) : PLAYABLE_Y_MIN
  const yHi = hasDegree3 ? Math.min(PLAYABLE_Y_MAX, DEGREE3_ENDPOINT_BOUND) : PLAYABLE_Y_MAX
  const x0 = pickDyadic(xLo, xHi, rng)
  const y0 = pickDyadic(yLo, yHi, rng)

  const curves: CurveDefinition[] = []
  for (const entry of entries) {
    curves.push(generatePolynomialThrough(entry, x0, y0, rng))
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

/** Pick a dyadic value in [lo, hi] by integer index — consumes exactly one rng draw. */
function pickDyadic(lo: number, hi: number, rng: () => number): number {
  const steps = Math.round((hi - lo) / RATIONAL_QUANTUM)
  return lo + Math.floor(rng() * (steps + 1)) * RATIONAL_QUANTUM
}

/** Pick one element from a candidate list — consumes exactly one rng draw. */
function pickFrom<T>(list: readonly T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length)]!
}

/**
 * Build a polynomial of the given degree through P*. Free coefficients are
 * picked by index into the dyadic candidate lists; the constant term is solved
 * from the through-point equation.
 *
 * x0, y0, and every picked coefficient are dyadic with small denominators, so
 * the solved term is computed *exactly* in f64 (no rounding) — the curve passes
 * through P* exactly. The term is NOT snapped to the RATIONAL_QUANTUM grid: a
 * product like slope*x0 legitimately lands on a finer grid (e.g. 1/8, 1/64),
 * and snapping it would move the curve off P*.
 */
function generatePolynomialThrough(
  degree: PolynomialDegree,
  x0: number,
  y0: number,
  rng: () => number,
): PolynomialCurve {
  switch (degree) {
    case 1: {
      const slope = pickFrom(COEFFICIENT_BOUNDS.polynomial[1].slope, rng)
      const intercept = y0 - slope * x0
      return { family: 'polynomial', degree: 1, coefficients: [slope, intercept] }
    }
    case 2: {
      const b2 = COEFFICIENT_BOUNDS.polynomial[2]
      const a = pickFrom(b2.a, rng)
      const b = pickFrom(b2.b, rng)
      const c = y0 - a * x0 * x0 - b * x0
      return { family: 'polynomial', degree: 2, coefficients: [a, b, c] }
    }
    case 3: {
      const b3 = COEFFICIENT_BOUNDS.polynomial[3]
      const a = pickFrom(b3.a, rng)
      const b = pickFrom(b3.b, rng)
      const c = pickFrom(b3.c, rng)
      const d = y0 - a * x0 * x0 * x0 - b * x0 * x0 - c * x0
      return { family: 'polynomial', degree: 3, coefficients: [a, b, c, d] }
    }
  }
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
