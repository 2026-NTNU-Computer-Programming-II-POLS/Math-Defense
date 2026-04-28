/**
 * Spawn calculator — for each curve, walk outward from the level endpoint P*
 * along the curve in both directions and report the first point where the
 * curve leaves the playable area (grid border or domain boundary).
 *
 * Each curve produces exactly two spawns (one per direction). Curves that
 * cannot produce both directions (e.g. a logarithmic curve whose domain ends
 * inside the grid before reaching the y-band again) report only the side(s)
 * that succeed; the level generator is expected to reject such layouts.
 */
import type { CurveDefinition } from '@/math/curve-types'
import { evaluate, isInDomain } from '@/math/curve-evaluator'
import { GRID_MIN_X, GRID_MAX_X, GRID_MIN_Y, GRID_MAX_Y } from '@/data/constants'

export interface SpawnPoint {
  readonly x: number
  readonly y: number
  readonly edge: 'top' | 'bottom' | 'left' | 'right'
  readonly curveIndex: number
  /** Sign of (spawn.x - endpoint.x); +1 = spawn is right of P*, -1 = left of P*. */
  readonly side: 1 | -1
}

const SCAN_STEP = 0.05
const BISECT_ITERATIONS = 30

interface BoundaryHit {
  readonly x: number
  readonly y: number
  readonly edge: 'top' | 'bottom' | 'left' | 'right'
}

function inPlayableY(y: number): boolean {
  return isFinite(y) && y >= GRID_MIN_Y && y <= GRID_MAX_Y
}

/** Return the (clamped) crossing point at the boundary nearest to P* on one side. */
function marchOneDirection(
  curve: CurveDefinition,
  startX: number,
  dirSign: 1 | -1,
): BoundaryHit | null {
  const xStop = dirSign > 0 ? GRID_MAX_X : GRID_MIN_X

  // Sanity: P* itself must be in domain and inside the y-band.
  if (!isInDomain(curve, startX)) return null
  const startY = evaluate(curve, startX)
  if (!inPlayableY(startY)) return null

  let prevX = startX
  let prevY = startY

  for (let step = SCAN_STEP; ; step += SCAN_STEP) {
    const x = startX + dirSign * step
    const reachedXBoundary = dirSign > 0 ? x >= xStop : x <= xStop
    const xClamped = reachedXBoundary ? xStop : x

    if (!isInDomain(curve, xClamped)) {
      // Domain ended between prevX and xClamped → bisect on isInDomain.
      const hit = bisectDomainExit(curve, prevX, xClamped)
      if (!hit) return null
      return hit
    }

    const y = evaluate(curve, xClamped)

    if (!isFinite(y)) {
      // Treat as domain exit: bisect.
      const hit = bisectDomainExit(curve, prevX, xClamped)
      if (!hit) return null
      return hit
    }

    if (y < GRID_MIN_Y || y > GRID_MAX_Y) {
      // Crossed top or bottom edge between prevX and x. Bisect for the
      // exact x where curve(x) = target y.
      const targetY = y > GRID_MAX_Y ? GRID_MAX_Y : GRID_MIN_Y
      const xHit = bisectForY(curve, prevX, xClamped, prevY, y, targetY)
      const edge: 'top' | 'bottom' = targetY === GRID_MAX_Y ? 'top' : 'bottom'
      return { x: xHit, y: targetY, edge }
    }

    if (reachedXBoundary) {
      // Curve survived all the way to the x-border without leaving the y-band.
      const edge: 'left' | 'right' = dirSign > 0 ? 'right' : 'left'
      return { x: xClamped, y, edge }
    }

    prevX = xClamped
    prevY = y
  }
}

/** Bisect for the x where curve transitions from in-domain to out-of-domain. */
function bisectDomainExit(
  curve: CurveDefinition,
  inX: number,
  outX: number,
): BoundaryHit | null {
  let lo = inX
  let hi = outX
  for (let i = 0; i < BISECT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2
    if (isInDomain(curve, mid)) {
      const my = evaluate(curve, mid)
      if (isFinite(my) && inPlayableY(my)) lo = mid
      else hi = mid
    } else hi = mid
  }
  if (!isInDomain(curve, lo)) return null
  const y = evaluate(curve, lo)
  if (!inPlayableY(y)) return null
  // Domain-exit isn't really a grid-edge; report it as the nearest x-edge.
  const edge: 'left' | 'right' = outX > inX ? 'right' : 'left'
  return { x: lo, y, edge }
}

/** Bisect to find x in [lo, hi] where curve(x) = targetY (sign change in y - targetY). */
function bisectForY(
  curve: CurveDefinition,
  loX: number,
  hiX: number,
  loY: number,
  hiY: number,
  targetY: number,
): number {
  let a = loX
  let b = hiX
  let fa = loY - targetY
  for (let i = 0; i < BISECT_ITERATIONS; i++) {
    const m = (a + b) / 2
    if (!isInDomain(curve, m)) { a = m; continue }
    const ym = evaluate(curve, m)
    if (!isFinite(ym)) { a = m; continue }
    const fm = ym - targetY
    if (fa * fm <= 0) {
      b = m
    } else {
      a = m
      fa = fm
    }
    void hiY
  }
  return (a + b) / 2
}

/**
 * Compute the two spawn points for each curve: the first boundary crossings
 * encountered when walking the curve in each direction away from P*.
 */
export function computeSpawnPoints(
  curves: readonly CurveDefinition[],
  endpoint: { readonly x: number; readonly y: number },
): SpawnPoint[] {
  const spawns: SpawnPoint[] = []
  for (let ci = 0; ci < curves.length; ci++) {
    const curve = curves[ci]!
    const right = marchOneDirection(curve, endpoint.x, 1)
    if (right) spawns.push({ ...right, curveIndex: ci, side: 1 })
    const left = marchOneDirection(curve, endpoint.x, -1)
    if (left) spawns.push({ ...left, curveIndex: ci, side: -1 })
  }
  return spawns
}
