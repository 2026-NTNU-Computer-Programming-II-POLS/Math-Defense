// Emscripten-generated ES module has no accompanying .d.ts. The WasmBridge-facing
// surface (ccall/cwrap/_malloc/_free/getValue/setValue) is re-asserted via the
// WasmModule interface at the call site, so we keep this declaration intentionally
// loose — its only job is to let TS accept `import createMathEngine from './math_engine.js'`.
declare const createMathEngine: (moduleArg?: Record<string, unknown>) => Promise<unknown>
export default createMathEngine
