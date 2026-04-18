// @vitest-environment node
/**
 * WASM/JS parity suite.
 *
 * The default WasmBridge.test.ts runs under happy-dom where the ?url asset
 * import for the .wasm binary cannot resolve, so it only exercises the JS
 * fallback. This file runs under Node, loads the real ES module via a file://
 * URL (passed through initWasm's urlOverride parameter), and asserts that every
 * bridge function produces the same numeric result on both backends.
 *
 * Regressions caught here include the pre-fix Fourier array-length mismatch,
 * where WASM truncated to 3 components while JS summed all.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, resolve } from 'path'
import {
  initWasm,
  isUsingWasm,
  setUseWasm,
  matrixMultiply,
  sectorCoverage,
  pointInSector,
  numericalIntegrate,
  fourierComposite,
  fourierMatch,
  calculateTrajectory,
  lineCircleIntersect,
} from './WasmBridge'

const here = dirname(fileURLToPath(import.meta.url))
const wasmJsUrl = pathToFileURL(
  resolve(here, 'wasm', 'math_engine.js'),
).href

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

function expectArrClose(a: number[], b: number[], prec = 4) {
  expect(a).toHaveLength(b.length)
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i], prec)
}

describe('WasmBridge — WASM/JS parity', () => {
  it('WASM module loaded (parity suite precondition)', () => {
    expect(wasmReady).toBe(true)
  })

  it('matrixMultiply: identity × identity', () => {
    const { wasm, js } = bothBackends(() => matrixMultiply([1, 0, 0, 1], [1, 0, 0, 1]))
    expectArrClose(wasm, js)
  })

  it('matrixMultiply: arbitrary 2×2', () => {
    const { wasm, js } = bothBackends(() => matrixMultiply([1, 2, 3, 4], [5, 6, 7, 8]))
    expectArrClose(wasm, js)
  })

  // Regression: over-length input used to overrun the 16-byte WASM buffer; under-length
  // used to leave trailing slots uninitialised. Post-fix both sides normalise to 4.
  it('matrixMultiply: >4-element input does not overrun heap', () => {
    const { wasm, js } = bothBackends(() => matrixMultiply([1, 2, 3, 4, 99, 99], [5, 6, 7, 8, 99, 99]))
    expectArrClose(wasm, js)
  })

  it('matrixMultiply: <4-element input is zero-padded', () => {
    const { wasm, js } = bothBackends(() => matrixMultiply([1, 2], [5, 6, 7]))
    expectArrClose(wasm, js)
  })

  it('sectorCoverage', () => {
    const { wasm, js } = bothBackends(() => sectorCoverage(4, Math.PI / 3))
    expect(wasm).toBeCloseTo(js, 4)
  })

  it('pointInSector: boundary parity table', () => {
    type Row = [number, number, number, number, number, number, number]
    const rows: Row[] = [
      [1, 0, 0, 0, 1, 0, Math.PI / 2],
      [0, 1, 0, 0, 1, 0, Math.PI / 2],
      [-1, 0, 0, 0, 1, 0, Math.PI / 2],
      [0.5, 0.5, 0, 0, 1, 0, Math.PI / 2],
      [0.5, 0.5, 0, 0, 1, Math.PI, Math.PI / 2],
      [2, 0, 0, 0, 2, 0, Math.PI / 2],
    ]
    for (const r of rows) {
      const { wasm, js } = bothBackends(() => pointInSector(...r))
      expect(wasm, `row ${r.join(',')}`).toBe(js)
    }
  })

  it('numericalIntegrate: quadratic over [0, 3]', () => {
    const { wasm, js } = bothBackends(() => numericalIntegrate(1, 0, 0, 0, 3))
    expect(wasm).toBeCloseTo(js, 5)
  })

  it('fourierComposite: 3-element arrays', () => {
    const { wasm, js } = bothBackends(() => fourierComposite(1.0, [1, 2, 3], [1, 0.5, 0.3]))
    expect(wasm).toBeCloseTo(js, 4)
  })

  // Regression: >3-element input used to diverge (WASM took first 3, JS summed all).
  it('fourierComposite: >3 elements — both backends truncate to 3', () => {
    const { wasm, js } = bothBackends(() =>
      fourierComposite(1.0, [1, 2, 3, 9], [1, 0.5, 0.3, 9]),
    )
    expect(wasm).toBeCloseTo(js, 4)
  })

  // Regression: <3-element input used to read uninitialised heap on the WASM side.
  it('fourierComposite: <3 elements — both backends zero-pad', () => {
    const { wasm, js } = bothBackends(() => fourierComposite(1.0, [2], [0.7]))
    expect(wasm).toBeCloseTo(js, 4)
  })

  it('fourierMatch: identical waves → ~1', () => {
    const freqs = [1, 2, 3]
    const amps = [1, 0.5, 0.3]
    const { wasm, js } = bothBackends(() => fourierMatch(freqs, amps, freqs, amps))
    expect(wasm).toBeCloseTo(js, 3)
  })

  it('calculateTrajectory: quadratic, forward direction', () => {
    const { wasm, js } = bothBackends(() => calculateTrajectory(1, 0, 0, 0, 3, 0.5))
    expectArrClose(wasm.xs, js.xs)
    expectArrClose(wasm.ys, js.ys)
  })

  // W-5 regression: the C-side int cast of `floorf(...)` is implementation-defined
  // for negative floats. Exercise the reverse direction (xEnd < xStart) to pin
  // the clamp_sample_count helper against the JS fallback.
  it('calculateTrajectory: reverse direction (xEnd < xStart)', () => {
    const { wasm, js } = bothBackends(() => calculateTrajectory(1, 0, 0, 3, 0, 0.5))
    expectArrClose(wasm.xs, js.xs)
    expectArrClose(wasm.ys, js.ys)
  })

  // W-4 regression: a default samples=200 is fine for normal play, but if a caller
  // passed a low sample count with high-frequency waves the result would alias.
  // Post-fix, both sides auto-bump samples, so identical-wave still scores ~1.
  it('fourierMatch: under-sampled identical high-freq waves still score ~1 (Nyquist gate)', () => {
    const freqs = [30, 45, 60]
    const amps = [1, 0.5, 0.3]
    const { wasm, js } = bothBackends(() => fourierMatch(freqs, amps, freqs, amps, 20))
    expect(wasm).toBeGreaterThan(0.95)
    expect(js).toBeGreaterThan(0.95)
    expect(wasm).toBeCloseTo(js, 3)
  })

  it('lineCircleIntersect: two roots', () => {
    const { wasm, js } = bothBackends(() => lineCircleIntersect(1, 0, 0, 0, 2))
    expect(wasm).toHaveLength(js.length)
    const sortByX = (pts: { x: number; y: number }[]) =>
      [...pts].sort((a, b) => a.x - b.x)
    const w = sortByX(wasm)
    const j = sortByX(js)
    for (let i = 0; i < w.length; i++) {
      expect(w[i].x).toBeCloseTo(j[i].x, 4)
      expect(w[i].y).toBeCloseTo(j[i].y, 4)
    }
  })
})
