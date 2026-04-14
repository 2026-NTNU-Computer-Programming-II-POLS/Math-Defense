import { ref } from 'vue'
import { leaderboardService, type LeaderboardEntry } from '@/services/leaderboardService'

export function useLeaderboard() {
  const entries = ref<LeaderboardEntry[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')
  let fetchId = 0
  let inflight: AbortController | null = null

  async function fetch(level?: number, page = 1): Promise<void> {
    // Cancel any inflight request so a rapid level-filter change doesn't let
    // the older (slower) response arrive last and overwrite the newer one.
    // Discarding by fetchId alone leaves the socket open; aborting frees it.
    inflight?.abort()
    const controller = new AbortController()
    inflight = controller
    const thisId = ++fetchId
    loading.value = true
    error.value = ''
    try {
      const res = await leaderboardService.get(level, page, undefined, controller.signal)
      if (thisId !== fetchId) return
      entries.value = res.entries
      total.value = res.total
    } catch (e) {
      if (thisId !== fetchId) return
      // Our own abort — a newer fetch already took over; swallow silently.
      if (e instanceof DOMException && e.name === 'AbortError') return
      error.value = e instanceof Error ? e.message : '無法載入排行榜'
    } finally {
      if (thisId === fetchId) {
        loading.value = false
        inflight = null
      }
    }
  }

  return { entries, total, loading, error, fetch }
}
