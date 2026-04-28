import { TowerType } from './constants'

export interface ParamField {
  key: string
  label: string
  mathLabel: string
  min: number
  max: number
  step: number
  default: number
}

export const TOWER_PARAM_FIELDS: Record<TowerType, ParamField[]> = {
  [TowerType.MAGIC]: [],
  [TowerType.RADAR_A]: [
    { key: 'arcStart', label: 'Arc start (rad)', mathLabel: 'θ₁', min: 0, max: 6.28, step: 0.1, default: 0 },
    { key: 'arcEnd', label: 'Arc end (rad)', mathLabel: 'θ₂', min: 0, max: 6.28, step: 0.1, default: 1.57 },
  ],
  [TowerType.RADAR_B]: [
    { key: 'arcStart', label: 'Arc start (rad)', mathLabel: 'θ₁', min: 0, max: 6.28, step: 0.1, default: 0 },
    { key: 'arcEnd', label: 'Arc end (rad)', mathLabel: 'θ₂', min: 0, max: 6.28, step: 0.1, default: 1.57 },
  ],
  [TowerType.RADAR_C]: [
    { key: 'arcStart', label: 'Arc start (rad)', mathLabel: 'θ₁', min: 0, max: 6.28, step: 0.1, default: 0 },
    { key: 'arcEnd', label: 'Arc end (rad)', mathLabel: 'θ₂', min: 0, max: 6.28, step: 0.1, default: 1.57 },
  ],
  [TowerType.MATRIX]: [],
  [TowerType.LIMIT]: [],
  [TowerType.CALCULUS]: [],
}
