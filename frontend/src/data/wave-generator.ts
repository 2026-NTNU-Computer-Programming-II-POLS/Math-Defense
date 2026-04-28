import { EnemyType } from './constants'
import type { WaveDef, EnemySpawnEntry } from './level-defs'

function s(type: EnemyType, n = 1): EnemySpawnEntry[] {
  return Array.from({ length: n }, () => ({ type }))
}

export function buildWavesForStar(starRating: number): WaveDef[] {
  switch (starRating) {
    case 1:
      return [
        { spawnInterval: 1.5, enemies: s(EnemyType.GENERAL, 4) },
        { spawnInterval: 1.2, enemies: s(EnemyType.GENERAL, 6) },
        { spawnInterval: 1.0, enemies: s(EnemyType.GENERAL, 8) },
      ]
    case 2:
      return [
        { spawnInterval: 1.2, enemies: [...s(EnemyType.GENERAL, 3), ...s(EnemyType.FAST, 2)] },
        { spawnInterval: 1.0, enemies: [...s(EnemyType.GENERAL, 4), ...s(EnemyType.FAST, 3)] },
        { spawnInterval: 0.9, enemies: [...s(EnemyType.FAST, 4), ...s(EnemyType.GENERAL, 4)] },
        { spawnInterval: 0.8, enemies: [...s(EnemyType.FAST, 6), ...s(EnemyType.GENERAL, 4)] },
      ]
    case 3:
      return [
        { spawnInterval: 1.0, enemies: [...s(EnemyType.GENERAL, 3), ...s(EnemyType.STRONG, 1), ...s(EnemyType.FAST, 2)] },
        { spawnInterval: 0.9, enemies: [...s(EnemyType.STRONG, 1), ...s(EnemyType.SPLIT, 2), ...s(EnemyType.FAST, 3)] },
        { spawnInterval: 0.8, enemies: [...s(EnemyType.STRONG, 2), ...s(EnemyType.SPLIT, 2), ...s(EnemyType.FAST, 4)] },
        { spawnInterval: 0.7, enemies: [...s(EnemyType.HELPER, 1), ...s(EnemyType.SPLIT, 3), ...s(EnemyType.STRONG, 2), ...s(EnemyType.FAST, 5)] },
        { spawnInterval: 0.6, enemies: [...s(EnemyType.HELPER, 1), ...s(EnemyType.STRONG, 3), ...s(EnemyType.SPLIT, 3), ...s(EnemyType.FAST, 4)] },
      ]
    case 4:
      return [
        { spawnInterval: 0.8, enemies: [...s(EnemyType.HELPER, 1), ...s(EnemyType.GENERAL, 3), ...s(EnemyType.FAST, 4)] },
        { spawnInterval: 0.7, enemies: [...s(EnemyType.HELPER, 2), ...s(EnemyType.STRONG, 2), ...s(EnemyType.SPLIT, 3)] },
        { spawnInterval: 0.6, enemies: [...s(EnemyType.HELPER, 2), ...s(EnemyType.FAST, 6), ...s(EnemyType.STRONG, 2)] },
        { spawnInterval: 0.5, enemies: [...s(EnemyType.SPLIT, 4), ...s(EnemyType.HELPER, 2), ...s(EnemyType.STRONG, 3)] },
        { spawnInterval: 2.0, enemies: [...s(EnemyType.FAST, 3), ...s(EnemyType.BOSS_B, 1)] },
      ]
    case 5:
    default:
      return [
        { spawnInterval: 0.8, enemies: [...s(EnemyType.HELPER, 2), ...s(EnemyType.STRONG, 3), ...s(EnemyType.FAST, 5)] },
        { spawnInterval: 0.7, enemies: [...s(EnemyType.HELPER, 2), ...s(EnemyType.STRONG, 4), ...s(EnemyType.SPLIT, 4)] },
        { spawnInterval: 0.6, enemies: [...s(EnemyType.SPLIT, 5), ...s(EnemyType.STRONG, 4), ...s(EnemyType.FAST, 5)] },
        { spawnInterval: 0.5, enemies: [...s(EnemyType.SPLIT, 6), ...s(EnemyType.HELPER, 3), ...s(EnemyType.STRONG, 4)] },
        { spawnInterval: 2.0, enemies: [...s(EnemyType.HELPER, 1), ...s(EnemyType.FAST, 4), ...s(EnemyType.BOSS_B, 1)] },
      ]
  }
}
