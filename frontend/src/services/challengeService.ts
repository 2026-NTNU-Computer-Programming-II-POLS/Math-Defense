import { api } from './api'

export type ChallengeTowerType =
  | 'magic'
  | 'radarA'
  | 'radarB'
  | 'radarC'
  | 'matrix'
  | 'limit'
  | 'calculus'

export type ChallengeMechanic =
  | 'calculus_pet'
  | 'monty_hall'
  | 'chain_rule'
  | 'buffs'
  | 'spells'

export interface MagicParamBounds {
  a?: [number, number]
  b?: [number, number]
  c?: [number, number]
}

export interface ChallengeConstraints {
  allowed_towers: ChallengeTowerType[]
  magic_param_bounds: MagicParamBounds
  forbidden_mechanics: ChallengeMechanic[]
  wave_count: number
  target_score: number
}

export interface Challenge {
  id: string
  teacher_id: string
  title: string
  description: string
  constraints: ChallengeConstraints
  created_at: string
  updated_at: string
  deep_link: string
  magic_default_bounds: { a: [number, number]; b: [number, number]; c: [number, number] }
}

export interface ChallengeCreatePayload {
  title: string
  description: string
  constraints: ChallengeConstraints
}

export const challengeService = {
  create(payload: ChallengeCreatePayload) {
    return api.post<Challenge>('/api/challenges', payload)
  },
  get(id: string) {
    return api.get<Challenge>(`/api/challenges/${id}`)
  },
  listMine() {
    return api.get<Challenge[]>('/api/challenges?mine=true')
  },
  rename(id: string, title: string, description: string) {
    return api.patch<Challenge>(`/api/challenges/${id}`, { title, description })
  },
  updateConstraints(id: string, constraints: ChallengeConstraints) {
    return api.put<Challenge>(`/api/challenges/${id}/constraints`, { constraints })
  },
  remove(id: string) {
    return api.delete(`/api/challenges/${id}`)
  },
}
