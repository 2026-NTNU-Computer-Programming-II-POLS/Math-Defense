import { api } from './api'

export interface TalentNodeOut {
  id: string
  tower_type: string
  attribute: string
  name: string
  description: string
  max_level: number
  cost_per_level: number
  effect_per_level: number
  prerequisites: string[]
  current_level: number
}

export interface TalentTreeOut {
  points_earned: number
  points_spent: number
  points_available: number
  nodes: TalentNodeOut[]
}

export interface TalentModifiersOut {
  modifiers: Record<string, Record<string, number>>
}

export const talentService = {
  getTree() {
    return api.get<TalentTreeOut>('/api/talents')
  },
  getModifiers() {
    return api.get<TalentModifiersOut>('/api/talents/modifiers')
  },
  allocate(nodeId: string) {
    return api.post<TalentTreeOut>(`/api/talents/${nodeId}/allocate`, {})
  },
  reset() {
    return api.post<TalentTreeOut>('/api/talents/reset', {})
  },
}
