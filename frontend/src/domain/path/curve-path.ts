import type { CurveDefinition } from '@/math/curve-types'
import { evaluate, isInDomain } from '@/math/curve-evaluator'
import { curveToPathType } from '@/math/curve-types'

export interface CurvePathEntry {
  readonly index: number
  readonly curve: CurveDefinition
  readonly pathType: 'A' | 'B' | 'C'
  evaluate(x: number): number
}

export interface CurvePath {
  readonly entries: ReadonlyArray<CurvePathEntry>
  readonly interval: readonly [number, number]
  readonly endpoint: { readonly x: number; readonly y: number }
  evaluateAll(x: number): ReadonlyArray<{ index: number; y: number }>
}

export function createCurvePath(
  curves: readonly CurveDefinition[],
  interval: readonly [number, number],
  endpoint: { x: number; y: number },
): CurvePath {
  const entries: CurvePathEntry[] = curves.map((curve, i) => ({
    index: i,
    curve,
    pathType: curveToPathType(curve),
    evaluate: (x: number) => evaluate(curve, x),
  }))

  function evaluateAll(x: number): { index: number; y: number }[] {
    const results: { index: number; y: number }[] = []
    for (const entry of entries) {
      if (!isInDomain(entry.curve, x)) continue
      const y = entry.evaluate(x)
      if (isFinite(y)) results.push({ index: entry.index, y })
    }
    return results
  }

  return Object.freeze({
    entries: Object.freeze(entries),
    interval,
    endpoint,
    evaluateAll,
  })
}
