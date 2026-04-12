/**
 * SplitSlimePolicy — centralizes split-slime child spawning logic
 * Eliminates duplicated code between CombatSystem and MovementSystem.
 */
import { EnemyType } from '@/data/constants'
import { createEnemy } from '@/entities/EnemyFactory'
import type { Enemy } from '@/entities/types'

export interface SplitContext {
  pathFunction: ((x: number) => number) | null
  onChildCreated: (child: Enemy) => void
}

export function shouldSplit(enemy: Enemy): boolean {
  return enemy.type === EnemyType.SPLIT_SLIME
}

/**
 * Spawn split children from a parent slime.
 * @param parent the parent enemy (dead or reached origin)
 * @param context pathFunction + onChildCreated callback
 * @param spawnOffset distance to offset back along the path (use 3 when reaching origin, 0 when killed)
 */
export function spawnChildren(
  parent: Enemy,
  context: SplitContext,
  spawnOffset = 0,
): Enemy[] {
  if (!context.pathFunction) return []

  const children: Enemy[] = []

  for (let i = 0; i < 2; i++) {
    const baseX = spawnOffset > 0
      ? parent.x - parent._direction * spawnOffset
      : parent.x
    const child = createEnemy(EnemyType.BASIC_SLIME, context.pathFunction, {
      startX: baseX + (i === 0 ? -0.3 : 0.3),
      targetX: parent._targetX,
    })
    child.hp = Math.round(parent.maxHp * 0.4)
    child.maxHp = child.hp
    child.size = Math.round(parent.size * 0.7)
    child.reward = Math.round(parent.reward * 0.3)
    child.color = '#a070d0'

    children.push(child)
    context.onChildCreated(child)
  }

  return children
}
