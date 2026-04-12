/**
 * level-defs.ts — level configuration (pure data, no factory functions)
 * Wave enemies are described as { type, count }; WaveSystem is responsible for actually creating Enemy instances.
 */
import { TowerType, EnemyType } from './constants'

export interface EnemySpawnEntry {
  type: EnemyType
  overrides?: Partial<{ startX: number; targetX: number }>
}

export interface WaveDef {
  spawnInterval: number
  enemies: EnemySpawnEntry[]
}

export interface LevelDef {
  id: number
  name: string
  nameEn: string
  description: string
  availableTowers: TowerType[]
  waves: WaveDef[]
}

// Shorthand helper
function s(type: EnemyType, n = 1): EnemySpawnEntry[] {
  return Array.from({ length: n }, () => ({ type }))
}

export const LEVELS: LevelDef[] = [
  // ── Level 1: Grassland ──
  {
    id: 1, name: '草原', nameEn: 'Grassland',
    description: '教學關，引導 y = mx + b',
    availableTowers: [TowerType.FUNCTION_CANNON, TowerType.PROBABILITY_SHRINE],
    waves: [
      { spawnInterval: 1.5, enemies: s(EnemyType.BASIC_SLIME, 4) },
      { spawnInterval: 1.2, enemies: s(EnemyType.BASIC_SLIME, 6) },
      { spawnInterval: 1.0, enemies: s(EnemyType.BASIC_SLIME, 8) },
    ],
  },

  // ── Level 2: Canyon ──
  {
    id: 2, name: '峽谷', nameEn: 'Canyon',
    description: '三角函數覆蓋 + 拋物線路徑',
    availableTowers: [TowerType.FUNCTION_CANNON, TowerType.RADAR_SWEEP, TowerType.PROBABILITY_SHRINE],
    waves: [
      { spawnInterval: 1.2, enemies: [...s(EnemyType.BASIC_SLIME, 3), ...s(EnemyType.FAST_SLIME, 2)] },
      { spawnInterval: 1.0, enemies: [...s(EnemyType.BASIC_SLIME, 3), ...s(EnemyType.FAST_SLIME, 3)] },
      { spawnInterval: 0.9, enemies: [...s(EnemyType.FAST_SLIME, 4), ...s(EnemyType.BASIC_SLIME, 4)] },
      { spawnInterval: 0.8, enemies: [...s(EnemyType.FAST_SLIME, 6), ...s(EnemyType.BASIC_SLIME, 4)] },
    ],
  },

  // ── Level 3: Fortress ──
  {
    id: 3, name: '堡壘', nameEn: 'Fortress',
    description: '矩陣連結 + 積分砲登場',
    availableTowers: [
      TowerType.FUNCTION_CANNON, TowerType.RADAR_SWEEP,
      TowerType.MATRIX_LINK, TowerType.PROBABILITY_SHRINE, TowerType.INTEGRAL_CANNON,
    ],
    waves: [
      { spawnInterval: 1.0, enemies: [...s(EnemyType.BASIC_SLIME, 3), ...s(EnemyType.TANK_SLIME, 1), ...s(EnemyType.FAST_SLIME, 2)] },
      { spawnInterval: 0.9, enemies: [...s(EnemyType.TANK_SLIME, 1), ...s(EnemyType.SPLIT_SLIME, 2), ...s(EnemyType.FAST_SLIME, 3)] },
      { spawnInterval: 0.8, enemies: [...s(EnemyType.TANK_SLIME, 2), ...s(EnemyType.SPLIT_SLIME, 2), ...s(EnemyType.FAST_SLIME, 4)] },
      { spawnInterval: 0.7, enemies: [...s(EnemyType.SPLIT_SLIME, 3), ...s(EnemyType.TANK_SLIME, 2), ...s(EnemyType.FAST_SLIME, 5)] },
      { spawnInterval: 0.6, enemies: [...s(EnemyType.TANK_SLIME, 3), ...s(EnemyType.SPLIT_SLIME, 3), ...s(EnemyType.FAST_SLIME, 4)] },
    ],
  },

  // ── Level 4: Dragon Lair ──
  {
    id: 4, name: '魔王巢', nameEn: 'Dragon Lair',
    description: 'Boss 龍 + 傅立葉護盾破解',
    availableTowers: [
      TowerType.FUNCTION_CANNON, TowerType.RADAR_SWEEP,
      TowerType.MATRIX_LINK, TowerType.PROBABILITY_SHRINE,
      TowerType.INTEGRAL_CANNON, TowerType.FOURIER_SHIELD,
    ],
    waves: [
      { spawnInterval: 0.8, enemies: [...s(EnemyType.STEALTH_SLIME, 3), ...s(EnemyType.FAST_SLIME, 4)] },
      { spawnInterval: 0.7, enemies: [...s(EnemyType.STEALTH_SLIME, 3), ...s(EnemyType.TANK_SLIME, 2), ...s(EnemyType.SPLIT_SLIME, 3)] },
      { spawnInterval: 0.6, enemies: [...s(EnemyType.STEALTH_SLIME, 4), ...s(EnemyType.FAST_SLIME, 6), ...s(EnemyType.TANK_SLIME, 2)] },
      { spawnInterval: 0.5, enemies: [...s(EnemyType.SPLIT_SLIME, 4), ...s(EnemyType.STEALTH_SLIME, 4), ...s(EnemyType.TANK_SLIME, 3)] },
      { spawnInterval: 2.0, enemies: s(EnemyType.BOSS_DRAGON, 1) },
    ],
  },
]
