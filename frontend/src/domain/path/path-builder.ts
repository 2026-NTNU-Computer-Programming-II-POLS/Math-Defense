/**
 * Build a runtime `SegmentedPath` from a declarative `PathLayout`.
 *
 * Pure and stateless: given the same input, produces the same output.
 * Dispatches on `params.kind` to the matching closure factory in
 * `segment-factories`. This file is the sole consumer that turns data
 * into executable per-segment closures — no other module may do so.
 *
 * `buildLevelPath` does **not** validate. Callers are expected to run
 * `validateLevelPath` first (typically at module load or in CI); see
 * spec §6.1.
 */
import type { PathLayout, PathSegmentDef, PathSegmentParams } from '@/data/path-segment-types'
import {
  makeHorizontal,
  makeLinear,
  makeQuadratic,
  makeTrigonometric,
  makeVertical,
} from './segment-factories'
import type { PathSegmentRuntime, SegmentedPath } from './segmented-path'
import { createSegmentedPath } from './segmented-path'

/**
 * Structural accessor for the subset of `LevelDef` the builder needs.
 * Once `LevelDef.path` lands (Phase 6), a concrete `LevelDef` satisfies
 * this shape automatically.
 */
export interface LevelPathSource {
  readonly path: PathLayout
}

/** Turn a level's `PathLayout` into an immutable runtime `SegmentedPath`. */
export function buildLevelPath(level: LevelPathSource): SegmentedPath {
  const runtimes = level.path.segments.map(buildSegmentRuntime)
  return createSegmentedPath(runtimes)
}

function buildSegmentRuntime(def: PathSegmentDef): PathSegmentRuntime {
  const evaluate = makeEvaluator(def.params)
  return {
    id: def.id,
    kind: def.kind,
    xRange: def.xRange,
    evaluate,
    expr: def.expr ?? defaultExpr(def.params),
    label: def.label ?? def.id,
  }
}

function makeEvaluator(params: PathSegmentParams): (x: number) => number {
  switch (params.kind) {
    case 'horizontal':    return makeHorizontal(params)
    case 'linear':        return makeLinear(params)
    case 'quadratic':     return makeQuadratic(params)
    case 'trigonometric': return makeTrigonometric(params)
    case 'vertical':      return makeVertical(params)
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
  }
}
