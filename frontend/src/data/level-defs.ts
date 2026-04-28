import { EnemyType } from './constants'

export interface EnemySpawnEntry {
  readonly type: EnemyType
}

export interface WaveDef {
  readonly spawnInterval: number
  readonly enemies: ReadonlyArray<EnemySpawnEntry>
}
