// @vitest-environment node
/**
 * bench-wasm-engine — throughput micro-benchmark for the WASM math engine and
 * the V2 score formula.
 *
 * This is the "stress test" for the compute layer the HTTP k6 suite can't
 * reach: the 17 exported math_engine functions and score-calculator.ts, which
 * run per-frame in the browser AND server-side (wasmtime) on every replay
 * verification. It hammers each hot export in a tight loop and reports
 * ops/sec + per-call percentiles so a regression in the C build or the JS
 * marshalling shows up as a number.
 *
 * Same loader contract as bench-level-gen.bench.ts: hand initWasm a file://
 * URL so emcc resolves math_engine.wasm next to the glue on disk. Run via
 * `npm run bench` (NOT a CI gate — capture before/after in PRs).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  initWasm,
  isUsingWasm,
  matrixMultiply,
  numericalIntegrate,
  sectorCoverage,
  evaluateCurve,
  computeTotalScoreWasm,
  createPrng,
  prngNextF64,
} from '@/math/WasmBridge'
import { calculateScore } from '@/domain/scoring/score-calculator'
import type { CurveDefinition } from '@/math/curve-types'

const here = dirname(fileURLToPath(import.meta.url))
const wasmJsUrl = pathToFileURL(
  resolve(here, '..', 'src', 'math', 'wasm', 'math_engine.js'),
).href

const ITERATIONS = 200_000
const WARMUP = 5_000

function summarize(label: string, totalMs: number, iterations: number): string {
  const opsPerSec = (iterations / totalMs) * 1000
  const nsPerOp = (totalMs * 1e6) / iterations
  return (
    `${label.padEnd(22)} `
    + `iters=${iterations.toLocaleString()}  `
    + `total=${totalMs.toFixed(1)}ms  `
    + `${(opsPerSec / 1e6).toFixed(2)}M ops/s  `
    + `${nsPerOp.toFixed(1)} ns/op`
  )
}

// Run `fn` ITERATIONS times after a warmup; return elapsed ms for the measured
// window only. A volatile accumulator stops V8 from dead-code-eliminating the
// call entirely.
function timeLoop(fn: (i: number) => number): number {
  let sink = 0
  for (let i = 0; i < WARMUP; i++) sink += fn(i)
  const t0 = performance.now()
  for (let i = 0; i < ITERATIONS; i++) sink += fn(i)
  const elapsed = performance.now() - t0
  if (!Number.isFinite(sink)) throw new Error('sink went non-finite — bad inputs')
  return elapsed
}

let wasmReady = false

beforeAll(async () => {
  wasmReady = (await initWasm(wasmJsUrl)) && isUsingWasm()
})

describe('bench-wasm-engine', () => {
  it('reports throughput for each hot WASM export + score formula', () => {
    expect(wasmReady, 'WASM must load — did `npm run prebuild` (make) run?').toBe(true)

    console.log('\nbench-wasm-engine — compute-layer stress (WASM path)\n')

    // 2x2 matrix multiply — used by the Matrix tower every targeting tick.
    const a = [1.5, -2.0, 0.5, 3.0]
    const b = [-1.0, 0.25, 4.0, -0.5]
    console.log(summarize('matrix_multiply', timeLoop(() => matrixMultiply(a, b)[0]), ITERATIONS))

    // Numerical integration (Simpson, n=100) — Calculus tower / area answers.
    console.log(summarize(
      'numerical_integrate',
      timeLoop((i) => numericalIntegrate(1, -2, 3, -5, 5 + (i & 1), 100)),
      ITERATIONS,
    ))

    // Sector coverage — Radar tower geometry.
    console.log(summarize('sector_coverage', timeLoop((i) => sectorCoverage(120 + (i & 7), 1.2)), ITERATIONS))

    // Curve evaluate — runs for every enemy spawn point + path sample.
    const curve: CurveDefinition = { family: 'polynomial', degree: 2, coefficients: [0.5, -1.2, 3.0] }
    console.log(summarize('curve_evaluate', timeLoop((i) => evaluateCurve(curve, (i % 100) * 0.1 - 5)), ITERATIONS))

    // V2 score formula via WASM musl pow — the per-session leaderboard figure
    // and the server-side replay recompute (parity-critical).
    console.log(summarize(
      'compute_total_score',
      timeLoop((i) => computeTotalScoreWasm(800 + i % 50, 90.0, 12.0, 600, 20, 18, (i & 1) as 0 | 1)),
      ITERATIONS,
    ))

    // PRNG draw — PCG XSL-RR; advances per spawn decision.
    const rng = createPrng(0xC0FFEE, 1)
    console.log(summarize('prng_next_f64', timeLoop(() => prngNextF64(rng)), ITERATIONS))
    rng.dispose()

    // Full score breakdown (s1/s2/k/exponent + WASM totalScore) — the object
    // ScoreResultView builds; lower iteration count, it does more JS work.
    const scoreIters = 50_000
    const scoreMs = (() => {
      const input = {
        killValue: 850, timeTotal: 95.0, timeExcludePrepare: [4.0, 3.5, 2.0],
        costTotal: 620, healthOrigin: 20, healthFinal: 17, initialAnswer: 1 as 0 | 1,
      }
      for (let i = 0; i < 2_000; i++) calculateScore(input)
      const t0 = performance.now()
      for (let i = 0; i < scoreIters; i++) calculateScore(input)
      return performance.now() - t0
    })()
    console.log(summarize('calculateScore (full)', scoreMs, scoreIters))

    console.log('\nReminder: not a CI gate. Compare before/after in PRs.\n')
  }, 180_000)
})
