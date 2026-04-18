import { api } from './api'

export interface LeaderboardEntry {
  id: string
  rank: number
  username: string
  level: number
  score: number
  kills: number
  waves_survived: number
  created_at: string
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[]
  total: number
}

export const leaderboardService = {
  get(level?: number, page = 1, perPage = 20, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
    if (level != null) params.set('level', String(level))
    return api.get<LeaderboardResponse>(`/api/leaderboard?${params}`, { signal })
  },
  submit(payload: {
    kills: number
    waves_survived: number
    session_id: string
  }) {
    return api.post<{ id: string; score: number }>('/api/leaderboard', payload)
  },
}
