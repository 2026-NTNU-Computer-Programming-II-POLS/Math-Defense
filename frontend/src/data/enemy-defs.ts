/**
 * enemy-defs.ts — enemy stat definitions (pure data, no factory functions)
 * Factory logic lives in entities/EnemyFactory.ts.
 */
import { EnemyType, Colors } from './constants'

export interface EnemyDef {
  type: EnemyType
  name: string
  color: string
  maxHp: number
  speed: number
  size: number
  reward: number
  damage: number      // HP cost to player when this enemy reaches the origin
  stealthRanges?: [number, number][]
}

export const ENEMY_DEFS: Record<EnemyType, EnemyDef> = {
  [EnemyType.BASIC_SLIME]: {
    type: EnemyType.BASIC_SLIME,
    name: '基本史萊姆',
    color: '#40b848',
    maxHp: 30,
    speed: 2.0,
    size: 16,
    reward: 15,
    damage: 1,
  },
  [EnemyType.FAST_SLIME]: {
    type: EnemyType.FAST_SLIME,
    name: '快速史萊姆',
    color: '#4888cc',
    maxHp: 15,
    speed: 4.0,
    size: 12,
    reward: 20,
    damage: 1,
  },
  [EnemyType.TANK_SLIME]: {
    type: EnemyType.TANK_SLIME,
    name: '坦克史萊姆',
    color: Colors.ENEMY,
    maxHp: 100,
    speed: 1.0,
    size: 24,
    reward: 40,
    damage: 2,
  },
  [EnemyType.SPLIT_SLIME]: {
    type: EnemyType.SPLIT_SLIME,
    name: '分裂史萊姆',
    color: '#9060c0',
    maxHp: 40,
    speed: 2.0,
    size: 16,
    reward: 25,
    damage: 1,
  },
  [EnemyType.STEALTH_SLIME]: {
    type: EnemyType.STEALTH_SLIME,
    name: '隱身史萊姆',
    color: 'rgba(220, 220, 240, 0.6)',
    maxHp: 35,
    speed: 2.0,
    size: 16,
    reward: 30,
    damage: 1,
    stealthRanges: [[4, 6]],
  },
  [EnemyType.BOSS_DRAGON]: {
    type: EnemyType.BOSS_DRAGON,
    name: 'Boss 龍',
    color: '#cc2020',
    maxHp: 500,
    speed: 0.8,
    size: 40,
    reward: 200,
    // Reaching the origin with the boss alive is a guaranteed game-over (player maxHp=20)
    damage: 99,
  },
}
