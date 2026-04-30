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

    killValue: def.killValue,

    shield: def.shieldHp ?? 0,
    shieldMax: def.shieldHp ?? 0,

    splitDepth: 0,
    splitCount: def.split?.count ?? 0,
    splitChildType: def.split?.childType ?? null,
    splitChildScale: def.split?.childScale ?? 1,

    helperRadius: def.helper?.radius ?? 0,
    helperHealPerSec: def.helper?.healPerSec ?? 0,
    helperSpeedBuff: def.helper?.speedBuff ?? 0,

    minionTimer: 0,
    minionInterval: def.minion?.interval ?? 0,
    minionType: def.minion?.type ?? null,

    chainRuleTriggered: false,
    chainRuleAnsweredCorrectly: null,

    slowFactor: 0,
    slowTimer: 0,
    speedBoost: 0,
    dotDamage: 0,
    dotTimer: 0,
  }
}
