import type { PathLayout, PathSegmentDef, PathSegmentParams } from '@/data/path-segment-types'
import {
  makeHorizontal,
  makeLinear,
  makeQuadratic,
  makeTrigonometric,
  makeVertical,
  type SegmentClosures,
} from './segment-factories'
import type { PathSegmentRuntime, SegmentedPath } from './segmented-path'
import { createSegmentedPath } from './segmented-path'
import { evaluate as evaluateCurve, evaluateDerivative as evaluateCurveDerivative } from '@/math/curve-evaluator'
import { curveToLatex } from '@/math/curve-evaluator'
import type { CurveDefinition } from '@/math/curve-types'

export interface LevelPathSource {
  readonly path: PathLayout
}

// ── V1 piecewise path builder ──

export function buildLevelPath(level: LevelPathSource): SegmentedPath {
  const runtimes = level.path.segments.map(buildSegmentRuntime)
  return createSegmentedPath(runtimes)
}

function buildSegmentRuntime(def: PathSegmentDef): PathSegmentRuntime {
  const closures = makeClosures(def.params)
  return {
    id: def.id,
    kind: def.kind,
    xRange: def.xRange,
    params: def.params,
    evaluate: closures.evaluate,
    evaluateDerivative: closures.evaluateDerivative,
    expr: def.expr ?? defaultExpr(def.params),
    label: def.label ?? def.id,
  }
}

function makeClosures(params: PathSegmentParams): SegmentClosures {
  switch (params.kind) {
    case 'horizontal':    return makeHorizontal(params)
    case 'linear':        return makeLinear(params)
    case 'quadratic':     return makeQuadratic(params)
    case 'trigonometric': return makeTrigonometric(params)
    case 'vertical':      return makeVertical(params)
    case 'curve':
      throw new Error('buildLevelPath: cannot build V1 path from a curve segment — use buildCurvePath instead.')
  }
}

function defaultExpr(params: PathSegmentParams): string {
  switch (params.kind) {
    case 'horizontal':
      return `y = ${params.y}`
    case 'linear':
      return `y = ${params.slope}x + ${params.intercept}`
    case 'quadratic':
      return `y = ${params.a}x^2 + ${params.b}x + ${params.c}`
    case 'trigonometric':
      return `y = ${params.amplitude}sin(${params.frequency}x + ${params.phase}) + ${params.offset}`
    case 'vertical':
      return `x = ${params.x}, y: ${params.yStart} -> ${params.yEnd}`
    case 'curve':
      return 'f(x)'
  }
}

// ── V2 continuous curve path builder ──

/**
 * Build a single-segment SegmentedPath from a generated CurveDefinition.
 * The segment's evaluate closure delegates to the math/curve-evaluator.
 */
export function buildCurvePath(
  curve: CurveDefinition,
  interval: readonly [number, number],
  id: string,
  label: string,
): SegmentedPath {
  const [lo, hi] = interval
  const runtime: PathSegmentRuntime = {
    id,
    kind: 'curve',
    xRange: [lo, hi] as readonly [number, number],
    params: { kind: 'curve' },
    evaluate: (x: number) => evaluateCurve(curve, x),
    evaluateDerivative: (x: number) => evaluateCurveDerivative(curve, x),
    expr: curveToLatex(curve),
    label,
  }
  return createSegmentedPath([runtime])
}
