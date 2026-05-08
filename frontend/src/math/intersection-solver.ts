// Phase 3 (construction plan): intersection solver delegates to the WASM bridge.
// The previous JS implementation lives inside WasmBridge.ts as a private
// fallback (avoids an import cycle now that this file calls back into the
// bridge). Public API surface is unchanged so all callers continue to work.
import type { CurveDefinition } from './curve-types'
import {
  findPairIntersectionsWasm,
  findAllCurvesCommonPointWasm,
  countCommonIntersectionsInIntervalWasm,
} from './WasmBridge'

const SCAN_STEP = 0.05

export function findPairIntersections(
  c1: CurveDefinition,
  c2: CurveDefinition,
  xMin: number,
  xMax: number,
  step: number = SCAN_STEP,
): number[] {
  return findPairIntersectionsWasm(c1, c2, xMin, xMax, step)
}

export function findAllCurvesCommonPoint(
  curves: readonly CurveDefinition[],
  xMin: number,
  xMax: number,
  step: number = SCAN_STEP,
): { x: number; y: number }[] {
  return findAllCurvesCommonPointWasm(curves, xMin, xMax, step)
}

export function countCommonIntersectionsInInterval(
  curves: readonly CurveDefinition[],
  xMin: number,
  xMax: number,
): number {
  return countCommonIntersectionsInIntervalWasm(curves, xMin, xMax)
}
