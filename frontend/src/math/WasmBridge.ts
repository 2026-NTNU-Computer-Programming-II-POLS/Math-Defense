/**
 * WasmBridge — WASM loader (TypeScript, RAII memory management)
 * Provides a unified API hiding ccall/malloc details; automatically falls back to pure JS on WASM failure.
 */

// Minimal Emscripten surface we actually use. Typed so a typo in an exported name
// or a wrong return-type asserts at compile time instead of shipping NaN/undefined.
// `WasmExport` is generated from wasm/Makefile EXPORTED_FUNCTIONS, so a C-side
// rename is caught by vue-tsc here instead of at runtime.
import type { WasmExport } from './wasm-exports'
import type { CurveDefinition } from './curve-types'
import type { MultisetEntry } from '@/data/difficulty-defs'
import { mulberry32 } from './MathUtils'
// Static imports of the co-located glue + binary. Vite treats the .wasm as an
// asset (?url emits a hashed, serveable URL in prod and a dev-server URL in dev),
// and the glue is just an ES module — this avoids Vite's public-dir dynamic
// import restriction that bit a collaborator on a newer Vite minor.
import createMathEngine from './wasm/math_engine.js'
import mathEngineWasmUrl from './wasm/math_engine.wasm?url'

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
// a file:// URL pointing at the glue module on disk. Production callers leave it
// undefined and use the Vite-bundled static import.
export function initWasm(urlOverride?: string): Promise<boolean> {
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    try {
      // Two paths:
      //   - urlOverride set (Node parity test): dynamic import from a file:// URL so
      //     emscripten's own script-directory logic resolves math_engine.wasm next to
      //     the .js on disk.
      //   - undefined (browser dev/prod): use the statically-imported factory and
      //     pin the .wasm location via `locateFile`, so Vite's ?url-hashed asset URL
      //     is honoured regardless of BASE_URL / bundle location.
      const factory = urlOverride
        ? (await import(/* @vite-ignore */ urlOverride)).default as typeof createMathEngine
        : createMathEngine
      _module = (await factory(
        urlOverride ? {} : { locateFile: (p: string) => (p.endsWith('.wasm') ? mathEngineWasmUrl : p) },
      )) as WasmModule
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
  const clampedAngle = Math.max(0, Math.min(2 * Math.PI, angleWidth))
  if (_useWasm && m) {
    return m.ccall('sector_coverage', 'number', ['number', 'number'], [radius, clampedAngle])
  }
  return 0.5 * radius * radius * clampedAngle
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
    // math_engine.c line 167 applies fabsf(y) per sample; mirrored here.
    const y = Math.abs(a * x * x + b * x + c)
    sum += i === 0 || i === n ? y : 2 * y
  }
  // math_engine.c line 176 applies fabsf to the final result; mirrored here.
  // Since all y values above are non-negative, sum is always >= 0, so this
  // Math.abs is redundant — kept for exact parity with the WASM implementation.
  return Math.abs((sum * h) / 2)
}

// ── Bit-deterministic pow ──
//
// score-calculator.ts applies pow(k, 1/exponentDenom) to derive the displayed
// totalScore. Routing through musl pow in WASM bytecode keeps the frontend
// figure aligned with the server-side wasmtime-py recomputation (FU-A,
// construction plan §8); the JS fallback uses Math.pow and falls back to the
// legacy ε tolerance when WASM is unavailable.
export function powerF64(base: number, exp: number): number {
  const m = _module
  if (_useWasm && m) {
    return m.ccall('power_f64', 'number', ['number', 'number'], [base, exp])
  }
  return Math.pow(base, exp)
}

// F-ARCH-3: single-source-of-truth V2 score formula. The C definition in
// wasm/math_engine.c::compute_total_score is canonical; this wrapper calls
// it when the WASM module exposes the export, otherwise it re-implements
// the same algebra in JS so frontend builds continue to work against an
// older .wasm that hasn't been rebuilt yet. The Python backend has the
// matching mirror in app/domain/scoring/score_calculator.py and parity is
// guarded by shared/score_parity_fixtures.json.
//
// Caller responsibility: pre-sum prep durations into prepSum so the WASM
// ABI stays a flat scalar list (variable-length arrays would force a heap
// allocation and complicate the parity fixtures).
export function computeTotalScoreWasm(
  killValue: number,
  timeTotal: number,
  prepSum: number,
  costTotal: number,
  healthOrigin: number,
  healthFinal: number,
  initialAnswer: 0 | 1,
): number {
  const m = _module
  if (_useWasm && m && _hasComputeTotalScoreExport(m)) {
    return m.ccall(
      'compute_total_score',
      'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [killValue, timeTotal, prepSum, costTotal, healthOrigin, healthFinal, initialAnswer],
    )
  }
  return _computeTotalScoreJsFallback(
    killValue, timeTotal, prepSum, costTotal, healthOrigin, healthFinal, initialAnswer,
  )
}

