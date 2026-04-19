/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '..', 'shared'),
    },
  },
  server: {
    fs: {
      // @shared resolves to ../shared (the repo-root shared/ directory).
      // Locally this is under the repo root that Vite auto-allows; inside the
      // Docker dev container it's mounted at /shared, which lives outside the
      // /app workspace, so allow it explicitly.
      allow: [resolve(__dirname, '..')],
    },
    proxy: {
      '/api': {
        // Override via VITE_API_TARGET when backend isn't on localhost — e.g.
        // running `npm run dev` against a remote dev backend or inside a WSL
        // setup where the backend container is reachable via its host name.
        target: process.env.VITE_API_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  assetsInclude: ['**/*.wasm'],
  build: {
    // Pin explicitly — a future Vite default flip to `true` would leak source
    // paths (incl. file system layout) into prod bundles.
    sourcemap: false,
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    // WasmBridge.test.ts runs under happy-dom and covers the pure-JS fallback.
    // WasmBridge.wasm.test.ts opts into the Node environment via its own
    // `// @vitest-environment node` pragma and loads the real math_engine.js from
    // frontend/src/math/wasm/ to assert WASM/JS numeric parity.
  },
})
