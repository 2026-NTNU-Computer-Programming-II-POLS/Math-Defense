/**
 * Per-kind pure closure factories.
 *
 * The only place per-kind path math lives. Each factory takes the
 * corresponding `PathSegmentParams` subtype and returns a
 * `SegmentClosures` pair: `evaluate(x)` for position and
 * `evaluateDerivative(x)` for arc-length speed correction.
 */
import type { PathSegmentParams } from '@/data/path-segment-types'

type HorizontalParams = Extract<PathSegmentParams, { kind: 'horizontal' }>
type LinearParams = Extract<PathSegmentParams, { kind: 'linear' }>
type QuadraticParams = Extract<PathSegmentParams, { kind: 'quadratic' }>
type TrigonometricParams = Extract<PathSegmentParams, { kind: 'trigonometric' }>
type VerticalParams = Extract<PathSegmentParams, { kind: 'vertical' }>

export interface SegmentClosures {
  evaluate: (x: number) => number
  evaluateDerivative: (x: number) => number
}

/** Constant height: `y = c`. */
export function makeHorizontal(params: HorizontalParams): SegmentClosures {
  const { y } = params
  return {
    evaluate: (_x: number) => y,
    evaluateDerivative: (_x: number) => 0,
  }
}

/** Straight line: `y = slope * x + intercept`. */
export function makeLinear(params: LinearParams): SegmentClosures {
  const { slope, intercept } = params
  return {
    evaluate: (x: number) => slope * x + intercept,
    evaluateDerivative: (_x: number) => slope,
  }
}

/** Parabola: `y = a*x^2 + b*x + c`. */
export function makeQuadratic(params: QuadraticParams): SegmentClosures {
  const { a, b, c } = params
  return {
    evaluate: (x: number) => a * x * x + b * x + c,
    evaluateDerivative: (x: number) => 2 * a * x + b,
  }
}

/**
 * Shifted / scaled sine: `y = amplitude * sin(frequency * x + phase) + offset`.
 */
export function makeTrigonometric(
  params: TrigonometricParams,
): SegmentClosures {
  const { amplitude, frequency, phase, offset } = params
  return {
    evaluate: (x: number) => amplitude * Math.sin(frequency * x + phase) + offset,
    evaluateDerivative: (x: number) => amplitude * frequency * Math.cos(frequency * x + phase),
  }
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
export function makeVertical(params: VerticalParams): SegmentClosures {
  const { yEnd } = params
  return {
    evaluate: (_x: number) => yEnd,
    evaluateDerivative: (_x: number) => 0,
  }
}
