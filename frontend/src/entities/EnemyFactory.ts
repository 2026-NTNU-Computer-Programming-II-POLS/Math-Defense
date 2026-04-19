/**
 * EnemyFactory — enemy factory (pure TypeScript, no Vue dependency)
 * Builds Enemy objects from ENEMY_DEFS data; movement logic is handled by MovementSystem.
 */
import { ENEMY_DEFS } from '@/data/enemy-defs'
import type { EnemyType } from '@/data/constants'
import type { SegmentedPath } from '@/domain/path/segmented-path'
import type { Enemy } from './types'

let _nextId = 0

export function createEnemy(
  type: EnemyType,
  path: SegmentedPath,
  startX: number = path.startX,
  targetX: number = path.targetX,
): Enemy {
  const def = ENEMY_DEFS[type]
  if (!def) throw new Error(`Unknown enemy type: ${type}`)

  // Clamp to the path's x-range so split-slime children spawned near the
  // endpoints (parent.x ± 0.3) never hand `evaluateAt` an out-of-range x,
  // which would throw. The clamped position is close enough that the
  // visual offset is preserved on the next tick's strategy advance.
  const lo = Math.min(path.startX, path.targetX)
  const hi = Math.max(path.startX, path.targetX)
  const spawnX = Math.min(hi, Math.max(lo, startX))
  const startY = path.evaluateAt(spawnX)

  return {
    id: `enemy_${++_nextId}`,
    type,
    x: spawnX,
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

    _pathX: spawnX,
    _targetX: targetX,
    _direction: targetX > startX ? 1 : -1,

    // Clone nested tuples so later mutations of a single enemy's stealth
    // ranges can't leak back to ENEMY_DEFS and poison sibling enemies.
    stealthRanges: def.stealthRanges?.map(([a, b]) => [a, b] as [number, number]) ?? [],
    isStealthed: false,
    splitDepth: 0,
  }
}
