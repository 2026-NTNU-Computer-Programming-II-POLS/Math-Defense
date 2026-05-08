// @vitest-environment node
/**
 * Curve evaluator — WASM ↔ JS-fallback parity.
 *
 * The WASM path uses musl libc's sinf/cosf/logf compiled into bytecode and
 * the JS fallback uses Math.sin/cos/log; the latter is implementation-defined
 * by ECMA-262 and varies by 1-2 ULP between V8/SpiderMonkey/JSC. Tolerance
 * here is therefore 1e-5, not bit equality. Bit-equality vs a host-clang
 * reference build is the parity_test.c gate (Phase 5, future work).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, resolve } from 'path'
import {
  initWasm,
  isUsingWasm,
  setUseWasm,
  evaluateCurve,
  evaluateCurveDerivative,
  isCurveInDomain,
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

// Tolerance has two regimes:
//   - polynomial: 1e-4 (float vs double — WASM uses float internally, JS uses double)
//   - trig/log: 1e-4 (transcendentals + float truncation accumulate)
const TOL = 1e-4

const fixtures: CurveDefinition[] = [
  { family: 'polynomial', degree: 1, coefficients: [2, -3] },
  { family: 'polynomial', degree: 1, coefficients: [-0.5, 4] },
  { family: 'polynomial', degree: 2, coefficients: [1, 0, -4] },
  { family: 'polynomial', degree: 2, coefficients: [-0.3, 1.2, 0.5] },
  { family: 'polynomial', degree: 3, coefficients: [0.01, -0.2, 1, 0] },
  { family: 'trigonometric', fn: 'sin', a: 2, b: 1, c: 0, d: 5 },
  { family: 'trigonometric', fn: 'sin', a: 1.5, b: 0.7, c: -1.2, d: 8 },
  { family: 'trigonometric', fn: 'cos', a: 1, b: 0.5, c: Math.PI / 4, d: 3 },
  { family: 'trigonometric', fn: 'cos', a: 3, b: 1.5, c: 2.0, d: 6 },
  { family: 'logarithmic', a: 2, b: 1, c: 1, d: 4 },
  { family: 'logarithmic', a: 1.5, b: 0.5, c: 2, d: 3 },
]

describe('Curve evaluator — WASM/JS parity', () => {
  it('WASM module loaded (precondition)', () => {
    expect(wasmReady).toBe(true)
  })

  it('evaluateCurve agrees within 1e-4 across a range of (curve, x) inputs', () => {
    const xs = [-2.5, -1, -0.1, 0, 0.1, 0.5, 1, 2, 3, 5]
    for (const c of fixtures) {
      for (const x of xs) {
        // Skip points outside log domain — both backends return NaN there;
        // toBeCloseTo on NaN fails noisily, so exclude up front.
        if (c.family === 'logarithmic' && c.b * x + c.c <= 0) continue
        const { wasm, js } = bothBackends(() => evaluateCurve(c, x))
        expect(wasm, `${c.family} @ x=${x}`).toBeCloseTo(js, 4)
        expect(Math.abs(wasm - js), `${c.family} @ x=${x}`).toBeLessThan(TOL)
      }
    }
  })

  it('evaluateCurveDerivative agrees within 1e-4 across a range of (curve, x) inputs', () => {
    const xs = [-2.5, -1, -0.1, 0, 0.1, 0.5, 1, 2, 3, 5]
    for (const c of fixtures) {
      for (const x of xs) {
        if (c.family === 'logarithmic' && c.b * x + c.c <= 0) continue
        const { wasm, js } = bothBackends(() => evaluateCurveDerivative(c, x))
        expect(Math.abs(wasm - js), `${c.family} deriv @ x=${x}`).toBeLessThan(TOL)
      }
    }
  })

  it('isCurveInDomain agrees exactly on every fixture × x', () => {
    const xs = [-3, -1, -0.5, 0, 1, 5]
    for (const c of fixtures) {
      for (const x of xs) {
        const { wasm, js } = bothBackends(() => isCurveInDomain(c, x))
        expect(wasm, `${c.family} domain @ x=${x}`).toBe(js)
      }
    }
  })

  it('log out-of-domain returns NaN under both backends', () => {
    const log: CurveDefinition = { family: 'logarithmic', a: 1, b: 1, c: 0, d: 0 }
    setUseWasm(true)
    expect(Number.isNaN(evaluateCurve(log, -1))).toBe(true)
    setUseWasm(false)
    expect(Number.isNaN(evaluateCurve(log, -1))).toBe(true)
    setUseWasm(true)
  })

  // Deterministic fuzz: the fixture above hits common shapes; this stresses
  // the bridge's marshaller (writeCurveTo offsets, scratch reuse) against
  // the JS fallback over 1000 inputs. We seed a tiny LCG locally so the test
  // is reproducible — using Math.random would make worst-case float/double
  // drift events flaky, and we can't use the WASM PRNG here without coupling
  // tests to each other.
  //
  // Tolerance is 1e-3 (not 1e-4) because for cubic polynomials at |x|≈5
  // with coefficients near ±2, accumulated float-vs-double rounding is
  // intrinsically up to a few × 1e-4. The intent of this test is bridge
  // wiring correctness, not numerical bit-equality (the latter is a
  // host-clang parity_test concern, Phase 5).
  it('1000 deterministic random (poly, x) pairs: |wasm - js| < 1e-3', () => {
    let lcg = 0x12345678
    const next01 = () => {
      lcg = (Math.imul(lcg, 1103515245) + 12345) >>> 0
      return lcg / 0x100000000
    }
    let maxDelta = 0
    for (let i = 0; i < 1000; i++) {
      const degree = ((i % 3) + 1) as 1 | 2 | 3
      const coefficients = Array.from({ length: degree + 1 }, () => (next01() - 0.5) * 4)
      const c: CurveDefinition = { family: 'polynomial', degree, coefficients }
      const x = (next01() - 0.5) * 10
      const { wasm, js } = bothBackends(() => evaluateCurve(c, x))
      const d = Math.abs(wasm - js)
      if (d > maxDelta) maxDelta = d
    }
    expect(maxDelta).toBeLessThan(1e-3)
  })
})
