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
    alias: {
      '/wasm/math_engine.js': resolve(__dirname, 'src/math/__mocks__/wasmStub.ts'),
    },
  },
})
