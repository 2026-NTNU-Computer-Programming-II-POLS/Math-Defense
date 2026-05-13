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

// ── Seeded pseudo-random ──

/** FNV-1a 32-bit hash — used to derive a numeric seed from a string id. */
export function stringHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * mulberry32 — a tiny, well-behaved seeded PRNG returning values in [0, 1).
 * Use when you need reproducible randomness from a stable seed (e.g. entity ids).
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
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
      // Derive iteration count from step so callers who shrink `step` still
      // hit the same error floor. Each bisection halves the interval, so
      // ceil(log2(step / EPS)) iterations guarantee the final midpoint is
      // within EPS of the true root.
      const iterations = Math.max(20, Math.ceil(Math.log2(step / EPS)))
      for (let i = 0; i < iterations; i++) {
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
