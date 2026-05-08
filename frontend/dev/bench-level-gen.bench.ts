// @vitest-environment node
/**
 * bench-level-gen — micro-benchmark for the WASM level generator.
 *
 * Construction plan §5 (Phase 5): not a CI gate (too noisy on shared
 * runners), just a PR-attached number. Run via `npm run bench`.
 *
 * Why this is a Vitest file under `dev/` rather than a bare `tsx` script:
 *   - WasmBridge.ts has a `import './wasm/math_engine.wasm?url'` static
 *     import. The `?url` suffix is a Vite plugin, so a plain `tsx` run
 *     bombs with ERR_UNKNOWN_FILE_EXTENSION. Vitest runs through the
 *     same Vite plugin chain so the import resolves cleanly.
 *   - vite.config.ts pins `test.include = ['src/**\/*.test.ts']`, so
 *     this `.bench.ts` under `dev/` is *not* picked up by `npm test` /
 *     `npm run ci`. The `bench` npm script invokes vitest with an
 *     explicit `--include` to opt this file in.
 *
 * Measures wall time of `generateLevelDeterministicFromSeed` for Star 1,
 * 3, and 5 with 1,000 seeds each. The first 50 iterations are discarded
 * so the V8 JIT settles. Output format is plain text — paste it into
 * a PR description directly.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { initWasm, isUsingWasm } from '@/math/WasmBridge'
import { generateLevelDeterministicFromSeed } from '@/domain/level/level-generator'
import { mulberry32 } from '@/math/MathUtils'

// Mirror the parity-test loader (WasmBridge.wasm.test.ts): hand initWasm a
// file:// URL pointing at the glue module on disk, so emcc's own
// scriptDirectory logic resolves math_engine.wasm next to it.
const here = dirname(fileURLToPath(import.meta.url))
const wasmJsUrl = pathToFileURL(
  resolve(here, '..', 'src', 'math', 'wasm', 'math_engine.js'),
).href

const ITERATIONS = 1000
const WARMUP = 50
const STARS = [1, 3, 5] as const

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  const i = Math.min(sorted.length - 1, Math.floor(q * sorted.length))
  return sorted[i]!
}

function summarize(label: string, samples: number[]): string {
  const sorted = [...samples].sort((a, b) => a - b)
  const p50 = quantile(sorted, 0.50)
  const p95 = quantile(sorted, 0.95)
  const p99 = quantile(sorted, 0.99)
  const max = sorted[sorted.length - 1] ?? NaN
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  return (
    `${label.padEnd(14)} `
    + `n=${samples.length}  `
    + `mean=${mean.toFixed(2)}ms  `
    + `p50=${p50.toFixed(2)}ms  `
    + `p95=${p95.toFixed(2)}ms  `
    + `p99=${p99.toFixed(2)}ms  `
    + `max=${max.toFixed(2)}ms`
  )
}

let wasmReady = false

beforeAll(async () => {
  wasmReady = (await initWasm(wasmJsUrl)) && isUsingWasm()
})

describe('bench-level-gen', () => {
  it('runs the generator and reports p50 / p95 / p99 per star', () => {
    expect(wasmReady, 'WASM module must load — did `npm run prebuild` run?').toBe(true)

    console.log('\nbench-level-gen — construction plan §5 acceptance signal')
    console.log(`WASM loaded. Iterations: ${ITERATIONS} (+${WARMUP} warmup) per star\n`)

    // Seeded mulberry32 so two consecutive bench runs measure identical workloads.
    const seedRng = mulberry32(0xBEEFFEED >>> 0)

    for (const star of STARS) {
      const samples: number[] = []
      let exhaustedCount = 0
      for (let i = 0; i < ITERATIONS + WARMUP; i++) {
        const seed = (seedRng() * 0x1_0000_0000) >>> 0
        const t0 = performance.now()
        const level = generateLevelDeterministicFromSeed(star, seed)
        const t1 = performance.now()
        if (i >= WARMUP) {
          samples.push(t1 - t0)
          if (level === null) exhaustedCount++
        }
      }
      console.log(summarize(`Star ${star}`, samples))
      if (exhaustedCount > 0) {
        console.log(`               (${exhaustedCount} / ${ITERATIONS} exhausted — investigate if > 1%)`)
      }
    }

    console.log('\nReminder: this number is not a CI gate. Capture before/after in PRs.\n')
  }, 120_000)
})