// Cached so the export-existence probe only runs once per module load.
let _hasComputeTotalScoreCache: boolean | null = null
function _hasComputeTotalScoreExport(m: WasmModule): boolean {
  if (_hasComputeTotalScoreCache !== null) return _hasComputeTotalScoreCache
  // Emscripten exposes each EXPORTED_FUNCTIONS entry as Module._<name>; the
  // property is undefined when the .wasm was built without it. cwrap doesn't
  // validate at bind time (it lazily looks up Module['_' + name] only when
  // called) so probing via cwrap would always return a function and route
  // every call into a runtime throw on older binaries. Reading the export
  // directly is the only safe pre-flight.
  const direct = (m as unknown as Record<string, unknown>)._compute_total_score
  _hasComputeTotalScoreCache = typeof direct === 'function'
  return _hasComputeTotalScoreCache
}

function _computeTotalScoreJsFallback(
  killValue: number,
  timeTotal: number,
  prepSum: number,
  costTotal: number,
  healthOrigin: number,
  healthFinal: number,
  initialAnswer: number,
): number {
  const activeTime = Math.max(0.001, timeTotal - prepSum)
  const s1 = killValue / activeTime
  const s2 = costTotal > 0 ? killValue / costTotal : 0
  // Q3: continuous K blend (alpha-weighted) replaces the old piecewise weight.
  const denomK = s1 + s2
  const alpha = denomK > 0 ? s1 / denomK : 0
  const k = alpha * s1 + (1 - alpha) * s2
  // Q1: sqrt-softened exponent (was 1/denom).
  const exponentDenom = Math.max(1, 1 + (2 + healthOrigin - healthFinal - initialAnswer))
  // V3: base is killValue (volume), softened by the exponent and
  // scaled by k. See math_engine.c::compute_total_score for the rationale
  // (the old V2 used base=k, which ignored volume and inverted the HP penalty
  // when k<1). The scale K and difficulty multiplier are NOT applied here —
  // this returns the canonical 7-input core.
  return powerF64(Math.max(0, killValue), 1 / Math.sqrt(exponentDenom)) * k
}

// ── Bit-deterministic PRNG (PCG XSL-RR 64/32) ──
//
// Phase 1 of the determinism work (construction plan.md). Replaces mulberry32 for
// callers that want bit-exact replay parity across browser engines. The WASM
// path is the *certain* path; the JS fallback intentionally uses mulberry32,
// so a session that started on WASM and then lost it (e.g. via setUseWasm)
// will see a different bit stream — replays for those sessions stay on the
// existing ε = 0.0005 budget. v2 replays must initWasm successfully.
//
// State lives in WASM heap memory owned by the JS side: createPrng allocates
// 16 bytes (sizeof(prng_t)), prngNextU32/F64 advance it, dispose() frees it.

const PRNG_STATE_BYTES = 16

class WasmPrngHandle {
  private _ptr: number | null
  private readonly _module: WasmModule

  constructor(module: WasmModule, seed: number, stream: number) {
    this._module = module
    this._ptr = module._malloc(PRNG_STATE_BYTES)
    module.ccall('prng_seed', null, ['number', 'number', 'number'], [this._ptr, seed >>> 0, stream >>> 0])
  }

  get ptr(): number {
    if (this._ptr === null) throw new Error('[WasmBridge] PRNG handle disposed')
    return this._ptr
  }

  dispose(): void {
    if (this._ptr !== null) {
      this._module._free(this._ptr)
      this._ptr = null
    }
  }
}

class JsPrngHandle {
  // Records the seed so callers reading `.seed` for diagnostics still get the
  // value they passed in even after several draws have advanced the closure.
  readonly seed: number
  readonly stream: number
  readonly next: () => number

