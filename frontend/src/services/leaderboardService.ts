import { api } from './api'

export interface LeaderboardEntry {
  id: string
  rank: number
  player_name: string
  level: number
  score: number
  // V3 canonical score. Rankings use COALESCE(total_score, score), so the UI
  // displays `total_score ?? score` to match the rank order and the
  // end-of-game Total Score. NULL for pre-V3 / fallback rows.
  total_score: number | null
  kills: number
  waves_survived: number
  created_at: string
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[]
  total: number
}

export interface PersonalHistoryEntry {
  id: string
  level: number
  score: number
  // V3 canonical score; displayed as `total_score ?? score`. NULL for pre-V3
  // and practice/preview rows whose value was cleared.
  total_score: number | null
  kills: number
  waves_survived: number
  created_at: string
  is_personal_best: boolean
}

export interface PersonalHistoryResponse {
  entries: PersonalHistoryEntry[]
  total: number
}

export const leaderboardService = {
  get(level?: number, page = 1, perPage = 20, signal?: AbortSignal) {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
    if (level != null) params.set('level', String(level))
    return api.get<LeaderboardResponse>(`/api/leaderboard?${params}`, { signal })
  },

  getForChallenge(challengeId: string, page = 1, perPage = 20, signal?: AbortSignal) {
    const params = new URLSearchParams({
      challenge_id: challengeId,
      page: String(page),
      per_page: String(perPage),
    })
    return api.get<LeaderboardResponse>(`/api/leaderboard?${params}`, { signal })
  },

  getMyHistory(level?: number, signal?: AbortSignal) {
    const params = new URLSearchParams()
    if (level != null) params.set('level', String(level))
    const qs = params.toString()
    const url = qs ? `/api/leaderboard/me?${qs}` : '/api/leaderboard/me'
    return api.get<PersonalHistoryResponse>(url, { signal })
  },
}
