import { api } from './api'

export interface SeasonOut {
  season_id: string
  name: string
  starts_at: string | null
  ends_at: string | null
  active: boolean
  archived: boolean
  achievement_ids: string[]
}

export interface SeasonCreateRequest {
  season_id: string
  name: string
  starts_at: string
  ends_at: string
}

export const seasonService = {
  list(signal?: AbortSignal) {
    return api.get<SeasonOut[]>('/api/seasons', { signal })
  },
  listAdmin(signal?: AbortSignal) {
    return api.get<SeasonOut[]>('/api/admin/seasons', { signal })
  },
  create(req: SeasonCreateRequest) {
    return api.post<SeasonOut>('/api/admin/seasons', req)
  },
}
