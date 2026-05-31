// @vitest-environment node
/**
 * bench-game-hotpath — per-frame cost of the engine's hot loop under entity
 * pressure.
 *
 * The full Game scheduler (engine/Game.ts) wires in a Canvas Renderer, the
 * InputManager and ~20 ECS systems, so it can't run headless without a DOM.
 * What actually scales with entity count — and what drops frames in real play
 * — is the math the Combat/Radar/Movement systems run EVERY tick:
 *   * each tower tests each in-flight enemy with point_in_sector (range gate)
 *   * each enemy advances along its curve via curve_evaluate
 * This bench reconstructs that O(towers x enemies) inner loop using the SAME
 * WasmBridge calls the real systems make, and measures per-frame wall time at
 * growing entity counts against the 60 FPS budget (16.67 ms/frame).
 *
 * It is a faithful proxy for the compute hot path, NOT a full-engine bench
 * (no rendering, no event dispatch). Run via `npm run bench`.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  initWasm,
  isUsingWasm,
  pointInSector,
  evaluateCurve,
  createPrng,
  prngNextF64,
} from '@/math/WasmBridge'
import type { CurveDefinition } from '@/math/curve-types'

const here = dirname(fileURLToPath(import.meta.url))
const wasmJsUrl = pathToFileURL(
  resolve(here, '..', 'src', 'math', 'wasm', 'math_engine.js'),
).href

const FRAME_BUDGET_MS = 1000 / 60   // 16.67ms — drop below 60 FPS above this
const FRAMES = 600                  // ~10s of simulated play per scenario
const WARMUP_FRAMES = 60

// (towers, enemies) load points — from a quiet early wave to a worst-case
// late-game swarm with every tower slot filled.
const SCENARIOS: ReadonlyArray<{ towers: number; enemies: number }> = [
  { towers: 8, enemies: 30 },
  { towers: 16, enemies: 80 },
  { towers: 24, enemies: 150 },
  { towers: 32, enemies: 300 },
]

interface Tower { x: number; y: number; range: number; angleStart: number; angleWidth: number }
interface Enemy { x: number; y: number; curve: CurveDefinition; t: number }

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  const i = Math.min(sorted.length - 1, Math.floor(q * sorted.length))
  return sorted[i]!
}

function buildScene(towers: number, enemies: number) {
  // Deterministic placement via the WASM PRNG so two runs measure the same
  // workload. Field is the 28x28 game grid the level generator targets.
  const rng = createPrng(0x5EED5, 7)
  const r = () => prngNextF64(rng)
  const towerList: Tower[] = Array.from({ length: towers }, () => ({
    x: r() * 28 - 14,
    y: r() * 28 - 14,
    range: 3 + r() * 4,
    angleStart: r() * Math.PI * 2,
    angleWidth: Math.PI / 2 + r() * Math.PI,
  }))
  const enemyList: Enemy[] = Array.from({ length: enemies }, () => ({
    x: r() * 28 - 14,
    y: r() * 28 - 14,
    curve: { family: 'polynomial', degree: 2, coefficients: [r() - 0.5, r() * 2 - 1, r() * 4 - 2] },
    t: r() * 10,
  }))
  rng.dispose()
  return { towerList, enemyList }
}

// One simulated frame: advance every enemy along its curve, then run the
// tower-vs-enemy range scan. Returns a sink value so the loop isn't elided.
function stepFrame(towerList: Tower[], enemyList: Enemy[], dt: number): number {
  let acquired = 0
  for (const e of enemyList) {
    e.t += dt
    const x = ((e.t % 28) - 14)
    e.x = x
    e.y = evaluateCurve(e.curve, x)
  }
  for (const tw of towerList) {
    for (const e of enemyList) {
      if (pointInSector(e.x, e.y, tw.x, tw.y, tw.range, tw.angleStart, tw.angleWidth)) acquired++
    }
  }
  return acquired
}

let wasmReady = false

beforeAll(async () => {
  wasmReady = (await initWasm(wasmJsUrl)) && isUsingWasm()
})

describe('bench-game-hotpath', () => {
  it('reports per-frame time vs the 60 FPS budget at growing entity counts', () => {
    expect(wasmReady, 'WASM must load — did `npm run prebuild` (make) run?').toBe(true)

    console.log('\nbench-game-hotpath — per-frame Combat/Movement hot loop (WASM path)')
    console.log(`Budget: ${FRAME_BUDGET_MS.toFixed(2)} ms/frame (60 FPS). ${FRAMES} frames/scenario.\n`)

    const dt = 1 / 60
    for (const { towers, enemies } of SCENARIOS) {
      const { towerList, enemyList } = buildScene(towers, enemies)
      let sink = 0
      for (let f = 0; f < WARMUP_FRAMES; f++) sink += stepFrame(towerList, enemyList, dt)

      const frameTimes: number[] = []
      for (let f = 0; f < FRAMES; f++) {
        const t0 = performance.now()
        sink += stepFrame(towerList, enemyList, dt)
        frameTimes.push(performance.now() - t0)
      }
      if (!Number.isFinite(sink)) throw new Error('sink non-finite')

      const sorted = [...frameTimes].sort((a, b) => a - b)
      const p50 = quantile(sorted, 0.5)
      const p95 = quantile(sorted, 0.95)
      const p99 = quantile(sorted, 0.99)
      const max = sorted[sorted.length - 1]!
      const overBudget = frameTimes.filter((t) => t > FRAME_BUDGET_MS).length
      const checks = towers * enemies
      console.log(
        `${`${towers}t x ${enemies}e`.padEnd(14)} `
        + `(${checks.toLocaleString()} checks/frame)  `
        + `p50=${p50.toFixed(2)}ms  p95=${p95.toFixed(2)}ms  p99=${p99.toFixed(2)}ms  max=${max.toFixed(2)}ms  `
        + `over-budget=${overBudget}/${FRAMES}`
        + (overBudget > 0 ? '  <-- DROPS FRAMES' : ''),
      )
    }

    console.log('\nReminder: hot-path proxy (no rendering / events). Not a CI gate.\n')
  }, 180_000)
})
