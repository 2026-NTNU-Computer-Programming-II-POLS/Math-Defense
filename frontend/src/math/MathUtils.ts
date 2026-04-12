/**
 * MathUtils — coordinate conversion and geometry utilities (TypeScript)
 */
import { ORIGIN_X, ORIGIN_Y, UNIT_PX } from '@/data/constants'

// ── Coordinate conversion ──

export function gameToCanvasX(gx: number): number {
  return ORIGIN_X + gx * UNIT_PX
}

export function gameToCanvasY(gy: number): number {
  return ORIGIN_Y - gy * UNIT_PX
}

export function canvasToGameX(px: number): number {
  return (px - ORIGIN_X) / UNIT_PX
}

export function canvasToGameY(py: number): number {
  return (ORIGIN_Y - py) / UNIT_PX
}

export function gameToCanvas(gx: number, gy: number): { x: number; y: number } {
  return { x: gameToCanvasX(gx), y: gameToCanvasY(gy) }
}

export function canvasToGame(px: number, py: number): { x: number; y: number } {
  return { x: canvasToGameX(px), y: canvasToGameY(py) }
}

// ── Geometry utilities ──

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  return Math.sqrt(dx * dx + dy * dy)
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Find intersection x-values of two functions (numerical method with bisection refinement).
 * Sign-change scan with bisection refinement. Endpoints are tested explicitly so an
 * intersection sitting exactly on xMin/xMax is not silently skipped.
 */
export function findIntersections(
  f1: (x: number) => number,
  f2: (x: number) => number,
  xMin: number,
  xMax: number,
  step = 0.05,
): number[] {
  // Tolerant of float-eval noise; the bisection branch handles sign changes separately.
  const EPS = 1e-6
  const intersections: number[] = []
  let prevDiff = f1(xMin) - f2(xMin)

  if (Math.abs(prevDiff) < EPS) intersections.push(xMin)

  for (let x = xMin + step; x <= xMax; x += step) {
    const diff = f1(x) - f2(x)
    if (prevDiff * diff < 0) {
      let lo = x - step
      let hi = x
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2
        const midDiff = f1(mid) - f2(mid)
        if (midDiff * (f1(lo) - f2(lo)) < 0) {
          hi = mid
        } else {
          lo = mid
        }
      }
      intersections.push((lo + hi) / 2)
    }
    prevDiff = diff
  }

  // The loop ends when x > xMax; an intersection landing exactly at xMax is missed otherwise.
  const endDiff = f1(xMax) - f2(xMax)
  if (Math.abs(endDiff) < EPS && intersections[intersections.length - 1] !== xMax) {
    intersections.push(xMax)
  }
  return intersections
}