  constructor(seed: number, stream: number) {
    this.seed = seed >>> 0
    this.stream = stream >>> 0
    // Stream is ignored on the fallback path — mulberry32 has no stream
    // concept. Documented as part of replay_version=1 behaviour (construction plan §3.7).
    this.next = mulberry32(this.seed)
  }

  dispose(): void { /* no-op */ }
}

export type PrngHandle = WasmPrngHandle | JsPrngHandle

export function createPrng(seed: number, stream = 0): PrngHandle {
  const m = _module
  if (_useWasm && m) return new WasmPrngHandle(m, seed, stream)
  return new JsPrngHandle(seed, stream)
}

export function prngNextU32(handle: PrngHandle): number {
  if (handle instanceof WasmPrngHandle) {
    // ccall returns i32 as a JS number; the C side returns uint32_t, so reinterpret as unsigned.
    return _module!.ccall('prng_next_u32', 'number', ['number'], [handle.ptr]) >>> 0
  }
  // Fallback path matches mulberry32's (t ^ (t >>> 14)) >>> 0 internal stream
  // by reconstituting it from the [0,1) draw — the fallback gives "some RNG"
  // not bit parity, so this is acceptable for replay_version=1 sessions.
  return Math.floor(handle.next() * 0x1_0000_0000) >>> 0
}

export function prngNextF64(handle: PrngHandle): number {
  if (handle instanceof WasmPrngHandle) {
    return _module!.ccall('prng_next_f64', 'number', ['number'], [handle.ptr])
  }
  return handle.next()
}

// ── Curve evaluator ──
//
// Phase 2 of the determinism work. The struct on the C side (curve_t) packs:
//   uint32 family, uint32 variant, float a, b, c, d  → 24 bytes.
// Single scratch buffer reused across calls; the bridge re-marshals on every
// call rather than caching, because CurveDefinition objects are immutable
// and tiny so the cost is negligible.

const CURVE_STRUCT_BYTES = 24

// L-08: scratch buffers are module-scoped singletons — safe in the main thread
// but would race under Web Workers. If Workers are introduced, move these into
// a per-worker context or use a pool.
let _curveScratchPtr: number | null = null

function curveScratch(m: WasmModule): number {
  if (_curveScratchPtr === null) _curveScratchPtr = m._malloc(CURVE_STRUCT_BYTES)
  return _curveScratchPtr
}

// Multiset encoding: shared between TS and C. Keeping the numeric constants
// here rather than in curve-types.ts so the wire format is co-located with
// the marshaller that produces it. C-side switch lives in curve.c.
const FAMILY_POLY = 0
const FAMILY_TRIG = 1
const FAMILY_LOG = 2

function writeCurveTo(m: WasmModule, ptr: number, curve: CurveDefinition): void {
  const FAMILY_OFFSET = 0
  const VARIANT_OFFSET = 4
  const A_OFFSET = 8
  const B_OFFSET = 12
  const C_OFFSET = 16
  const D_OFFSET = 20

  switch (curve.family) {
    case 'polynomial': {
      const c = curve.coefficients
      m.setValue(ptr + FAMILY_OFFSET, FAMILY_POLY, 'i32')
      m.setValue(ptr + VARIANT_OFFSET, curve.degree, 'i32')
      // Pack coefficients into a..d slots. Lower-degree polys use only a..b
      // (degree 1) or a..c (degree 2); the unused slots are written zero so
      // the heap state is fully defined.
      m.setValue(ptr + A_OFFSET, c[0] ?? 0, 'float')
      m.setValue(ptr + B_OFFSET, c[1] ?? 0, 'float')
      m.setValue(ptr + C_OFFSET, c[2] ?? 0, 'float')
      m.setValue(ptr + D_OFFSET, c[3] ?? 0, 'float')
      break
    }
    case 'trigonometric': {
      m.setValue(ptr + FAMILY_OFFSET, FAMILY_TRIG, 'i32')
      m.setValue(ptr + VARIANT_OFFSET, curve.fn === 'sin' ? 0 : 1, 'i32')
      m.setValue(ptr + A_OFFSET, curve.a, 'float')
      m.setValue(ptr + B_OFFSET, curve.b, 'float')
      m.setValue(ptr + C_OFFSET, curve.c, 'float')
      m.setValue(ptr + D_OFFSET, curve.d, 'float')
      break
    }
    case 'logarithmic': {
      m.setValue(ptr + FAMILY_OFFSET, FAMILY_LOG, 'i32')
      m.setValue(ptr + VARIANT_OFFSET, 0, 'i32')
      m.setValue(ptr + A_OFFSET, curve.a, 'float')
      m.setValue(ptr + B_OFFSET, curve.b, 'float')
      m.setValue(ptr + C_OFFSET, curve.c, 'float')
      m.setValue(ptr + D_OFFSET, curve.d, 'float')
      break
    }
  }
}

