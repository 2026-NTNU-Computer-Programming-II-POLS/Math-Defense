import { api } from './api'
import type { Competency } from './assessmentService'

// Mirrors backend RecommendationOut (Pedagogical_Backlog_Spec §28).
export interface Recommendation {
  star: number
  weighted_mean: number
  lowest_competency: Competency
  lowest_mean: number
  // Talent node id to highlight on TalentTreeView, or null when the
  // lowest competency has no talent surface (PROBABILITY).
  talent_node_id: string | null
}

export const recommendationService = {
  me() {
    return api.get<Recommendation>('/api/recommendation/me')
  },
}
