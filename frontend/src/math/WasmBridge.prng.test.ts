import { describe, it, expect } from 'vitest'
import { createPrng, prngNextF64, prngNextU32, setUseWasm } from './WasmBridge'

// Runs under happy-dom — the .wasm asset URL doesn't resolve here, so every
// createPrng() returns a JsPrngHandle. These tests pin the *fallback*
// contract (range, reproducibility, basic distribution sanity); the WASM
// path is exercised in WasmBridge.prng.wasm.test.ts.

describe('WasmBridge — PRNG (JS fallback)', () => {
  it('two handles seeded identically produce the same draw stream', () => {
    const a = createPrng(42)
    const b = createPrng(42)
    for (let i = 0; i < 1024; i++) {
      expect(prngNextF64(a)).toBe(prngNextF64(b))
    }
    a.dispose()
    b.dispose()
  })

  it('different seeds produce divergent streams', () => {
    const a = createPrng(1)
    const b = createPrng(2)
    let firstDifferenceAt = -1
    for (let i = 0; i < 32; i++) {
      const xa = prngNextF64(a)
      const xb = prngNextF64(b)
      if (xa !== xb && firstDifferenceAt === -1) firstDifferenceAt = i
    }
    // Mulberry32 already differs on draw 0 for this seed pair; the assertion
    // is on existence, not exact index, so the test stays robust if the
    // fallback is ever swapped.
    expect(firstDifferenceAt).toBeGreaterThanOrEqual(0)
    a.dispose()
    b.dispose()
  })

  it('every draw lies in [0, 1)', () => {
    const h = createPrng(0xdeadbeef)
    for (let i = 0; i < 10_000; i++) {
      const v = prngNextF64(h)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    h.dispose()
  })

  it('prngNextU32 returns an unsigned 32-bit integer', () => {
    const h = createPrng(7)
    for (let i = 0; i < 1024; i++) {
      const v = prngNextU32(h)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(0xffffffff)
    }
    h.dispose()
  })

  it('seed is normalised to uint32 (>>> 0)', () => {
    // -1 and 0xFFFFFFFF should produce the same stream after the >>> 0 mask.
    const a = createPrng(-1)
    const b = createPrng(0xffffffff)
    for (let i = 0; i < 64; i++) expect(prngNextF64(a)).toBe(prngNextF64(b))
    a.dispose()
    b.dispose()
  })

  it('rough distribution: mean of 10k draws is near 0.5', () => {
    const h = createPrng(12345)
    let sum = 0
    const N = 10_000
    for (let i = 0; i < N; i++) sum += prngNextF64(h)
    const mean = sum / N
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.02)
    h.dispose()
  })

  it('disposed handle is a no-op (idempotent dispose)', () => {
    const h = createPrng(1)
    h.dispose()
    // A second dispose must not throw — Game.destroy may call it after a
    // setSeed cycle has already nulled the handle out from under it.
    expect(() => h.dispose()).not.toThrow()
  })

  it('setUseWasm(false) does not change fallback behaviour', () => {
    setUseWasm(false)
    try {
      const a = createPrng(99)
      const b = createPrng(99)
      for (let i = 0; i < 16; i++) expect(prngNextF64(a)).toBe(prngNextF64(b))
      a.dispose()
      b.dispose()
    } finally {
      // Restore default so a future test reordering can't observe the toggle.
      // In happy-dom _module is null, so setUseWasm(true) collapses to false
      // either way; the cleanup is for cross-suite hygiene, not behaviour.
      setUseWasm(true)
    }
  })
})
