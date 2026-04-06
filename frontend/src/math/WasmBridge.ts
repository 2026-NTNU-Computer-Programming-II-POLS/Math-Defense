/**
 * WasmBridge — WASM 載入器（TypeScript 版，RAII 記憶體管理）
 * 提供統一 API，隱藏 ccall/malloc 細節；WASM 失敗時自動 fallback 至純 JS。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WasmModule = any

let _module: WasmModule = null
let _useWasm = true

// ── 初始化 ──

export async function initWasm(): Promise<boolean> {
  try {
    // MODULARIZE=1 產生的 ES module，從 public/wasm/ 載入
    const { default: createMathEngine } = await import('/wasm/math_engine.js')
    _module = await createMathEngine()
    console.log('[WasmBridge] WASM 載入成功')
    return true
  } catch (e) {
    console.warn('[WasmBridge] WASM 載入失敗，使用 JS fallback:', e)
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

// ── RAII 記憶體包裝器 ──

function withFloatBuffers<T>(
  sizes: number[],
  cb: (...ptrs: number[]) => T,
): T {
  const ptrs = sizes.map((n) => _module._malloc(n * 4))
  try {
    return cb(...ptrs)
  } finally {
    ptrs.forEach((p) => _module._free(p))
  }
}

// ── 公開 API ──

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
  if (end > Math.PI * 2) return angle >= start || angle <= end - Math.PI * 2
  return angle >= start && angle <= end
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
    const y = Math.max(0, a * x * x + b * x + c)
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

export function benchmark(fn: () => void, iterations = 10000): number {
  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  return performance.now() - start
}
