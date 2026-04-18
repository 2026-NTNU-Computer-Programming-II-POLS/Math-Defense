/**
 * WasmBridge — WASM loader (TypeScript, RAII memory management)
 * Provides a unified API hiding ccall/malloc details; automatically falls back to pure JS on WASM failure.
 */

// Minimal Emscripten surface we actually use. Typed so a typo in an exported name
// or a wrong return-type asserts at compile time instead of shipping NaN/undefined.
// `WasmExport` is generated from wasm/Makefile EXPORTED_FUNCTIONS, so a C-side
// rename is caught by vue-tsc here instead of at runtime.
import type { WasmExport } from './wasm-exports'

type WasmCType = 'number' | 'string' | 'array' | null
type WasmValueType = 'i8' | 'i16' | 'i32' | 'i64' | 'float' | 'double' | '*'

interface WasmModule {
  ccall(name: WasmExport, returnType: WasmCType, argTypes: WasmCType[], args: unknown[]): number
  cwrap(name: WasmExport, returnType: WasmCType, argTypes: WasmCType[]): (...args: unknown[]) => number
  _malloc(n: number): number
  _free(ptr: number): void
  getValue(ptr: number, type: WasmValueType): number
  setValue(ptr: number, value: number, type: WasmValueType): void
}

let _module: WasmModule | null = null
let _useWasm = true
// Singleton init state so concurrent callers share one load and late callers
// can await readiness instead of racing with an in-flight `createMathEngine()`.
let _initPromise: Promise<boolean> | null = null
let _initResolved = false

// ── Initialization ──

// urlOverride lets the Node-environment parity test (WasmBridge.wasm.test.ts) pass
// a file:// URL pointing at frontend/public/wasm/math_engine.js. Production callers
// leave it undefined and get BASE_URL-based resolution as before.
export function initWasm(urlOverride?: string): Promise<boolean> {
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    try {
      // ES module generated with MODULARIZE=1, compiled by emscripten and placed in frontend/public/wasm/.
      // This file is not managed by the Vite bundler; it must be loaded via a runtime URL to bypass vite:import-analysis
      // static checks on /public/ (and supports BASE_URL deployment to a sub-path).
      const wasmUrl = urlOverride ?? `${import.meta.env.BASE_URL}wasm/math_engine.js`
      const { default: createMathEngine } = await import(/* @vite-ignore */ wasmUrl)
      _module = await createMathEngine()
      console.log('[WasmBridge] WASM loaded successfully')
      return true
    } catch (e) {
      console.warn('[WasmBridge] WASM failed to load, using JS fallback:', e)
      _module = null
      return false
    } finally {
      _initResolved = true
    }
  })()
  return _initPromise
}

// Await readiness without triggering a load. Callers that must ensure WASM has
// either loaded or definitively failed should `await whenWasmReady()` before
// invoking math fns; pre-init calls transparently take the JS fallback branch
// because `_useWasm && _module` is falsy until the promise settles.
export function whenWasmReady(): Promise<boolean> {
  return _initPromise ?? Promise.resolve(false)
}

export function isWasmReady(): boolean {
  return _initResolved
}

export function setUseWasm(use: boolean): void {
  _useWasm = use && _module !== null
}

export function isUsingWasm(): boolean {
  return _useWasm && _module !== null
}

// ── RAII memory wrapper ──

function withFloatBuffers<T>(
  sizes: number[],
  cb: (...ptrs: number[]) => T,
): T {
  const m = _module
  if (!m) throw new Error('[WasmBridge] WASM module not loaded')
  const ptrs = sizes.map((n) => m._malloc(n * 4))
  try {
    return cb(...ptrs)
  } finally {
    ptrs.forEach((p) => m._free(p))
  }
}

// ── Public API ──

// matrix_multiply in math_engine.c reads exactly 4 floats from each input pointer.
// Normalise on entry so that (a) an under-length input can't make the WASM side
// read uninitialised heap slots, and (b) an over-length input can't overrun the
// 16-byte buffer into the adjacent allocation. JS uses the same four slots so the
// two backends stay in lock-step regardless of caller-side array length.
function toFixed4(arr: number[]): [number, number, number, number] {
  return [
    typeof arr[0] === 'number' ? arr[0] : 0,
    typeof arr[1] === 'number' ? arr[1] : 0,
    typeof arr[2] === 'number' ? arr[2] : 0,
    typeof arr[3] === 'number' ? arr[3] : 0,
  ]
}

