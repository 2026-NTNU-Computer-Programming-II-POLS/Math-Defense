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
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
  assetsInclude: ['**/*.wasm'],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    // WasmBridge.test.ts runs under happy-dom and covers the pure-JS fallback.
    // WasmBridge.wasm.test.ts opts into the Node environment via its own
    // `// @vitest-environment node` pragma and loads the real math_engine.js from
    // frontend/public/wasm/ to assert WASM/JS numeric parity.
  },
})
