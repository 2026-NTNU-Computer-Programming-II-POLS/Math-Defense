import { ref } from 'vue'
import { leaderboardService, type LeaderboardEntry } from '@/services/leaderboardService'

export function useLeaderboard() {
  const entries = ref<LeaderboardEntry[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')

  async function fetch(level?: number, page = 1): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const res = await leaderboardService.get(level, page)
      entries.value = res.entries
      total.value = res.total
    } catch (e) {
      error.value = e instanceof Error ? e.message : '無法載入排行榜'
    } finally {
      loading.value = false
    }
  }

  return { entries, total, loading, error, fetch }
}
