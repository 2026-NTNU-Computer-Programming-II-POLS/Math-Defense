import { EnemyType } from '@/data/constants'

export interface EnemySpawnEntry {
  readonly type: EnemyType
  /** Per-entry delay (seconds) before this entry spawns, overriding the
   *  wave's spawnInterval. Used by burst() for tight clusters. */
  readonly interval?: number
}

export interface WaveDef {
  readonly spawnInterval: number
  readonly enemies: ReadonlyArray<EnemySpawnEntry>
}

function s(type: EnemyType, n = 1): EnemySpawnEntry[] {
  return Array.from({ length: n }, () => ({ type }))
}

/** A tight cluster: n entries that each spawn `gap` seconds after the previous,
 *  ignoring the wave's spawnInterval. Static data — no RNG, replay-deterministic. */
function burst(type: EnemyType, n: number, gap = 0.15): EnemySpawnEntry[] {
  return Array.from({ length: n }, () => ({ type, interval: gap }))
}

/**
 * Pure on `starRating` alone — no seed, no RNG. Per V3 decision D1, this is
 * changed in place: pre-V3 replays silently desync because their recorded
 * event stream no longer matches the new wave composition. Accepted limitation.
 */
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
        { spawnInterval: 0.8, enemies: [...s(EnemyType.FAST, 6), ...s(EnemyType.GENERAL, 4), ...s(EnemyType.BULWARK, 1)] },
      ]
    case 3:
      return [
        { spawnInterval: 1.0, enemies: [...s(EnemyType.GENERAL, 3), ...s(EnemyType.STRONG, 1), ...s(EnemyType.FAST, 2)] },
        { spawnInterval: 0.9, enemies: [...s(EnemyType.STRONG, 1), ...s(EnemyType.SPLIT, 2), ...s(EnemyType.FAST, 3), ...s(EnemyType.REGENERATOR, 1)] },
        { spawnInterval: 0.8, enemies: [...s(EnemyType.STRONG, 2), ...s(EnemyType.SPLIT, 2), ...s(EnemyType.FAST, 4), ...s(EnemyType.BULWARK, 1)] },
        { spawnInterval: 0.7, enemies: [...s(EnemyType.HELPER, 1), ...s(EnemyType.SPLIT, 3), ...s(EnemyType.STRONG, 2), ...s(EnemyType.FAST, 5), ...burst(EnemyType.SWARMLING, 4)] },
        { spawnInterval: 2.0, enemies: [...s(EnemyType.HELPER, 1), ...s(EnemyType.STRONG, 3), ...s(EnemyType.FAST, 4), ...s(EnemyType.BULWARK, 1), ...s(EnemyType.BOSS_A, 1)] },
      ]
    case 4:
      return [
        { spawnInterval: 0.8, enemies: [...s(EnemyType.HELPER, 1), ...s(EnemyType.GENERAL, 3), ...s(EnemyType.FAST, 4), ...s(EnemyType.BULWARK, 1)] },
        { spawnInterval: 0.7, enemies: [...s(EnemyType.HELPER, 2), ...s(EnemyType.STRONG, 2), ...s(EnemyType.SPLIT, 3), ...s(EnemyType.REGENERATOR, 1), ...s(EnemyType.BULWARK, 1)] },
        { spawnInterval: 0.6, enemies: [...s(EnemyType.HELPER, 2), ...s(EnemyType.FAST, 6), ...s(EnemyType.STRONG, 2), ...burst(EnemyType.SWARMLING, 6)] },
        { spawnInterval: 0.5, enemies: [...s(EnemyType.SPLIT, 4), ...s(EnemyType.HELPER, 2), ...s(EnemyType.STRONG, 3), ...s(EnemyType.REGENERATOR, 2)] },
        { spawnInterval: 2.0, enemies: [...s(EnemyType.FAST, 3), ...s(EnemyType.REGENERATOR, 1), ...s(EnemyType.BULWARK, 1), ...s(EnemyType.BOSS_B, 1)] },
      ]
    case 5:
    default:
      return [
        { spawnInterval: 0.8, enemies: [...s(EnemyType.HELPER, 2), ...s(EnemyType.STRONG, 3), ...s(EnemyType.FAST, 5), ...s(EnemyType.REGENERATOR, 1), ...s(EnemyType.BULWARK, 1)] },
        { spawnInterval: 0.7, enemies: [...s(EnemyType.HELPER, 2), ...s(EnemyType.STRONG, 4), ...s(EnemyType.SPLIT, 4), ...burst(EnemyType.SWARMLING, 8), ...s(EnemyType.BULWARK, 1)] },
        { spawnInterval: 0.6, enemies: [...s(EnemyType.SPLIT, 5), ...s(EnemyType.STRONG, 4), ...s(EnemyType.FAST, 5), ...s(EnemyType.REGENERATOR, 2), ...burst(EnemyType.SWARMLING, 6)] },
        { spawnInterval: 0.5, enemies: [...s(EnemyType.SPLIT, 6), ...s(EnemyType.HELPER, 3), ...s(EnemyType.STRONG, 4), ...s(EnemyType.BULWARK, 2), ...s(EnemyType.REGENERATOR, 1)] },
        { spawnInterval: 2.0, enemies: [...s(EnemyType.HELPER, 1), ...s(EnemyType.FAST, 4), ...s(EnemyType.REGENERATOR, 1), ...s(EnemyType.BULWARK, 1), ...burst(EnemyType.SWARMLING, 5), ...s(EnemyType.BOSS_B, 1)] },
      ]
  }
}
