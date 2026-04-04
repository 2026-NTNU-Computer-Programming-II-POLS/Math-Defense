/**
 * EnemyFactory — 敵人工廠（純 TypeScript，不依賴 Vue）
 * 從 ENEMY_DEFS 資料建立 Enemy 物件，移動邏輯由 MovementSystem 處理。
 */
import { ENEMY_DEFS } from '@/data/enemy-defs'
import type { EnemyType } from '@/data/constants'
import type { Enemy } from './types'

let _nextId = 0

export function createEnemy(
  type: EnemyType,
  pathFn: (x: number) => number,
  overrides: Partial<{ startX: number; targetX: number }> = {},
): Enemy {
  const def = ENEMY_DEFS[type]
  if (!def) throw new Error(`Unknown enemy type: ${type}`)

  const startX = overrides.startX ?? 20
  const targetX = overrides.targetX ?? 0
  const startY = pathFn(startX)

  return {
    id: `enemy_${++_nextId}`,
    type,
    x: startX,
    y: startY,
    hp: def.maxHp,
    maxHp: def.maxHp,
    speed: def.speed,
    speedMultiplier: 1.0,
    size: def.size,
    reward: def.reward,
    color: def.color,
    active: true,
    alive: true,

    pathFn,
    _pathX: startX,
    _targetX: targetX,
    _direction: targetX > startX ? 1 : -1,

    stealthRanges: (def.stealthRanges as [number, number][]) ?? [],
    isStealthed: false,
  }
}
