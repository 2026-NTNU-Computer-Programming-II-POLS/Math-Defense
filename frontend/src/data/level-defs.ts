import { EnemyType } from './constants'
import type { PathLayout } from './path-segment-types'

export interface EnemySpawnEntry {
  readonly type: EnemyType
}

export interface WaveDef {
  readonly spawnInterval: number
  readonly enemies: ReadonlyArray<EnemySpawnEntry>
}

export interface LevelDef {
  readonly id: number
  readonly nameEn: string
  readonly path: PathLayout
  readonly buildablePositions: ReadonlyArray<readonly [number, number]>
}

export const LEVELS: ReadonlyArray<LevelDef> = []