// JS fallback implementations are duplicated here intentionally. The original
// curve-evaluator.ts now delegates into the bridge — calling back into it
// from the fallback would create a cycle. Keeping a private copy keeps the
// public API surface identical regardless of WASM availability.
function jsEvaluate(curve: CurveDefinition, x: number): number {
  switch (curve.family) {
    case 'polynomial': {
      const c = curve.coefficients
      switch (curve.degree) {
        case 1: return c[0] * x + c[1]
        case 2: return c[0] * x * x + c[1] * x + c[2]
        case 3: return c[0] * x * x * x + c[1] * x * x + c[2] * x + c[3]
      }
      return 0
    }
    case 'trigonometric': {
      const inner = curve.b * x + curve.c
      const base = curve.fn === 'sin' ? Math.sin(inner) : Math.cos(inner)
      return curve.a * base + curve.d
    }
    case 'logarithmic': {
      const arg = curve.b * x + curve.c
      if (arg <= 0) return NaN
      return curve.a * Math.log(arg) + curve.d
    }
  }
}

function jsDerivative(curve: CurveDefinition, x: number): number {
  switch (curve.family) {
    case 'polynomial': {
      const c = curve.coefficients
      switch (curve.degree) {
        case 1: return c[0]
        case 2: return 2 * c[0] * x + c[1]
        case 3: return 3 * c[0] * x * x + 2 * c[1] * x + c[2]
      }
      return 0
    }
    case 'trigonometric': {
      const inner = curve.b * x + curve.c
      const base = curve.fn === 'sin' ? Math.cos(inner) : -Math.sin(inner)
      return curve.a * curve.b * base
    }
    case 'logarithmic': {
      const arg = curve.b * x + curve.c
      if (arg <= 0) return NaN
      return (curve.a * curve.b) / arg
    }
  }
}

function jsInDomain(curve: CurveDefinition, x: number): boolean {
  if (curve.family !== 'logarithmic') return true
  return curve.b * x + curve.c > 0
}

export function evaluateCurve(curve: CurveDefinition, x: number): number {
  const m = _module
  if (_useWasm && m) {
    const ptr = curveScratch(m)
    writeCurveTo(m, ptr, curve)
    return m.ccall('curve_evaluate', 'number', ['number', 'number'], [ptr, x])
  }
  return jsEvaluate(curve, x)
}

export function evaluateCurveDerivative(curve: CurveDefinition, x: number): number {
  const m = _module
  if (_useWasm && m) {
    const ptr = curveScratch(m)
    writeCurveTo(m, ptr, curve)
    return m.ccall('curve_derivative', 'number', ['number', 'number'], [ptr, x])
  }
  return jsDerivative(curve, x)
}

export function isCurveInDomain(curve: CurveDefinition, x: number): boolean {
  const m = _module
  if (_useWasm && m) {
    const ptr = curveScratch(m)
    writeCurveTo(m, ptr, curve)
    return m.ccall('curve_in_domain', 'number', ['number', 'number'], [ptr, x]) === 1
  }
  return jsInDomain(curve, x)
}

// ── Intersection solver / spawn calculator (Phase 3) ──
//
// The C side reads `curve_t[]` from a contiguous heap allocation. To avoid
// thrashing malloc, the bridge keeps a singleton scratch buffer per category
// and a pre-sized output buffer. Both grow on demand and are never freed —
// total cost is bounded by MAX_CURVES (8) and the caller-side step budget.

const SPAWN_STRUCT_BYTES = 20  // x(4) + y(4) + edge(4) + curve_index(4) + side(4)
const MAX_CURVES = 8
const MAX_SPAWNS = MAX_CURVES * 2

let _curveArrayPtr: number | null = null
let _curveArrayCapacity = 0
let _outFloatPtr: number | null = null
let _outFloatCapacityFloats = 0
let _outSpawnsPtr: number | null = null

