// @vitest-environment node
/**
 * Phase 3 — intersection solver WASM ↔ JS-fallback parity.
 *
 * The C side computes in float (32-bit) end-to-end; the JS fallback in
 * double. Pair-intersection x-coordinates therefore agree only within a
 * tolerance set by float precision (≤ 1e-3 for inputs in our level grid).
 * Roots are reported in the same order by both backends so a positional
 * match is meaningful.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, resolve } from 'path'
import {
  initWasm,
  isUsingWasm,
  setUseWasm,
  findPairIntersectionsWasm,
  findAllCurvesCommonPointWasm,
  countCommonIntersectionsInIntervalWasm,
} from './WasmBridge'
import type { CurveDefinition } from './curve-types'

const here = dirname(fileURLToPath(import.meta.url))
const wasmJsUrl = pathToFileURL(resolve(here, 'wasm', 'math_engine.js')).href

let wasmReady = false
beforeAll(async () => {
  wasmReady = (await initWasm(wasmJsUrl)) && isUsingWasm()
})

function bothBackends<T>(call: () => T): { wasm: T; js: T } {
  setUseWasm(true)
  const wasm = call()
  setUseWasm(false)
  const js = call()
  setUseWasm(true)
  return { wasm, js }
}

// Two pairs constructed to have known intersection points.
//   y = 2x - 3 ∩ y = -x + 6 → at x = 3 (y = 3)
//   y = x²    ∩ y = 4       → at x = ±2
const linePair: [CurveDefinition, CurveDefinition] = [
  { family: 'polynomial', degree: 1, coefficients: [2, -3] },
  { family: 'polynomial', degree: 1, coefficients: [-1, 6] },
]
const parabolaConstantPair: [CurveDefinition, CurveDefinition] = [
  { family: 'polynomial', degree: 2, coefficients: [1, 0, -4] },
  // Constant 0 — degree 1 with slope 0
  { family: 'polynomial', degree: 1, coefficients: [0, 0] },
]

describe('Phase 3 — intersection solver WASM/JS parity', () => {
  it('WASM module loaded (precondition)', () => {
    expect(wasmReady).toBe(true)
  })

  it('findPairIntersections — line pair: agrees on count and root within 1e-3', () => {
    const { wasm, js } = bothBackends(() => findPairIntersectionsWasm(linePair[0], linePair[1], -10, 10))
    expect(wasm.length).toBe(js.length)
    expect(wasm.length).toBe(1)
    expect(Math.abs(wasm[0] - js[0])).toBeLessThan(1e-3)
    expect(Math.abs(wasm[0] - 3)).toBeLessThan(1e-3)
  })

  it('findPairIntersections — parabola/constant pair: two roots near ±2', () => {
    const { wasm, js } = bothBackends(() => findPairIntersectionsWasm(parabolaConstantPair[0], parabolaConstantPair[1], -5, 5))
    expect(wasm.length).toBe(js.length)
    expect(wasm.length).toBe(2)
    for (let i = 0; i < wasm.length; i++) {
      expect(Math.abs(wasm[i] - js[i])).toBeLessThan(1e-3)
    }
  })

  it('findAllCurvesCommonPoint — three curves intersecting at (1, 1)', () => {
    // y = x; y = x²; y = 2x - 1 — all pass through (1, 1).
    const curves: CurveDefinition[] = [
      { family: 'polynomial', degree: 1, coefficients: [1, 0] },
      { family: 'polynomial', degree: 2, coefficients: [1, 0, 0] },
      { family: 'polynomial', degree: 1, coefficients: [2, -1] },
    ]
    const { wasm, js } = bothBackends(() => findAllCurvesCommonPointWasm(curves, -2, 4))
    expect(wasm.length).toBe(js.length)
    expect(wasm.length).toBe(1)
    expect(Math.abs(wasm[0].x - 1)).toBeLessThan(1e-3)
    expect(Math.abs(wasm[0].y - 1)).toBeLessThan(1e-3)
  })

  it('countCommonIntersectionsInInterval — agrees with JS on a non-trivial trio', () => {
    // y = sin(x); y = x; y = -x² + x + 1 — common at x = 0 only (sin(0) = 0,
    // 0 = 0, 1 ≠ 0 — actually no common point). Use a pair that shares (0,0):
    //   y = x; y = x³; y = sin(x) ; agree at x = 0 (all = 0)
    const curves: CurveDefinition[] = [
      { family: 'polynomial', degree: 1, coefficients: [1, 0] },
      { family: 'polynomial', degree: 3, coefficients: [1, 0, 0, 0] },
      { family: 'trigonometric', fn: 'sin', a: 1, b: 1, c: 0, d: 0 },
    ]
    const { wasm, js } = bothBackends(() => countCommonIntersectionsInIntervalWasm(curves, -1, 1))
    expect(wasm).toBe(js)
    expect(wasm).toBeGreaterThanOrEqual(1)
  })

  it('handles fewer than 2 curves gracefully', () => {
    const single: CurveDefinition[] = [{ family: 'polynomial', degree: 1, coefficients: [1, 0] }]
    setUseWasm(true)
    expect(findAllCurvesCommonPointWasm(single, -5, 5)).toEqual([])
    expect(countCommonIntersectionsInIntervalWasm(single, -5, 5)).toBe(0)
  })
})
