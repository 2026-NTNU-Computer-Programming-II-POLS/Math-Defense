import { onMounted, onUnmounted, ref, type Ref } from 'vue'

/**
 * Run `fn` on a fixed interval while `enabled.value` is true.
 *
 * Adds optional jitter so independently-mounted instances do not
 * synchronize on the exact same second after a class-wide page load.
 */
export function usePolling(
  fn: () => Promise<void> | void,
  intervalMs: number,
  enabled: Ref<boolean> = ref(true),
  jitterMs = 0,
): void {
  let id: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  function schedule(): void {
    if (stopped) return
    const wait = intervalMs + (jitterMs > 0 ? Math.random() * jitterMs : 0)
    id = setTimeout(async () => {
      if (stopped) return
      if (enabled.value) {
        try { await fn() } catch (e) { console.error('[usePolling] tick failed:', e) }
      }
      // Re-check after the await: unmount may have occurred while fn was in flight.
      if (!stopped) schedule()
    }, wait)
  }

  onMounted(schedule)
  onUnmounted(() => {
    stopped = true
    if (id !== null) {
      clearTimeout(id)
      id = null
    }
  })
}