function curveArrayScratch(m: WasmModule, n: number): number {
  if (n > _curveArrayCapacity) {
    if (_curveArrayPtr !== null) m._free(_curveArrayPtr)
    _curveArrayPtr = m._malloc(n * CURVE_STRUCT_BYTES)
    _curveArrayCapacity = n
  }
  return _curveArrayPtr!
}

function outFloatScratch(m: WasmModule, n: number): number {
  if (n > _outFloatCapacityFloats) {
    if (_outFloatPtr !== null) m._free(_outFloatPtr)
    _outFloatPtr = m._malloc(n * 4)
    _outFloatCapacityFloats = n
  }
  return _outFloatPtr!
}

function spawnsScratch(m: WasmModule): number {
  if (_outSpawnsPtr === null) _outSpawnsPtr = m._malloc(MAX_SPAWNS * SPAWN_STRUCT_BYTES)
  return _outSpawnsPtr
}

function writeCurvesArray(m: WasmModule, ptr: number, curves: readonly CurveDefinition[]): void {
  for (let i = 0; i < curves.length; i++) {
    writeCurveTo(m, ptr + i * CURVE_STRUCT_BYTES, curves[i])
  }
}

// Maximum pair-intersection count across the level grid: with 28-wide x and a
// 0.05 step, 564 evaluation points yield at most ~564 sign changes. 1024 is a
// generous bound that mirrors the C-side stack buffer in find_all_curves_common_point.
const PAIR_INTERSECTIONS_BUF = 1024

const SCAN_STEP_DEFAULT = 0.05

export function findPairIntersectionsWasm(
  c1: CurveDefinition,
  c2: CurveDefinition,
  xMin: number,
  xMax: number,
  step: number = SCAN_STEP_DEFAULT,
): number[] {
  const m = _module
  if (_useWasm && m) {
    const arrPtr = curveArrayScratch(m, 2)
    writeCurvesArray(m, arrPtr, [c1, c2])
    const outPtr = outFloatScratch(m, PAIR_INTERSECTIONS_BUF)
    const count = m.ccall(
      'find_pair_intersections',
      'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [arrPtr, arrPtr + CURVE_STRUCT_BYTES, xMin, xMax, step, outPtr, PAIR_INTERSECTIONS_BUF],
    )
    const result: number[] = []
    for (let i = 0; i < count; i++) result.push(m.getValue(outPtr + i * 4, 'float'))
    return result
  }
  return jsFindPairIntersections(c1, c2, xMin, xMax, step)
}

export function findAllCurvesCommonPointWasm(
  curves: readonly CurveDefinition[],
  xMin: number,
  xMax: number,
  step: number = SCAN_STEP_DEFAULT,
): { x: number; y: number }[] {
  const m = _module
  if (_useWasm && m) {
    if (curves.length < 2 || curves.length > MAX_CURVES) {
      // C side returns 0 for n < 2; for > MAX_CURVES we'd overflow our scratch
      // buffer's natural cap, so fall through to JS instead of risking heap UB.
      if (curves.length < 2) return []
      return jsFindAllCurvesCommonPoint(curves, xMin, xMax, step)
    }
    const arrPtr = curveArrayScratch(m, curves.length)
    writeCurvesArray(m, arrPtr, curves)
    // Pair intersections write to outFloat scratch; the function uses an
    // internal stack buffer for that. We need separate xs/ys output arrays.
    // Allocate them after the curve scratch so they don't collide with it.
    const MAX_PTS = 64
    const outPtr = outFloatScratch(m, MAX_PTS * 2)
    const ysPtr = outPtr + MAX_PTS * 4
    const count = m.ccall(
      'find_all_curves_common_point',
      'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [arrPtr, curves.length, xMin, xMax, step, outPtr, ysPtr, MAX_PTS],
    )
    const result: { x: number; y: number }[] = []
    for (let i = 0; i < count; i++) {
      result.push({
        x: m.getValue(outPtr + i * 4, 'float'),
        y: m.getValue(ysPtr + i * 4, 'float'),
      })
    }
    return result
  }
  return jsFindAllCurvesCommonPoint(curves, xMin, xMax, step)
}

