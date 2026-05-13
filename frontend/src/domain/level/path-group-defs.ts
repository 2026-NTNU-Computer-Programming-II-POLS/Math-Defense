import type { CurveFamily } from '@/math/curve-types'

export type PathGroupId = 'type-1' | 'type-2' | 'type-3' | 'type-4' | 'type-5' | 'type-6' | 'type-7'

export interface PathGroupDef {
  readonly id: PathGroupId
  readonly families: readonly CurveFamily[]
  readonly kMin: number
  readonly kMax: number
}

export const PATH_GROUPS: Record<PathGroupId, PathGroupDef> = {
  'type-1': { id: 'type-1', families: ['polynomial'], kMin: 2, kMax: 5 },
  'type-2': { id: 'type-2', families: ['polynomial', 'trigonometric'], kMin: 2, kMax: 3 },
  'type-3': { id: 'type-3', families: ['polynomial', 'logarithmic'], kMin: 2, kMax: 3 },
  'type-4': { id: 'type-4', families: ['trigonometric', 'logarithmic'], kMin: 2, kMax: 3 },
  'type-5': { id: 'type-5', families: ['trigonometric'], kMin: 2, kMax: 3 },
  'type-6': { id: 'type-6', families: ['logarithmic'], kMin: 2, kMax: 3 },
  'type-7': { id: 'type-7', families: ['polynomial', 'trigonometric', 'logarithmic'], kMin: 3, kMax: 3 },
}
