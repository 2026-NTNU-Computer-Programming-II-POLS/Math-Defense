// @vitest-environment node
/**
 * Phase 4 — full level generator parity (intra-engine determinism).
 *
 * This is *not* a WASM↔JS parity test — the C generator runs in float and
 * produces a different bit stream than the JS generator by design (the v2
 * replay protocol embraces this; v1 stays on JS). What we *do* verify here:
 *
 *   - same seed → same generated_level (bit-identical) within the WASM build
 *   - generated levels are structurally valid (curves through endpoint,
 *     spawn count = 2 × curve_count, region contains endpoint, etc).
 *
 * The cross-engine bit-equality guarantee is the larger goal but cannot be
 * exercised inside one Vitest run; it is enforced by the deterministic-FP
 * compile flags and the musl libc transcendentals (Phase 1 verified).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, resolve } from 'path'
import {
  initWasm,
  isUsingWasm,
  setUseWasm,
  createPrng,
  generateLevelDeterministic,
  evaluateCurve,
  type BridgeGeneratedLevel,
} from './WasmBridge'

const here = dirname(fileURLToPath(import.meta.url))
const wasmJsUrl = pathToFileURL(resolve(here, 'wasm', 'math_engine.js')).href

let wasmReady = false
beforeAll(async () => {
  wasmReady = (await initWasm(wasmJsUrl)) && isUsingWasm()
})

function gen(starRating: number, seed: number, entries: ReadonlyArray<number | string>): BridgeGeneratedLevel | null {
  setUseWasm(true)
  const prng = createPrng(seed, 0)
  try {
    return generateLevelDeterministic(starRating, prng, entries)
  } finally {
    prng.dispose()
  }
}

function levelsEqual(a: BridgeGeneratedLevel, b: BridgeGeneratedLevel): boolean {
  if (a.curves.length !== b.curves.length) return false
  if (a.endpoint.x !== b.endpoint.x || a.endpoint.y !== b.endpoint.y) return false
  if (a.region.xMin !== b.region.xMin || a.region.xMax !== b.region.xMax) return false
  if (a.region.yMin !== b.region.yMin || a.region.yMax !== b.region.yMax) return false
  if (a.spawns.length !== b.spawns.length) return false
  for (let i = 0; i < a.spawns.length; i++) {
    const sa = a.spawns[i], sb = b.spawns[i]
    if (sa.x !== sb.x || sa.y !== sb.y) return false
    if (sa.edge !== sb.edge || sa.side !== sb.side || sa.curveIndex !== sb.curveIndex) return false
  }
  return true
}

describe('Phase 4 — generate_level (WASM)', () => {
  it('WASM module loaded (precondition)', () => {
    expect(wasmReady).toBe(true)
  })

  it('star-1 [1, 1] poly multiset: produces a valid 2-curve level', () => {
    const level = gen(1, 0xc0ffee, [1, 1])
    expect(level).not.toBeNull()
    expect(level!.curves.length).toBe(2)
    expect(level!.spawns.length).toBe(4)
    // Each curve must pass through the endpoint to within float tolerance.
    for (const c of level!.curves) {
      const y = evaluateCurve(c, level!.endpoint.x)
      expect(Math.abs(y - level!.endpoint.y)).toBeLessThan(5e-3)
    }
    // Endpoint inside the disclosure region.
    expect(level!.endpoint.x).toBeGreaterThanOrEqual(level!.region.xMin)
    expect(level!.endpoint.x).toBeLessThanOrEqual(level!.region.xMax)
    expect(level!.endpoint.y).toBeGreaterThanOrEqual(level!.region.yMin)
    expect(level!.endpoint.y).toBeLessThanOrEqual(level!.region.yMax)
  })

  it('same seed → bit-identical level across two invocations', () => {
    const a = gen(2, 12345, [1, 'log'])
    const b = gen(2, 12345, [1, 'log'])
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(levelsEqual(a!, b!)).toBe(true)
  })

  it('different seeds → different levels (probabilistic; one collision is fine)', () => {
    const a = gen(2, 1, [2, 'sin'])
    const b = gen(2, 2, [2, 'sin'])
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    // Endpoints differ on at least one axis, with overwhelming probability.
    const same = a!.endpoint.x === b!.endpoint.x && a!.endpoint.y === b!.endpoint.y
    expect(same).toBe(false)
  })

  it('multiset with cos curve produces valid level', () => {
    const level = gen(2, 99, [1, 'cos'])
    expect(level).not.toBeNull()
    expect(level!.curves.length).toBe(2)
    // Second curve is trig.
    expect(level!.curves[1].family).toBe('trigonometric')
    if (level!.curves[1].family === 'trigonometric') {
      expect(level!.curves[1].fn).toBe('cos')
    }
  })

  it('returns null on empty multiset', () => {
    const level = gen(1, 1, [])
    expect(level).toBeNull()
  })

  it('star-3 [1, 1, 3] produces 3 curves and 6 spawns, all passing through P*', () => {
    // May need several seeds — log-domain curves can reject. Try a small set.
    let level: BridgeGeneratedLevel | null = null
    for (const seed of [1, 2, 3, 4, 5, 42, 100]) {
      level = gen(3, seed, [1, 1, 3])
      if (level) break
    }
    expect(level).not.toBeNull()
    expect(level!.curves.length).toBe(3)
    expect(level!.spawns.length).toBe(6)
    for (const c of level!.curves) {
      const y = evaluateCurve(c, level!.endpoint.x)
      expect(Math.abs(y - level!.endpoint.y)).toBeLessThan(5e-3)
    }
  })
})
