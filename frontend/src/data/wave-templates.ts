import { EnemyType } from './constants'
import type { EnemySpawnEntry } from './level-defs'

function s(type: EnemyType, n = 1): EnemySpawnEntry[] {
  return Array.from({ length: n }, () => ({ type }))
}

export const WaveTemplates = {
  easyGeneral: (n: number) => s(EnemyType.GENERAL, n),
  mixedBasic: (generals: number, fast: number) => [
    ...s(EnemyType.GENERAL, generals),
    ...s(EnemyType.FAST, fast),
  ],
  midTier: (strong: number, split: number, fast: number) => [
    ...s(EnemyType.STRONG, strong),
    ...s(EnemyType.SPLIT, split),
    ...s(EnemyType.FAST, fast),
  ],
  withHelper: (helpers: number, generals: number, fast: number) => [
    ...s(EnemyType.HELPER, helpers),
    ...s(EnemyType.GENERAL, generals),
    ...s(EnemyType.FAST, fast),
  ],
  bossA: () => s(EnemyType.BOSS_A, 1),
  bossB: () => s(EnemyType.BOSS_B, 1),
  bossWithEscort: (bossType: EnemyType, escort: EnemyType, escortCount: number) => [
    ...s(escort, escortCount),
    ...s(bossType, 1),
  ],
} as const
