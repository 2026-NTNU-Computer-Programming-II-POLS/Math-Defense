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
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  assetsInclude: ['**/*.wasm'],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    // WASM bridge builds its import URL at runtime (`${BASE_URL}wasm/math_engine.js`),
    // so vite-import-analysis no longer eagerly resolves it. In tests the dynamic
    // import simply rejects, and WasmBridge falls back to its pure-JS implementation —
    // exactly the path these tests cover.
  },
})
