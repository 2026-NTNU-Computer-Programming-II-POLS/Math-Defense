import { api } from './api'

export interface AchievementOut {
  id: string
  name: string
  description: string
  category: string
  talent_points: number
  unlocked: boolean
  unlocked_at: string | null
}

export interface AchievementSummary {
  unlocked: number
  total: number
  talent_points_earned: number
}

export const achievementService = {
  list() {
    return api.get<AchievementOut[]>('/api/achievements')
  },
  summary() {
    return api.get<AchievementSummary>('/api/achievements/summary')
  },
}