export function countCommonIntersectionsInIntervalWasm(
  curves: readonly CurveDefinition[],
  xMin: number,
  xMax: number,
): number {
  const m = _module
  if (_useWasm && m) {
    if (curves.length < 2 || curves.length > MAX_CURVES) {
      return jsFindAllCurvesCommonPoint(curves, xMin, xMax, SCAN_STEP_DEFAULT).length
    }
    const arrPtr = curveArrayScratch(m, curves.length)
    writeCurvesArray(m, arrPtr, curves)
    return m.ccall(
      'count_common_intersections_in_interval',
      'number',
      ['number', 'number', 'number', 'number'],
      [arrPtr, curves.length, xMin, xMax],
    )
  }
  return jsFindAllCurvesCommonPoint(curves, xMin, xMax, SCAN_STEP_DEFAULT).length
}

export interface BridgeSpawnPoint {
  x: number
  y: number
  edge: 'top' | 'bottom' | 'left' | 'right'
  curveIndex: number
  side: 1 | -1
}

const EDGE_NAMES: ReadonlyArray<'top' | 'bottom' | 'left' | 'right'> = ['top', 'bottom', 'left', 'right']

export function computeSpawnPointsWasm(
  curves: readonly CurveDefinition[],
  endpoint: { readonly x: number; readonly y: number },
): BridgeSpawnPoint[] {
  const m = _module
  if (_useWasm && m && curves.length >= 1 && curves.length <= MAX_CURVES) {
    const arrPtr = curveArrayScratch(m, curves.length)
    writeCurvesArray(m, arrPtr, curves)
    const outPtr = spawnsScratch(m)
    const count = m.ccall(
      'compute_spawn_points',
      'number',
      ['number', 'number', 'number', 'number', 'number', 'number'],
      [arrPtr, curves.length, endpoint.x, endpoint.y, outPtr, MAX_SPAWNS],
    )
    const result: BridgeSpawnPoint[] = []
    for (let i = 0; i < count; i++) {
      const base = outPtr + i * SPAWN_STRUCT_BYTES
      const x = m.getValue(base + 0, 'float')
      const y = m.getValue(base + 4, 'float')
      const edge = m.getValue(base + 8, 'i32')
      const ci = m.getValue(base + 12, 'i32')
      const side = m.getValue(base + 16, 'i32')
      result.push({
        x, y,
        edge: EDGE_NAMES[edge & 3],
        curveIndex: ci,
        side: (side > 0 ? 1 : -1),
      })
    }
    return result
  }
  return jsComputeSpawnPoints(curves, endpoint)
}

// JS fallbacks — duplicated from intersection-solver.ts and spawn-calculator.ts
// for the same reason as jsEvaluate above (avoid cycle now that those files
// delegate into this bridge).

