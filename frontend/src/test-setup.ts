import { afterEach } from 'vitest'
import { appBus } from '@/lib/app-bus'

// happy-dom v20 stopped exposing window.localStorage by default (it now
// defers to Node's experimental --localstorage-file flag). Production code
// already guards with try/catch, but tests that assert on persistence need
// a real Storage. Install a minimal in-memory shim once per worker.
if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() { return store.size },
    key(i) { return [...store.keys()][i] ?? null },
    getItem(k) { return store.has(k) ? store.get(k)! : null },
    setItem(k, v) { store.set(String(k), String(v)) },
    removeItem(k) { store.delete(k) },
    clear() { store.clear() },
  }
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
}

afterEach(() => {
  appBus._resetForTests()
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear()
  }
})
