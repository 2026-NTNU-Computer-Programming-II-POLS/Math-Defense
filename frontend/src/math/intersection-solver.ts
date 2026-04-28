import type { CurveDefinition } from './curve-types'
import { evaluate, isInDomain } from './curve-evaluator'

const EPS = 1e-6
const SCAN_STEP = 0.05

function safeEval(curve: CurveDefinition, x: number): number | null {
  if (!isInDomain(curve, x)) return null
  const y = evaluate(curve, x)
  return isFinite(y) ? y : null
}

function safeDiff(c1: CurveDefinition, c2: CurveDefinition, x: number): number | null {
  const y1 = safeEval(c1, x)
  const y2 = safeEval(c2, x)
  if (y1 === null || y2 === null) return null
  return y1 - y2
}

export function findPairIntersections(
  c1: CurveDefinition,
  c2: CurveDefinition,
  xMin: number,
  xMax: number,
  step = SCAN_STEP,
): number[] {
  const intersections: number[] = []
  let prevDiff = safeDiff(c1, c2, xMin)

  if (prevDiff !== null && Math.abs(prevDiff) < EPS) {
    intersections.push(xMin)
  }

  for (let x = xMin + step; x <= xMax; x += step) {
    const diff = safeDiff(c1, c2, x)
    if (diff === null) { prevDiff = null; continue }
    if (prevDiff !== null && prevDiff * diff < 0) {
      intersections.push(bisect(c1, c2, x - step, x))
    }
    prevDiff = diff
  }

  const endDiff = safeDiff(c1, c2, xMax)
  if (endDiff !== null && Math.abs(endDiff) < EPS) {
    const last = intersections[intersections.length - 1]
    if (last === undefined || Math.abs(last - xMax) > EPS) {
      intersections.push(xMax)
    }
  }
  return intersections
}

function bisect(c1: CurveDefinition, c2: CurveDefinition, lo: number, hi: number): number {
  const iterations = Math.max(20, Math.ceil(Math.log2((hi - lo) / EPS)))
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2
    const midDiff = safeDiff(c1, c2, mid)
    const loDiff = safeDiff(c1, c2, lo)
    if (midDiff === null || loDiff === null) { lo = mid; continue }
    if (midDiff * loDiff < 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

export function findAllCurvesCommonPoint(
  curves: readonly CurveDefinition[],
  xMin: number,
  xMax: number,
  step = SCAN_STEP,
): { x: number; y: number }[] {
  if (curves.length < 2) return []

  const pairIntersections = findPairIntersections(curves[0], curves[1], xMin, xMax, step)
  const commonPoints: { x: number; y: number }[] = []

  for (const ix of pairIntersections) {
    const y0 = safeEval(curves[0], ix)
    if (y0 === null) continue

    let allMatch = true
    for (let i = 2; i < curves.length; i++) {
      const yi = safeEval(curves[i], ix)
      if (yi === null || Math.abs(yi - y0) > EPS * 100) {
        allMatch = false
        break
      }
    }
    if (allMatch) commonPoints.push({ x: ix, y: y0 })
  }

  return commonPoints
}

export function countCommonIntersectionsInInterval(
  curves: readonly CurveDefinition[],
  xMin: number,
  xMax: number,
): number {
  return findAllCurvesCommonPoint(curves, xMin, xMax).length
}
