import { Events } from '@/data/constants'
import { createEnemy } from '@/entities/EnemyFactory'
import type { SegmentedPath } from '@/domain/path/segmented-path'
import type { Enemy } from '@/entities/types'

export interface CombatGameContext {
  eventBus: { emit(event: string, payload?: unknown): void }
  levelContext: { path: SegmentedPath | null } | null | undefined
  enemies: Enemy[]
  state: { enemyVulnerability: number }
}

export interface SplitContext {
  path: SegmentedPath | null
  onChildCreated: (child: Enemy) => void
}

export const MAX_SPLIT_DEPTH = 2

export function shouldSplit(enemy: Enemy): boolean {
  return enemy.alive && enemy.splitCount > 0 && enemy.splitChildType !== null && enemy.splitDepth < MAX_SPLIT_DEPTH
}

export function spawnChildren(
  parent: Enemy,
  context: SplitContext,
  spawnOffset = 0,
): Enemy[] {
  if (!context.path) {
    console.warn(
      `[SplitPolicy] path is null — parent id=${parent.id} will not split.`,
    )
    return []
  }

  const children: Enemy[] = []
  const childType = parent.splitChildType!
  const count = parent.splitCount

  const parentSegment = context.path.findSegmentAt(parent.x)
  const [segLo, segHi] = parentSegment?.xRange ?? [
    Math.min(context.path.startX, context.path.targetX),
    Math.max(context.path.startX, context.path.targetX),
  ]

  const spread = 0.3
  for (let i = 0; i < count; i++) {
    const baseX = spawnOffset > 0
      ? parent.x - parent._direction * spawnOffset
      : parent.x
    const offset = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2 * spread
    const rawX = baseX + offset
    const clampedX = Math.min(segHi, Math.max(segLo, rawX))
    const child = createEnemy(
      childType,
      context.path,
      clampedX,
      parent._targetX,
    )
    child.hp = Math.round(parent.maxHp * parent.splitChildScale)
    child.maxHp = child.hp
    child.size = Math.round(parent.size * 0.7)
    child.reward = Math.round(parent.reward * 0.3)
    child.killValue = Math.round(parent.killValue * 0.2)
    child.color = '#a070d0'
    child.splitDepth = parent.splitDepth + 1

    children.push(child)
    context.onChildCreated(child)
  }

  return children
}

export function killEnemy(enemy: Enemy, game: CombatGameContext): void {
  enemy.hp = 0
  enemy.alive = false
  enemy.active = false
  game.eventBus.emit(Events.ENEMY_KILLED, enemy)
  if (shouldSplit(enemy) && game.levelContext?.path) {
    spawnChildren(enemy, {
      path: game.levelContext.path,
      onChildCreated: (child) => {
        game.enemies.push(child)
        game.eventBus.emit(Events.ENEMY_SPAWNED, child)
      },
    })
  }
}

// All damage sources (instant hits, DoT ticks, pets, spells) route through here.
// enemyVulnerability is applied exactly once at this call site.
export function applyDamage(enemy: Enemy, rawAmount: number, game: CombatGameContext): void {
  if (!enemy.alive) return
  let remaining = rawAmount * game.state.enemyVulnerability
  if (enemy.shield > 0) {
    const absorbed = Math.min(enemy.shield, remaining)
    enemy.shield -= absorbed
    remaining -= absorbed
  }
  if (remaining > 0) {
    enemy.hp = Math.round((enemy.hp - remaining) * 1e4) / 1e4
  }
  if (enemy.hp <= 0) {
    killEnemy(enemy, game)
  }
}
