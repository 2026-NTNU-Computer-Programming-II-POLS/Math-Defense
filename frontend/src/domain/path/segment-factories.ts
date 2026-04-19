/**
 * Per-kind pure closure factories.
 *
 * The only place per-kind path math lives. Each factory takes the
 * corresponding `PathSegmentParams` subtype and returns an `(x) => y`
 * closure. Replacing random-path generators (`math/PathEvaluator.ts`)
 * deletes the last alternate home; see spec §11.2.
 */
import type { PathSegmentParams } from '@/data/path-segment-types'

type HorizontalParams = Extract<PathSegmentParams, { kind: 'horizontal' }>
type LinearParams = Extract<PathSegmentParams, { kind: 'linear' }>
type QuadraticParams = Extract<PathSegmentParams, { kind: 'quadratic' }>
type TrigonometricParams = Extract<PathSegmentParams, { kind: 'trigonometric' }>
type VerticalParams = Extract<PathSegmentParams, { kind: 'vertical' }>

/** Constant height: `y = c`. */
export function makeHorizontal(params: HorizontalParams): (x: number) => number {
  const { y } = params
  return (_x: number) => y
}

/** Straight line: `y = slope * x + intercept`. */
export function makeLinear(params: LinearParams): (x: number) => number {
  const { slope, intercept } = params
  return (x: number) => slope * x + intercept
}

/** Parabola: `y = a*x^2 + b*x + c`. */
export function makeQuadratic(params: QuadraticParams): (x: number) => number {
  const { a, b, c } = params
  return (x: number) => a * x * x + b * x + c
}

/**
 * Shifted / scaled sine: `y = amplitude * sin(frequency * x + phase) + offset`.
 */
export function makeTrigonometric(
  params: TrigonometricParams,
): (x: number) => number {
  const { amplitude, frequency, phase, offset } = params
  return (x: number) => amplitude * Math.sin(frequency * x + phase) + offset
}

/**
 * Vertical segment closure.
 *
 * `x` is constant; vertical traversal is driven by `t` and `durationSec`
 * in `VerticalMovementStrategy` (Phase 2), not by this closure. The
 * returned function reports the segment's **exit** `y` so that any
 * x-indexed consumer (e.g. path-cell sampling in the layout service)
 * sees a well-defined value. Enemy kinematics during traversal do not
 * call this closure.
 */
export function makeVertical(params: VerticalParams): (x: number) => number {
  const { yEnd } = params
  return (_x: number) => yEnd
}
