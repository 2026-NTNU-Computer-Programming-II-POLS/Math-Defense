/**
 * WasmBridge — WASM loader (TypeScript, RAII memory management)
 * Provides a unified API hiding ccall/malloc details; automatically falls back to pure JS on WASM failure.
 */

// Minimal Emscripten surface we actually use. Typed so a typo in an exported name
// or a wrong return-type asserts at compile time instead of shipping NaN/undefined.
type WasmCType = 'number' | 'string' | 'array' | null
type WasmValueType = 'i8' | 'i16' | 'i32' | 'i64' | 'float' | 'double' | '*'

interface WasmModule {
  ccall(name: string, returnType: WasmCType, argTypes: WasmCType[], args: unknown[]): number
  cwrap(name: string, returnType: WasmCType, argTypes: WasmCType[]): (...args: unknown[]) => number
  _malloc(n: number): number
  _free(ptr: number): void
  getValue(ptr: number, type: WasmValueType): number
  setValue(ptr: number, value: number, type: WasmValueType): void
}

let _module: WasmModule | null = null
let _useWasm = true

// ── Initialization ──

export async function initWasm(): Promise<boolean> {
  try {
    // ES module generated with MODULARIZE=1, compiled by emscripten and placed in frontend/public/wasm/.
    // This file is not managed by the Vite bundler; it must be loaded via a runtime URL to bypass vite:import-analysis
    // static checks on /public/ (and supports BASE_URL deployment to a sub-path).
    const wasmUrl = `${import.meta.env.BASE_URL ?? '/'}wasm/math_engine.js`
    const { default: createMathEngine } = await import(/* @vite-ignore */ wasmUrl)
    _module = await createMathEngine()
    console.log('[WasmBridge] WASM loaded successfully')
    return true
  } catch (e) {
    console.warn('[WasmBridge] WASM failed to load, using JS fallback:', e)
  }
  _module = null
  return false
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

export function matrixMultiply(a: number[], b: number[]): number[] {
  if (_useWasm && _module) {
    return withFloatBuffers([4, 4, 4], (aPtr, bPtr, rPtr) => {
      a.forEach((v, i) => _module.setValue(aPtr + i * 4, v, 'float'))
      b.forEach((v, i) => _module.setValue(bPtr + i * 4, v, 'float'))
      _module.ccall('matrix_multiply', null, ['number', 'number', 'number'], [aPtr, bPtr, rPtr])
      return Array.from({ length: 4 }, (_, i) => _module.getValue(rPtr + i * 4, 'float'))
    })
  }
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
  ]
}

export function sectorCoverage(radius: number, angleWidth: number): number {
  if (_useWasm && _module) {
    return _module.ccall('sector_coverage', 'number', ['number', 'number'], [radius, angleWidth])
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
  if (_useWasm && _module) {
    return (
      _module.ccall(
        'point_in_sector', 'number',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [px, py, cx, cy, radius, angleStart, angleWidth],
      ) === 1
    )
  }
  const dx = px - cx
  const dy = py - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist > radius) return false
  let angle = Math.atan2(dy, dx)
  if (angle < 0) angle += Math.PI * 2
  let start = angleStart % (Math.PI * 2)
  if (start < 0) start += Math.PI * 2
  const end = start + angleWidth
  const eps = 1e-6
  if (end > Math.PI * 2) return angle >= start - eps || angle <= end - Math.PI * 2 + eps
  return angle >= start - eps && angle <= end + eps
}

export function numericalIntegrate(
  a: number, b: number, c: number,
  lo: number, hi: number,
  n = 100,
): number {
  if (_useWasm && _module) {
    return _module.ccall('numerical_integrate', 'number',
      ['number', 'number', 'number', 'number', 'number', 'number'],
      [a, b, c, lo, hi, n])
  }
  const h = (hi - lo) / n
  let sum = 0
  for (let i = 0; i <= n; i++) {
    const x = lo + i * h
    const y = Math.abs(a * x * x + b * x + c)
    sum += i === 0 || i === n ? y : 2 * y
  }
  return Math.abs((sum * h) / 2)
}

export function fourierComposite(t: number, freqs: number[], amps: number[]): number {
  if (_useWasm && _module) {
    return withFloatBuffers([3, 3], (fPtr, aPtr) => {
      freqs.forEach((v, i) => _module.setValue(fPtr + i * 4, v, 'float'))
      amps.forEach((v, i) => _module.setValue(aPtr + i * 4, v, 'float'))
      return _module.ccall('fourier_composite', 'number', ['number', 'number', 'number'], [t, fPtr, aPtr])
    })
  }
  return amps[0] * Math.sin(freqs[0] * t)
       + amps[1] * Math.sin(freqs[1] * t)
       + amps[2] * Math.sin(freqs[2] * t)
}

export function fourierMatch(
  freqs1: number[], amps1: number[],
  freqs2: number[], amps2: number[],
  samples = 200,
): number {
  if (_useWasm && _module) {
    return withFloatBuffers([3, 3, 3, 3], (f1, a1, f2, a2) => {
      freqs1.forEach((v, i) => _module.setValue(f1 + i * 4, v, 'float'))
      amps1.forEach((v, i) => _module.setValue(a1 + i * 4, v, 'float'))
      freqs2.forEach((v, i) => _module.setValue(f2 + i * 4, v, 'float'))
      amps2.forEach((v, i) => _module.setValue(a2 + i * 4, v, 'float'))
      return _module.ccall('fourier_match', 'number',
        ['number', 'number', 'number', 'number', 'number'], [f1, a1, f2, a2, samples])
    })
  }
  const dt = (2 * Math.PI) / samples
  let totalError = 0
  let totalEnergy = 0
  for (let i = 0; i < samples; i++) {
    const t = i * dt
    const v1 = fourierComposite(t, freqs1, amps1)
    const v2 = fourierComposite(t, freqs2, amps2)
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
  if (_useWasm && _module) {
    return withFloatBuffers([1000, 1000, 1], (xPtr, yPtr, countPtr) => {
      _module.ccall(
        'calculate_trajectory', null,
        ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [a, b, c, xStart, xEnd, step, xPtr, yPtr, countPtr],
      )
      const n = _module.getValue(countPtr, 'i32')
      const xs = new Array<number>(n)
      const ys = new Array<number>(n)
      for (let i = 0; i < n; i++) {
        xs[i] = _module.getValue(xPtr + i * 4, 'float')
        ys[i] = _module.getValue(yPtr + i * 4, 'float')
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
  if (_useWasm && _module) {
    return withFloatBuffers([2, 2], (xPtr, yPtr) => {
      const count = _module.ccall(
        'line_circle_intersect', 'number',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [m, b, cx, cy, r, xPtr, yPtr],
      )
      const out: { x: number; y: number }[] = []
      for (let i = 0; i < count; i++) {
        out.push({
          x: _module.getValue(xPtr + i * 4, 'float'),
          y: _module.getValue(yPtr + i * 4, 'float'),
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