const JS_EPS = 1e-6
function jsSafeEval(curve: CurveDefinition, x: number): number | null {
  if (!jsInDomain(curve, x)) return null
  const y = jsEvaluate(curve, x)
  return isFinite(y) ? y : null
}
function jsSafeDiff(c1: CurveDefinition, c2: CurveDefinition, x: number): number | null {
  const y1 = jsSafeEval(c1, x)
  const y2 = jsSafeEval(c2, x)
  if (y1 === null || y2 === null) return null
  return y1 - y2
}
function jsBisect(c1: CurveDefinition, c2: CurveDefinition, lo: number, hi: number): number {
  const iterations = Math.max(20, Math.ceil(Math.log2((hi - lo) / JS_EPS)))
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2
    const midDiff = jsSafeDiff(c1, c2, mid)
    const loDiff = jsSafeDiff(c1, c2, lo)
    if (midDiff === null || loDiff === null) { lo = mid; continue }
    if (midDiff * loDiff < 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}
function jsFindPairIntersections(
  c1: CurveDefinition, c2: CurveDefinition,
  xMin: number, xMax: number, step: number,
): number[] {
  const out: number[] = []
  let prev = jsSafeDiff(c1, c2, xMin)
  if (prev !== null && Math.abs(prev) < JS_EPS) out.push(xMin)
  for (let x = xMin + step; x <= xMax; x += step) {
    const diff = jsSafeDiff(c1, c2, x)
    if (diff === null) { prev = null; continue }
    if (prev !== null && prev * diff < 0) out.push(jsBisect(c1, c2, x - step, x))
    prev = diff
  }
  const endDiff = jsSafeDiff(c1, c2, xMax)
  if (endDiff !== null && Math.abs(endDiff) < JS_EPS) {
    const last = out[out.length - 1]
    if (last === undefined || Math.abs(last - xMax) > JS_EPS) out.push(xMax)
  }
  return out
}
function jsFindAllCurvesCommonPoint(
  curves: readonly CurveDefinition[],
  xMin: number, xMax: number, step: number,
): { x: number; y: number }[] {
  if (curves.length < 2) return []
  const pair = jsFindPairIntersections(curves[0], curves[1], xMin, xMax, step)
  const out: { x: number; y: number }[] = []
  for (const ix of pair) {
    const y0 = jsSafeEval(curves[0], ix)
    if (y0 === null) continue
    let allMatch = true
    for (let i = 2; i < curves.length; i++) {
      const yi = jsSafeEval(curves[i], ix)
      if (yi === null || Math.abs(yi - y0) > JS_EPS * 100) { allMatch = false; break }
    }
    if (allMatch) out.push({ x: ix, y: y0 })
  }
  return out
}

const JS_BISECT_ITER = 30
function jsInPlayableY(y: number): boolean {
  return isFinite(y) && y >= -14 && y <= 14
}
function jsBisectDomainExit(curve: CurveDefinition, inX: number, outX: number) {
  let lo = inX, hi = outX
  for (let i = 0; i < JS_BISECT_ITER; i++) {
    const mid = (lo + hi) / 2
    if (jsInDomain(curve, mid)) {
      const my = jsEvaluate(curve, mid)
      if (isFinite(my) && jsInPlayableY(my)) lo = mid
      else hi = mid
    } else hi = mid
  }
  if (!jsInDomain(curve, lo)) return null
  const y = jsEvaluate(curve, lo)
  if (!jsInPlayableY(y)) return null
  return { x: lo, y, edge: (outX > inX ? 'right' : 'left') as 'right' | 'left' }
}
function jsBisectForY(curve: CurveDefinition, loX: number, hiX: number, loY: number, targetY: number): number {
  let a = loX, b = hiX, fa = loY - targetY
  for (let i = 0; i < JS_BISECT_ITER; i++) {
    const m = (a + b) / 2
    if (!jsInDomain(curve, m)) { a = m; continue }
    const ym = jsEvaluate(curve, m)
    if (!isFinite(ym)) { a = m; continue }
    const fm = ym - targetY
    if (fa * fm <= 0) b = m
    else { a = m; fa = fm }
  }
  return (a + b) / 2
}
function jsMarchOneDirection(curve: CurveDefinition, startX: number, dirSign: 1 | -1) {
  const xStop = dirSign > 0 ? 14 : -14
  if (!jsInDomain(curve, startX)) return null
  const startY = jsEvaluate(curve, startX)
  if (!jsInPlayableY(startY)) return null
  let prevX = startX, prevY = startY
  for (let step = 0.05; ; step += 0.05) {
    const x = startX + dirSign * step
    const reached = dirSign > 0 ? x >= xStop : x <= xStop
    const xClamped = reached ? xStop : x
    if (!jsInDomain(curve, xClamped)) return jsBisectDomainExit(curve, prevX, xClamped)
    const y = jsEvaluate(curve, xClamped)
    if (!isFinite(y)) return jsBisectDomainExit(curve, prevX, xClamped)
    if (y < -14 || y > 14) {
      const targetY = y > 14 ? 14 : -14
      const xHit = jsBisectForY(curve, prevX, xClamped, prevY, targetY)
      return { x: xHit, y: targetY, edge: (targetY === 14 ? 'top' : 'bottom') as 'top' | 'bottom' }
    }
    if (reached) return { x: xClamped, y, edge: (dirSign > 0 ? 'right' : 'left') as 'right' | 'left' }
    prevX = xClamped
    prevY = y
    if (step > 56) return null
  }
}
function jsComputeSpawnPoints(
  curves: readonly CurveDefinition[],
  endpoint: { readonly x: number; readonly y: number },
): BridgeSpawnPoint[] {
  const out: BridgeSpawnPoint[] = []
  for (let ci = 0; ci < curves.length; ci++) {
    const right = jsMarchOneDirection(curves[ci], endpoint.x, 1)
    if (right) out.push({ ...right, curveIndex: ci, side: 1 })
    const left = jsMarchOneDirection(curves[ci], endpoint.x, -1)
    if (left) out.push({ ...left, curveIndex: ci, side: -1 })
  }
  return out
}

// ── Level generator (Phase 4) ──
//
// generated_level_t layout (must match wasm/level_gen.h):
//   success(4) + curve_count(4) + curves(8 * 24 = 192) + endpoint(8)
//   + region(16) + interval(8) + spawn_count(4) + spawns(16 * 20 = 320)
//   = 556 bytes
const GENERATED_LEVEL_BYTES = 556

export interface BridgeGeneratedLevel {
  success: boolean
  curves: CurveDefinition[]
  endpoint: { x: number; y: number }
  region: { xMin: number; xMax: number; yMin: number; yMax: number }
  interval: [number, number]
  spawns: BridgeSpawnPoint[]
}

function readCurveAt(m: WasmModule, base: number): CurveDefinition {
  // The reworked level generator emits polynomials only, so a generated
  // curve_t is always FAMILY_POLY. The trig/log families remain in the ABI
  // (and in writeCurveTo) for Magic-tower curves but are never produced here.
  const variant = m.getValue(base + 4, 'i32')
  const a = m.getValue(base + 8, 'float')
  const b = m.getValue(base + 12, 'float')
  const c = m.getValue(base + 16, 'float')
  const d = m.getValue(base + 20, 'float')
  const degree = (variant === 1 || variant === 2 || variant === 3 ? variant : 1) as 1 | 2 | 3
  const coeffs = degree === 1 ? [a, b] : degree === 2 ? [a, b, c] : [a, b, c, d]
  return { family: 'polynomial', degree, coefficients: coeffs }
}

export function generateLevelDeterministic(
  starRating: number,
  rng: PrngHandle,
  multisetEntries: ReadonlyArray<MultisetEntry>,
): BridgeGeneratedLevel | null {
  const m = _module
  if (!(_useWasm && m && rng instanceof WasmPrngHandle)) return null
  if (multisetEntries.length < 1 || multisetEntries.length > MAX_CURVES) return null

  // A polynomial multiset entry is its own wire code — the degree (1|2|3).
  const codes = multisetEntries
  const codesPtr = m._malloc(codes.length * 4)
  const outPtr = m._malloc(GENERATED_LEVEL_BYTES)
  try {
    for (let i = 0; i < codes.length; i++) m.setValue(codesPtr + i * 4, codes[i], 'i32')
    const ok = m.ccall(
      'generate_level',
      'number',
      ['number', 'number', 'number', 'number', 'number'],
      [starRating, rng.ptr, codesPtr, codes.length, outPtr],
    )
    if (ok !== 1) return null
    // Parse the output struct.
    const curveCount = m.getValue(outPtr + 4, 'i32')
    const curves: CurveDefinition[] = []
    for (let i = 0; i < curveCount; i++) {
      curves.push(readCurveAt(m, outPtr + 8 + i * CURVE_STRUCT_BYTES))
    }
    const endpointBase = outPtr + 8 + MAX_CURVES * CURVE_STRUCT_BYTES
    const endpointX = m.getValue(endpointBase + 0, 'float')
    const endpointY = m.getValue(endpointBase + 4, 'float')
    const regionBase = endpointBase + 8
    const region = {
      xMin: m.getValue(regionBase + 0, 'float'),
      xMax: m.getValue(regionBase + 4, 'float'),
      yMin: m.getValue(regionBase + 8, 'float'),
      yMax: m.getValue(regionBase + 12, 'float'),
    }
    const intervalBase = regionBase + 16
    const intervalLo = m.getValue(intervalBase + 0, 'float')
    const intervalHi = m.getValue(intervalBase + 4, 'float')
    const spawnCountBase = intervalBase + 8
    const spawnCount = m.getValue(spawnCountBase, 'i32')
    const spawnsBase = spawnCountBase + 4
    const spawns: BridgeSpawnPoint[] = []
    for (let i = 0; i < spawnCount; i++) {
      const base = spawnsBase + i * SPAWN_STRUCT_BYTES
      const edge = m.getValue(base + 8, 'i32')
      const ci = m.getValue(base + 12, 'i32')
      const side = m.getValue(base + 16, 'i32')
      spawns.push({
        x: m.getValue(base + 0, 'float'),
        y: m.getValue(base + 4, 'float'),
        edge: EDGE_NAMES[edge & 3],
        curveIndex: ci,
        side: side > 0 ? 1 : -1,
      })
    }
    return {
      success: true,
      curves,
      endpoint: { x: endpointX, y: endpointY },
      region,
      interval: [intervalLo, intervalHi],
      spawns,
    }
  } finally {
    m._free(codesPtr)
    m._free(outPtr)
  }
}

export function benchmark(fn: () => void, iterations = 10000): number {
  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  return performance.now() - start
}
