import { api } from './api'

export interface SessionOut {
  id: string
  level: number
  status: string
  current_wave: number
  gold: number
  hp: number
  score: number
  started_at: string
  ended_at?: string
}

export const sessionService = {
  create(level: number) {
    return api.post<SessionOut>('/api/sessions', { level })
  },
  getActive() {
    return api.get<SessionOut | null>('/api/sessions/active')
  },
  update(id: string, data: Partial<{ current_wave: number; gold: number; hp: number; score: number }>) {
    return api.patch<SessionOut>(`/api/sessions/${id}`, data)
  },
  end(id: string, data: { score: number; kills: number; waves_survived: number }) {
    return api.post<SessionOut>(`/api/sessions/${id}/end`, data)
  },
  abandon(id: string) {
    return api.post<SessionOut>(`/api/sessions/${id}/abandon`, {})
  },
}
