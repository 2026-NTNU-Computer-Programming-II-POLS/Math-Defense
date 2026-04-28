import { EnemyType, Colors } from './constants'

export interface SplitConfig {
  count: number
  childType: EnemyType
  childScale: number
}

export interface HelperConfig {
  radius: number
  healPerSec: number
  speedBuff: number
}

export interface MinionConfig {
  interval: number
  type: EnemyType
}

export interface EnemyDef {
  type: EnemyType
  name: string
  color: string
  maxHp: number
  speed: number
  size: number
  reward: number
  damage: number
  killValue: number
  shieldHp?: number
  split?: SplitConfig
  helper?: HelperConfig
  minion?: MinionConfig
}

export const ENEMY_DEFS: Record<EnemyType, EnemyDef> = {
  [EnemyType.GENERAL]: {
    type: EnemyType.GENERAL,
    name: 'General',
    color: '#40b848',
    maxHp: 30,
    speed: 2.0,
    size: 16,
    reward: 15,
    damage: 1,
    killValue: 10,
  },
  [EnemyType.FAST]: {
    type: EnemyType.FAST,
    name: 'Fast',
    color: '#4888cc',
    maxHp: 15,
    speed: 4.0,
    size: 12,
    reward: 10,
    damage: 1,
    killValue: 5,
  },
  [EnemyType.STRONG]: {
    type: EnemyType.STRONG,
    name: 'Strong',
    color: Colors.ENEMY,
    maxHp: 120,
    speed: 1.0,
    size: 24,
    reward: 40,
    damage: 2,
    killValue: 25,
  },
  [EnemyType.SPLIT]: {
    type: EnemyType.SPLIT,
    name: 'Split',
    color: '#9060c0',
    maxHp: 40,
    speed: 2.0,
    size: 16,
    reward: 15,
    damage: 1,
    killValue: 5,
    split: {
      count: 2,
      childType: EnemyType.GENERAL,
      childScale: 0.4,
    },
  },
  [EnemyType.HELPER]: {
    type: EnemyType.HELPER,
    name: 'Helper',
    color: '#48c878',
    maxHp: 35,
    speed: 2.0,
    size: 16,
    reward: 30,
    damage: 1,
    killValue: 15,
    helper: {
      radius: 3.0,
      healPerSec: 5,
      speedBuff: 0.2,
    },
  },
  [EnemyType.BOSS_A]: {
    type: EnemyType.BOSS_A,
    name: 'Boss Type-A',
    color: '#cc2020',
    maxHp: 500,
    speed: 0.8,
    size: 40,
    reward: 200,
    damage: 99,
    killValue: 100,
    shieldHp: 200,
    minion: {
      interval: 8,
      type: EnemyType.GENERAL,
    },
  },
  [EnemyType.BOSS_B]: {
    type: EnemyType.BOSS_B,
    name: 'Boss Type-B',
    color: '#dd3080',
    maxHp: 600,
    speed: 0.7,
    size: 44,
    reward: 300,
    damage: 99,
    killValue: 150,
    shieldHp: 250,
    minion: {
      interval: 8,
      type: EnemyType.FAST,
    },
  },
}
