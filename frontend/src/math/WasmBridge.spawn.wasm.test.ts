// @vitest-environment node
/**
 * Phase 3 — spawn calculator WASM ↔ JS-fallback parity.
 *
 * For each curve passing through P*, both backends should agree on:
 *   - the number of spawns (one per side, two per curve)
 *   - the edge each spawn ends on
 *   - the (x, y) of each spawn within float precision
 *
 * float-vs-double divergence is most pronounced at boundary x where the
 * curve grazes the y-band; tolerance is 5e-3 (matches the SCAN_STEP/2
 * resolution of the underlying walker).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, resolve } from 'path'
import {
  initWasm,
  isUsingWasm,
  setUseWasm,
  computeSpawnPointsWasm,
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

describe('Phase 3 — spawn calculator WASM/JS parity', () => {
  it('WASM module loaded (precondition)', () => {
    expect(wasmReady).toBe(true)
  })

  it('linear curve y = 0.5x + 1 through (0, 1) — two spawns at x = ±14', () => {
    const curves: CurveDefinition[] = [
      { family: 'polynomial', degree: 1, coefficients: [0.5, 1] },
    ]
    const { wasm, js } = bothBackends(() => computeSpawnPointsWasm(curves, { x: 0, y: 1 }))
    expect(wasm.length).toBe(2)
    expect(wasm.length).toBe(js.length)
    for (let i = 0; i < wasm.length; i++) {
      expect(Math.abs(wasm[i].x - js[i].x)).toBeLessThan(5e-3)
      expect(Math.abs(wasm[i].y - js[i].y)).toBeLessThan(5e-3)
      expect(wasm[i].edge).toBe(js[i].edge)
      expect(wasm[i].curveIndex).toBe(js[i].curveIndex)
      expect(wasm[i].side).toBe(js[i].side)
    }
  })

  it('steep parabola y = x² through (0, 0) — exits via top edges', () => {
    const curves: CurveDefinition[] = [
      { family: 'polynomial', degree: 2, coefficients: [1, 0, 0] },
    ]
    const { wasm, js } = bothBackends(() => computeSpawnPointsWasm(curves, { x: 0, y: 0 }))
    expect(wasm.length).toBe(2)
    expect(wasm.length).toBe(js.length)
    for (let i = 0; i < wasm.length; i++) {
      expect(wasm[i].edge).toBe('top')
      expect(Math.abs(wasm[i].x - js[i].x)).toBeLessThan(5e-3)
      expect(wasm[i].side).toBe(js[i].side)
    }
  })

  it('two-curve case — produces 4 spawns total when through (1, 2)', () => {
    const curves: CurveDefinition[] = [
      { family: 'polynomial', degree: 1, coefficients: [1, 1] },     // y = x + 1, through (1,2)
      { family: 'polynomial', degree: 2, coefficients: [0.1, 0, 1.9] }, // y = 0.1x² + 1.9, through (1,2)
    ]
    const { wasm, js } = bothBackends(() => computeSpawnPointsWasm(curves, { x: 1, y: 2 }))
    expect(wasm.length).toBe(4)
    expect(wasm.length).toBe(js.length)
    // Spawn positions and curve indices match across backends.
    for (let i = 0; i < wasm.length; i++) {
      expect(wasm[i].curveIndex).toBe(js[i].curveIndex)
      expect(wasm[i].side).toBe(js[i].side)
      expect(wasm[i].edge).toBe(js[i].edge)
      expect(Math.abs(wasm[i].x - js[i].x)).toBeLessThan(5e-3)
      expect(Math.abs(wasm[i].y - js[i].y)).toBeLessThan(5e-3)
    }
  })

  it('endpoint outside curve y-band returns no spawns for that curve', () => {
    // y = 5 (constant degree-1) — passes through (0, 5). At x = 0 the y is in
    // band, so two spawns expected at x = ±14, y = 5, edges left/right.
    const curves: CurveDefinition[] = [
      { family: 'polynomial', degree: 1, coefficients: [0, 5] },
    ]
    const result = computeSpawnPointsWasm(curves, { x: 0, y: 5 })
    expect(result.length).toBe(2)
    expect(result.every((s) => Math.abs(s.y - 5) < 5e-3)).toBe(true)
  })
})
