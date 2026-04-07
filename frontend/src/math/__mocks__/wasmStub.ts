/**
 * Stub for /wasm/math_engine.js in test environment.
 * Returns a factory that resolves to null so initWasm() falls back to JS.
 */
export default function createMathEngine() {
  return Promise.reject(new Error('WASM not available in test environment'))
}
