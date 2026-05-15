import type { Ref } from 'vue'
import { authService } from '@/services/authService'

const TOKEN_PROBE_INTERVAL_MS = 15_000

export function useTokenProbe(user: Ref<unknown | null>) {
  let probeTimer: ReturnType<typeof setInterval> | null = null
  let pageHideListener: (() => void) | null = null
  let pageShowListener: (() => void) | null = null

  function start(): void {
    // Defensive: kill any existing interval before starting a new one so we
    // never run two intervals against the same store (e.g. BFCache restore or
    // rapid login/logout cycles).
    if (probeTimer !== null) {
      clearInterval(probeTimer)
      probeTimer = null
    }
    probeTimer = setInterval(async () => {
      if (user.value == null) { stop(); return }
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        await authService.me()
      } catch {
        // 401 branch in api.ts handles logout
      }
    }, TOKEN_PROBE_INTERVAL_MS)

    // Install page-lifecycle listeners once. The null-guard keeps them from
    // stacking across start/stop cycles; they are only removed on stop().
    if (typeof window !== 'undefined' && pageHideListener === null) {
      pageHideListener = () => {
        if (probeTimer !== null) {
          clearInterval(probeTimer)
          probeTimer = null
        }
      }
      window.addEventListener('pagehide', pageHideListener)
    }
    if (typeof window !== 'undefined' && pageShowListener === null) {
      pageShowListener = () => {
        if (user.value != null) start()
      }
      window.addEventListener('pageshow', pageShowListener)
    }
  }

  function stop(): void {
    if (probeTimer !== null) {
      clearInterval(probeTimer)
      probeTimer = null
    }
    if (pageHideListener !== null && typeof window !== 'undefined') {
      window.removeEventListener('pagehide', pageHideListener)
      pageHideListener = null
    }
    if (pageShowListener !== null && typeof window !== 'undefined') {
      window.removeEventListener('pageshow', pageShowListener)
      pageShowListener = null
    }
  }

  return { start, stop }
}
