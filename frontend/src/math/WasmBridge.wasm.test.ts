// @vitest-environment node
/**
 * WASM/JS parity suite.
 *
 * The default WasmBridge.test.ts runs under happy-dom where the ?url asset
 * import for the .wasm binary cannot resolve, so it only exercises the JS
 * fallback. This file runs under Node, loads the real ES module via a file://
 * URL (passed through initWasm's urlOverride parameter), and asserts that every
 * bridge function produces the same numeric result on both backends.
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
  powerF64,
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

  // FU-A acceptance signal: powerF64 must be bit-exact between WASM (musl pow)
  // and the host's Math.pow on the values the score formula actually exercises.
  // A drift here would mean wasmtime-py's recomputation disagrees with the
  // browser-displayed totalScore and every legitimate replay would 422.
  it('powerF64: score-formula inputs', () => {
    const cases: [number, number][] = [
      [1024, 1 / 3],   // typical mid-range k with HP delta = 2
      [50, 1 / 5],     // small k, large exponent denom
      [1e6, 1 / 2],    // sqrt path
      [0, 0.5],        // zero-kill path
      [1, 0.7],        // identity-ish
    ]
    for (const [b, e] of cases) {
      const { wasm, js } = bothBackends(() => powerF64(b, e))
      expect(wasm, `pow(${b}, ${e})`).toBeCloseTo(js, 12)
    }
  })
})
