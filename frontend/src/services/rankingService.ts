import { api } from './api'
import type { LeaderboardResponse } from './leaderboardService'
import type { RankingEntry } from './territoryService'

export interface ExternalRankingEntry {
  rank: number
  class_id: string
  class_name: string | null
  avg_territory_value: number
}

export const rankingService = {
  getGlobal(level?: number, page = 1, perPage = 20, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
    if (level != null) params.set('level', String(level))
    return api.get<LeaderboardResponse>(`/api/leaderboard?${params}`, { signal })
  },

  getByClass(classId: string, level?: number, page = 1, perPage = 20, signal?: AbortSignal) {
    const params = new URLSearchParams({
      class_id: classId,
      page: String(page),
      per_page: String(perPage),
    })
    if (level != null) params.set('level', String(level))
    return api.get<LeaderboardResponse>(`/api/leaderboard?${params}`, { signal })
  },

  getInternal(activityId: string, signal?: AbortSignal) {
    return api.get<RankingEntry[]>(`/api/activities/${activityId}/rankings`, { signal })
  },

  getExternal(activityId: string, signal?: AbortSignal) {
    return api.get<ExternalRankingEntry[]>(`/api/activities/${activityId}/external-rankings`, { signal })
  },
}