export function matrixMultiply(a: number[], b: number[]): number[] {
  const av = toFixed4(a)
  const bv = toFixed4(b)
  const m = _module
  if (_useWasm && m) {
    return withFloatBuffers([4, 4, 4], (aPtr, bPtr, rPtr) => {
      for (let i = 0; i < 4; i++) {
        m.setValue(aPtr + i * 4, av[i], 'float')
        m.setValue(bPtr + i * 4, bv[i], 'float')
      }
      m.ccall('matrix_multiply', null, ['number', 'number', 'number'], [aPtr, bPtr, rPtr])
      return Array.from({ length: 4 }, (_, i) => m.getValue(rPtr + i * 4, 'float'))
    })
  }
  return [
    av[0] * bv[0] + av[1] * bv[2],
    av[0] * bv[1] + av[1] * bv[3],
    av[2] * bv[0] + av[3] * bv[2],
    av[2] * bv[1] + av[3] * bv[3],
  ]
}

export function sectorCoverage(radius: number, angleWidth: number): number {
  const m = _module
  if (_useWasm && m) {
    return m.ccall('sector_coverage', 'number', ['number', 'number'], [radius, angleWidth])
  }
  return 0.5 * radius * radius * angleWidth
}

export function pointInSector(
  px: number, py: number,
  cx: number, cy: number,
  radius: number,
  angleStart: number,
  angleWidth: number,
): boolean {
  const m = _module
  if (_useWasm && m) {
    return (
      m.ccall(
        'point_in_sector', 'number',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [px, py, cx, cy, radius, angleStart, angleWidth],
      ) === 1
    )
  }
  // Mirror math_engine.c clamp: widths > 2π or negative are normalised.
  const TWO_PI = Math.PI * 2
  const width = Math.max(0, Math.min(TWO_PI, angleWidth))
  const dx = px - cx
  const dy = py - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist > radius) return false
  let angle = Math.atan2(dy, dx)
  if (angle < 0) angle += TWO_PI
  let start = angleStart % TWO_PI
  if (start < 0) start += TWO_PI
  const end = start + width
  const eps = 1e-6
  if (end > Math.PI * 2) return angle >= start - eps || angle <= end - Math.PI * 2 + eps
  return angle >= start - eps && angle <= end + eps
}

export function numericalIntegrate(
  a: number, b: number, c: number,
  lo: number, hi: number,
  n = 100,
): number {
  const m = _module
  if (_useWasm && m) {
    return m.ccall('numerical_integrate', 'number',
      ['number', 'number', 'number', 'number', 'number', 'number'],
      [a, b, c, lo, hi, n])
  }
  // Matches the C-side guard at math_engine.c:145 — n=0 would make h=Infinity.
  if (n <= 0) n = 100
  const h = (hi - lo) / n
  let sum = 0
  for (let i = 0; i <= n; i++) {
    const x = lo + i * h
    const y = Math.abs(a * x * x + b * x + c)
    sum += i === 0 || i === n ? y : 2 * y
  }
  return Math.abs((sum * h) / 2)
}

// The C side (fourier_composite / fourier_match in math_engine.c) hard-codes 3 sine
// components — it reads freqs[0..2] and amps[0..2] unconditionally. To keep the JS
// and WASM backends numerically identical (and to avoid reading uninitialised heap
// bytes when callers pass arrays shorter than 3), both paths normalise inputs to
// exactly three floats via toFixed3 before use.
function toFixed3(arr: number[]): [number, number, number] {
  return [
    typeof arr[0] === 'number' ? arr[0] : 0,
    typeof arr[1] === 'number' ? arr[1] : 0,
    typeof arr[2] === 'number' ? arr[2] : 0,
  ]
}

export function fourierComposite(t: number, freqs: number[], amps: number[]): number {
  const f = toFixed3(freqs)
  const a = toFixed3(amps)
  const m = _module
  if (_useWasm && m) {
    return withFloatBuffers([3, 3], (fPtr, aPtr) => {
      for (let i = 0; i < 3; i++) {
        m.setValue(fPtr + i * 4, f[i], 'float')
        m.setValue(aPtr + i * 4, a[i], 'float')
      }
      return m.ccall('fourier_composite', 'number', ['number', 'number', 'number'], [t, fPtr, aPtr])
    })
  }
  return a[0] * Math.sin(f[0] * t) + a[1] * Math.sin(f[1] * t) + a[2] * Math.sin(f[2] * t)
}

