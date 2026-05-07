import { api } from './api'

// Mirrors backend Competency enum (backend/app/domain/assessment/competencies.py).
// Order matters — bars render in this order on the dashboard.
export const COMPETENCIES = [
  'MAGIC',
  'RADAR',
  'MATRIX',
  'LIMIT',
  'CALCULUS',
  'CHAIN_RULE',
  'PROBABILITY',
] as const

export type Competency = (typeof COMPETENCIES)[number]

export interface BetaSummary {
  alpha: number
  beta: number
  mean: number
  ci_low: number
  ci_high: number
}

export interface StudentCompetency {
  student_id: string
  student_name: string
  posteriors: Record<Competency, BetaSummary>
  lowest_competency: Competency
  suggestion: string
}

export interface ClassPosteriors {
  class_id: string
  students: StudentCompetency[]
}

export const assessmentService = {
  classPosteriors(classId: string) {
    return api.get<ClassPosteriors>(
      `/api/assessment/class/${classId}/posteriors`,
    )
  },
}
