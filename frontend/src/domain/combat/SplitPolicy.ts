import { Events, EnemyType, ANIM } from '@/data/constants'
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
  return enemy.splitCount > 0 && enemy.splitChildType !== null && enemy.splitDepth < MAX_SPLIT_DEPTH
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
  // Visual Redesign Phase 0: mark the enemy as dying so MovementSystem keeps
  // it in the entity list for the death-animation window. Bosses get a
  // longer window. Combat treats `alive === false` as dead immediately —
  // only the render lifecycle is extended.
  const isBoss = enemy.type === EnemyType.BOSS_A || enemy.type === EnemyType.BOSS_B
  enemy.dying = true
  enemy.dyingTimer = 0
  enemy.deathMaxTime = isBoss ? ANIM.BOSS_DEATH : ANIM.ENEMY_DEATH
  game.eventBus.emit(Events.ENEMY_KILLED, enemy)
  game.eventBus.emit(Events.ENEMY_DYING, enemy)
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

// What kind of damage a caller deals. Callers declare their source; they never
// know about armor, evasion, or per-hit caps — applyDamage owns all of that.
export type DamageSource =
  | 'towerHit'   // discrete instantaneous tower hit  (Radar B/C projectile, Limit pulse)
  | 'towerTick'  // continuous per-frame tower damage already scaled by dt (Radar A sweep, Matrix laser)
  | 'dot'        // damage-over-time tick, already scaled by dt (Magic debuff zone)
  | 'pet'        // Calculus pet attack (discrete)
  | 'spell'      // player-cast spell (Fireball / Lightning)
  | 'effect'     // power-up / event-driven damage (Monty Hall buff)

// Discrete hits are subject to the Bulwark per-hit cap; continuous (dt-scaled)
// sources are not — capping a per-frame slice would be meaningless.
const DISCRETE_SOURCES: ReadonlySet<DamageSource> = new Set<DamageSource>([
  'towerHit', 'pet', 'spell', 'effect',
])

// All damage sources (instant hits, DoT ticks, pets, spells) route through here.
// This is the single place that resolves every defensive modifier:
// vulnerability → per-hit cap → evasion → shield → HP.
export function applyDamage(
  enemy: Enemy,
  rawAmount: number,
  game: CombatGameContext,
  source: DamageSource,
): void {
  if (!enemy.alive) return
  // Visual Redesign Phase 1: arm hit flash. MovementSystem ages the field;
  // EnemyRenderer reads `hitFlashAge` through the projection and paints a
  // brief screen-blend overlay while still under ANIM.HIT_FLASH.
  enemy.hitFlashAge = 0
  let remaining = rawAmount * game.state.enemyVulnerability

  // Amount entering the defensive pipeline (post-vulnerability). Reported as
  // the `raw` figure in DAMAGE_RESOLVED so the floating text reads as
  // "incoming hit → what landed".
  const preDefense = remaining

  // Per-hit cap (Bulwark): clamps discrete hits only; applied before evasion so
  // the limit is deterministic regardless of whether evasion also fires.
  // Continuous towerTick / dot sources are dt-scaled and not capped — this is
  // what makes a ramping continuous tower (Matrix) the counter to Bulwark.
  let capped = false
  if (enemy.damageCapPerHit > 0 && DISCRETE_SOURCES.has(source) && remaining > enemy.damageCapPerHit) {
    remaining = enemy.damageCapPerHit
    capped = true
  }

  // Evasion (Swarmling): only pets and player-earned power-ups bypass it.
  let evaded = false
  if (enemy.towerDamageMult < 1 && source !== 'pet' && source !== 'effect') {
    remaining *= enemy.towerDamageMult
    evaded = true
  }

  // Visible in-combat teaching surface: emit a feedback event only when a
  // defensive trait actually changed a *discrete* hit's number. Continuous
  // (dt-scaled) towerTick / dot sources are excluded so there is no per-frame
  // event storm, and unmodified hits never fire it.
  if ((capped || evaded) && DISCRETE_SOURCES.has(source)) {
    game.eventBus.emit(Events.DAMAGE_RESOLVED, {
      x: enemy.x,
      y: enemy.y,
      raw: preDefense,
      applied: remaining,
      kind: capped ? 'capped' : 'reduced',
    })
  }

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
