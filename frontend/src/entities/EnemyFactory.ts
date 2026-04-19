/**
 * EnemyFactory — enemy factory (pure TypeScript, no Vue dependency)
 * Builds Enemy objects from ENEMY_DEFS data; movement logic is handled by MovementSystem.
 */
import { ENEMY_DEFS } from '@/data/enemy-defs'
import type { EnemyType } from '@/data/constants'
import type { Enemy } from './types'

let _nextId = 0

export function createEnemy(
  type: EnemyType,
  pathFn: (x: number) => number,
  startX = 20,
  targetX = 0,
): Enemy {
  const def = ENEMY_DEFS[type]
  if (!def) throw new Error(`Unknown enemy type: ${type}`)

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
    damage: def.damage,
    color: def.color,
    active: true,
    alive: true,

    pathFn,
    _pathX: startX,
    _targetX: targetX,
    _direction: targetX > startX ? 1 : -1,

    // Clone nested tuples so later mutations of a single enemy's stealth
    // ranges can't leak back to ENEMY_DEFS and poison sibling enemies.
    stealthRanges: def.stealthRanges?.map(([a, b]) => [a, b] as [number, number]) ?? [],
    isStealthed: false,
    splitDepth: 0,
  }
}
