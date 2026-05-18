import { api } from './api'

export interface ActivityInfo {
  id: string
  class_id: string | null
  teacher_id: string
  title: string
  deadline: string
  settled: boolean
  settled_at: string | null
  settled_by: string | null
  created_at: string
}

export interface OccupationInfo {
  id: string
  slot_id: string
  student_id: string | null
  score: number
  occupied_at: string
  player_name?: string | null
  is_own: boolean
}

export interface SlotInfo {
  id: string
  activity_id: string
  star_rating: number
  slot_index: number
  path_config: Record<string, unknown> | null
  occupation: OccupationInfo | null
}

export interface ActivityDetail {
  activity: ActivityInfo
  slots: SlotInfo[]
}

export interface PlayResult {
  seized: boolean
  occupation: OccupationInfo | null
}

export interface RankingEntry {
  rank: number
  student_id: string | null
  player_name: string | null
  territory_value: number
}

export interface CompositionBucket {
  star: number
  count: number
}

export interface RankingEntryWithMeta {
  rank: number
  student_id: string | null
  player_name: string | null
  territory_value: number
  rank_change: number | null
  last_occupation_at: string | null
  composition: CompositionBucket[]
}

export interface RankingsMeta {
  activity_id: string
  entries: RankingEntryWithMeta[]
  user_rank: number | null
  refreshed_at: string
}

export interface SlotDefinition {
  star_rating: number
  path_config?: Record<string, unknown> | null
}

export type TerritoryRecommendationRationale = 'step_up_one_level' | 'first_attempt'

export interface TerritoryRecommendation {
  slot_id: string
  slot_index: number
  star_rating: number
  rationale_code: TerritoryRecommendationRationale
  user_avg_at_target: number | null
  occupant_score: number | null
}

export const territoryService = {
  createActivity(payload: {
    title: string
    deadline: string
    class_id?: string | null
    slots: SlotDefinition[]
  }) {
    return api.post<ActivityInfo>('/api/activities', payload)
  },

  listActivities(classId?: string) {
    const params = classId ? `?class_id=${encodeURIComponent(classId)}` : ''
    return api.get<ActivityInfo[]>(`/api/activities${params}`)
  },

  getActivity(id: string) {
    return api.get<ActivityDetail>(`/api/activities/${id}`)
  },

  playTerritory(activityId: string, slotId: string, sessionId: string) {
    return api.post<PlayResult>(`/api/activities/${activityId}/slots/${slotId}/play`, { session_id: sessionId })
  },

  getRankings(activityId: string) {
    return api.get<RankingEntry[]>(`/api/activities/${activityId}/rankings`)
  },

  getRankingsWithMeta(activityId: string, opts: { classId?: string | null } = {}) {
    const qs = opts.classId ? `?class_id=${encodeURIComponent(opts.classId)}` : ''
    return api.get<RankingsMeta>(`/api/activities/${activityId}/rankings/with-meta${qs}`)
  },

  getTerritoryRecommendation(activityId: string) {
    return api.get<TerritoryRecommendation | null>(`/api/recommendation/territory/${activityId}`)
  },

  settleActivity(activityId: string) {
    return api.post<void>(`/api/activities/${activityId}/settle`, {})
  },
}