export function fourierMatch(
  freqs1: number[], amps1: number[],
  freqs2: number[], amps2: number[],
  samples = 200,
): number {
  const f1v = toFixed3(freqs1)
  const a1v = toFixed3(amps1)
  const f2v = toFixed3(freqs2)
  const a2v = toFixed3(amps2)
  const m = _module
  if (_useWasm && m) {
    return withFloatBuffers([3, 3, 3, 3], (f1, a1, f2, a2) => {
      for (let i = 0; i < 3; i++) {
        m.setValue(f1 + i * 4, f1v[i], 'float')
        m.setValue(a1 + i * 4, a1v[i], 'float')
        m.setValue(f2 + i * 4, f2v[i], 'float')
        m.setValue(a2 + i * 4, a2v[i], 'float')
      }
      return m.ccall('fourier_match', 'number',
        ['number', 'number', 'number', 'number', 'number'], [f1, a1, f2, a2, samples])
    })
  }
  // Mirror C-side Nyquist gate (math_engine.c fourier_match): oversample at 4×
  // max-|ω| so high-frequency boss waveforms don't alias and stall the mini-game.
  const maxFreq = Math.max(
    Math.abs(f1v[0]), Math.abs(f1v[1]), Math.abs(f1v[2]),
    Math.abs(f2v[0]), Math.abs(f2v[1]), Math.abs(f2v[2]),
  )
  const n = Math.max(samples, Math.floor(4 * maxFreq) + 1)
  const dt = (2 * Math.PI) / n
  let totalError = 0
  let totalEnergy = 0
  for (let i = 0; i < n; i++) {
    const t = i * dt
    const v1 = a1v[0] * Math.sin(f1v[0] * t) + a1v[1] * Math.sin(f1v[1] * t) + a1v[2] * Math.sin(f1v[2] * t)
    const v2 = a2v[0] * Math.sin(f2v[0] * t) + a2v[1] * Math.sin(f2v[1] * t) + a2v[2] * Math.sin(f2v[2] * t)
    totalError += (v1 - v2) ** 2
    totalEnergy += v1 * v1
  }
  if (totalEnergy < 0.001) return 1.0
  return Math.max(0, Math.min(1, 1 - Math.sqrt(totalError / totalEnergy)))
}

/**
 * Sample y = a·x² + b·x + c across [xStart, xEnd] at the given step.
 * Hard-capped at 1000 points to match the WASM safety bound.
 */
export function calculateTrajectory(
  a: number, b: number, c: number,
  xStart: number, xEnd: number, step: number,
): { xs: number[]; ys: number[] } {
  if (step <= 0) return { xs: [], ys: [] }
  const m = _module
  if (_useWasm && m) {
    return withFloatBuffers([1000, 1000, 1], (xPtr, yPtr, countPtr) => {
      m.ccall(
        'calculate_trajectory', null,
        ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [a, b, c, xStart, xEnd, step, xPtr, yPtr, countPtr],
      )
      const n = Math.max(0, Math.min(m.getValue(countPtr, 'i32'), 1000))
      const xs = new Array<number>(n)
      const ys = new Array<number>(n)
      for (let i = 0; i < n; i++) {
        xs[i] = m.getValue(xPtr + i * 4, 'float')
        ys[i] = m.getValue(yPtr + i * 4, 'float')
      }
      return { xs, ys }
    })
  }
  const dir = xEnd >= xStart ? 1 : -1
  const n = Math.min(1000, Math.max(0, Math.floor(((xEnd - xStart) * dir) / step) + 1))
  const xs = new Array<number>(n)
  const ys = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const x = xStart + i * step * dir
    xs[i] = x
    ys[i] = a * x * x + b * x + c
  }
  return { xs, ys }
}

/**
 * Intersect line y = m·x + b with circle centered at (cx, cy) of radius r.
 * Returns 0, 1, or 2 (x, y) points.
 */
export function lineCircleIntersect(
  m: number, b: number,
  cx: number, cy: number, r: number,
): { x: number; y: number }[] {
  const mod = _module
  if (_useWasm && mod) {
    return withFloatBuffers([2, 2], (xPtr, yPtr) => {
      const count = mod.ccall(
        'line_circle_intersect', 'number',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [m, b, cx, cy, r, xPtr, yPtr],
      )
      const out: { x: number; y: number }[] = []
      for (let i = 0; i < count; i++) {
        out.push({
          x: mod.getValue(xPtr + i * 4, 'float'),
          y: mod.getValue(yPtr + i * 4, 'float'),
        })
      }
      return out
    })
  }
  const A = 1 + m * m
  const B = 2 * (m * (b - cy) - cx)
  const C = cx * cx + (b - cy) * (b - cy) - r * r
  const disc = B * B - 4 * A * C
  if (disc < 0) return []
  if (disc < 1e-6) {
    const x = -B / (2 * A)
    return [{ x, y: m * x + b }]
  }
  const s = Math.sqrt(disc)
  const x1 = (-B + s) / (2 * A)
  const x2 = (-B - s) / (2 * A)
  return [
    { x: x1, y: m * x1 + b },
    { x: x2, y: m * x2 + b },
  ]
}

export function benchmark(fn: () => void, iterations = 10000): number {
  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  return performance.now() - start
}
