import { api } from './api'

export interface ActivityInfo {
  id: string
  class_id: string | null
  teacher_id: string
  title: string
  deadline: string
  settled: boolean
  created_at: string
}

export interface OccupationInfo {
  id: string
  slot_id: string
  student_id: string
  score: number
  occupied_at: string
  player_name?: string | null
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
  occupation: OccupationInfo
}

export interface RankingEntry {
  rank: number
  student_id: string
  territory_value: number
}

export interface SlotDefinition {
  star_rating: number
  path_config?: Record<string, unknown> | null
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
    const params = classId ? `?class_id=${classId}` : ''
    return api.get<ActivityInfo[]>(`/api/activities${params}`)
  },

  getActivity(id: string) {
    return api.get<ActivityDetail>(`/api/activities/${id}`)
  },

  playTerritory(activityId: string, slotId: string, score: number) {
    return api.post<PlayResult>(`/api/activities/${activityId}/slots/${slotId}/play`, { score })
  },

  getRankings(activityId: string) {
    return api.get<RankingEntry[]>(`/api/activities/${activityId}/rankings`)
  },

  settleActivity(activityId: string) {
    return api.post<void>(`/api/activities/${activityId}/settle`, {})
  },
}
