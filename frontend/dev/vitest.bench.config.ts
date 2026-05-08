/// <reference types="vitest/config" />
/**
 * Bench-only Vitest config. Inherits the project's Vite plugin chain (so the
 * `?url` import in WasmBridge.ts resolves) and overrides only the test
 * include glob so `npm run bench` picks up `dev/bench-level-gen.bench.ts`
 * without polluting the default `npm test` run.
 *
 * Construction plan §5: bench is a PR-attached number, not a CI gate.
 */
import { defineConfig } from 'vitest/config'
import baseConfig from '../vite.config'

// Inherit the project's Vite plugin chain (so the `?url` import in
// WasmBridge.ts resolves), then replace the test include glob outright —
// otherwise mergeConfig appends arrays and we'd run the whole src/ suite
// alongside the bench.
const inherited = typeof baseConfig === 'function' ? baseConfig({} as never) : baseConfig

export default defineConfig({
  ...inherited,
  test: {
    ...(inherited.test ?? {}),
    include: ['dev/**/*.bench.ts'],
    reporters: ['default'],
  },
})
