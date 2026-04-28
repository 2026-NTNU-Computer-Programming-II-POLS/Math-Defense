import { api } from './api'

export interface SessionOut {
  schema_version: 1
  id: string
  star_rating: number
  status: string
  current_wave: number
  gold: number
  hp: number
  score: number
  started_at: string
  ended_at?: string
  newly_unlocked_achievements?: { id: string; talent_points: number }[]
}

export interface SessionEndPayload {
  score: number
  kills: number
  waves_survived: number
  kill_value?: number
  cost_total?: number
  time_total?: number
  health_origin?: number
  health_final?: number
  time_exclude_prepare?: number[]
  n_prep_phases?: number
  total_score?: number
}

export const sessionService = {
  create(starRating: number, pathConfig?: object, initialAnswer?: boolean) {
    return api.post<SessionOut>('/api/sessions', {
      star_rating: starRating,
      path_config: pathConfig,
      initial_answer: initialAnswer ?? false,
    })
  },
  getActive() {
    return api.get<SessionOut | null>('/api/sessions/active')
  },
  update(id: string, data: Partial<{ current_wave: number; gold: number; hp: number; score: number; kill_value: number; cost_total: number }>) {
    return api.patch<SessionOut>(`/api/sessions/${id}`, data)
  },
  end(id: string, data: SessionEndPayload) {
    return api.post<SessionOut>(`/api/sessions/${id}/end`, data)
  },
  abandon(id: string) {
    return api.post<SessionOut>(`/api/sessions/${id}/abandon`, {})
  },
}
