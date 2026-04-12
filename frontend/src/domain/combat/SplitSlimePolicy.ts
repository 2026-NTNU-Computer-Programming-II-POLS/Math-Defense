/**
 * SplitSlimePolicy — 統一處理分裂史萊姆的子體生成
 * 消除 CombatSystem 和 MovementSystem 之間的重複邏輯
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
 * 生成分裂子體
 * @param parent 父體（已死亡或到達原點）
 * @param context pathFunction + onChildCreated 回呼
 * @param spawnOffset 沿路徑向後偏移的距離（到達原點時用 3，被殺時用 0）
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
