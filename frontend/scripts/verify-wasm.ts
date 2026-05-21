/**
 * verify-wasm.ts — CI gate that the built WASM artifact is actually usable.
 *
 * `npm run prebuild` (cd ../wasm && make) can finish with exit 0 yet still
 * emit a math_engine.wasm that is missing an export — e.g. if the Makefile's
 * EXPORTED_FUNCTIONS list drifts from the C sources, or a translation unit
 * fails to contribute a symbol. When that happens WasmBridge silently falls
 * back to its JS reimplementations (computeTotalScoreWasm, the curve
 * evaluator, the PCG PRNG), so `vitest run` stays green while the bit-exact
 * contract that FU-A server-side replay verification depends on is quietly
 * broken.
 *
 * This script instantiates the freshly-built glue + binary the same way the
 * Node parity suite (src/math/WasmBridge.wasm.test.ts) does, then asserts that
 * every function in wasm/Makefile's EXPORTED_FUNCTIONS is present on the
 * module. It exits non-zero — failing CI — if the module cannot instantiate
 * or any export is absent.
 *
 * Invocation: `npm run verify-wasm` (cwd = frontend/), wired into the CI
 * workflow immediately after the Build WASM step.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const makefilePath = resolve(here, '..', '..', 'wasm', 'Makefile')
const gluePath = resolve(here, '..', 'src', 'math', 'wasm', 'math_engine.js')

function fail(message: string, detail?: unknown): never {
  console.error(`verify-wasm: ${message}`)
  if (detail !== undefined) console.error(detail)
  process.exit(1)
}

/** EXPORTED_FUNCTIONS from wasm/Makefile — the canonical export list. */
function requiredExports(): string[] {
  let makefile: string
  try {
    makefile = readFileSync(makefilePath, 'utf8')
  } catch (e) {
    fail(`cannot read wasm/Makefile at ${makefilePath}`, e)
  }
  const list = makefile.match(/^EXPORTED_FUNCTIONS\s*=\s*(\S+)/m)?.[1]
  if (!list) fail('EXPORTED_FUNCTIONS not found in wasm/Makefile')
  const names = list.split(',').map((n) => n.trim()).filter(Boolean)
  if (names.length === 0) fail('EXPORTED_FUNCTIONS is empty in wasm/Makefile')
  return names
}

type WasmModule = Record<string, unknown>
type EngineFactory = (opts?: Record<string, unknown>) => Promise<WasmModule>

async function main(): Promise<void> {
  const exports = requiredExports()

  let factory: EngineFactory
  try {
    const glue = (await import(pathToFileURL(gluePath).href)) as { default: EngineFactory }
    factory = glue.default
  } catch (e) {
    fail(`cannot import WASM glue at ${gluePath} - did 'npm run prebuild' run?`, e)
  }
  if (typeof factory !== 'function') {
    fail('WASM glue has no default-exported module factory')
  }

  let wasmModule: WasmModule
  try {
    wasmModule = await factory({})
  } catch (e) {
    fail('built math_engine.wasm failed to instantiate', e)
  }

  const missing = exports.filter((name) => typeof wasmModule[name] !== 'function')
  if (missing.length > 0) {
    fail(
      `built math_engine.wasm is missing ${missing.length} of ${exports.length} ` +
        `export(s): ${missing.join(', ')}\n` +
        '  Reconcile wasm/Makefile EXPORTED_FUNCTIONS with the C sources and rebuild.',
    )
  }

  // Sanity call: power_f64(9, 0.5) must be 3 — catches a binary that exports
  // the symbol but traps or returns garbage when invoked.
  const powF64 = wasmModule._power_f64 as (base: number, exp: number) => number
  const sample = powF64(9, 0.5)
  if (!Number.isFinite(sample) || Math.abs(sample - 3) > 1e-9) {
    fail(`power_f64(9, 0.5) returned ${sample}; expected 3`)
  }

  console.log(
    `verify-wasm: OK - module instantiated, all ${exports.length} exports present`,
  )
}

main().catch((e) => fail('unexpected error', e))
