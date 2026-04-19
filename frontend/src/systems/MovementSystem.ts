/**
 * MovementSystem — orchestrates per-tick enemy advance.
 *
 * Delegates per-enemy kinematics to the `MovementStrategy` keyed by the
 * current segment's kind, keeping per-enemy `MovementState` in a side table
 * (never on the `Enemy` entity). After the per-enemy loop it computes the
 * lead-enemy x and feeds it to the path's `PathProgressTracker` so segment-
 * boundary events fire exactly once per crossing.
 */
import { Events, GamePhase } from '@/data/constants'
import { distance } from '@/math/MathUtils'
import { getStrategy } from '@/domain/movement/movement-strategy-registry'
import type { MovementState } from '@/domain/movement/movement-strategy'
import type { SegmentedPath } from '@/domain/path/segmented-path'
import type { Game, MovementLevelContext } from '@/engine/Game'
import type { Enemy } from '@/entities/types'

export class MovementSystem {
  private _states = new Map<string, MovementState>()

  /**
   * Optional sink for the lead-enemy x value. The composable injects
   * `gameStore.setLeadEnemyX` here so the system never imports Pinia
   * directly — same pattern as `TowerPlacementSystem`'s selected-tower
   * callback.
   */
  setLeadEnemyX?: (x: number) => void

  init(_game: Game): void {}

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    const ctx: MovementLevelContext | null = game.levelContext

    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const enemy = game.enemies[i]
      if (!enemy.alive) {
        this._states.delete(enemy.id)
        game.enemies.splice(i, 1)
        continue
      }

      if (ctx) {
        this._advanceSegmented(enemy, dt, game, ctx.path)
      }

      this._applyPostAdvance(enemy, game)

      if (!enemy.alive) {
        this._states.delete(enemy.id)
        game.enemies.splice(i, 1)
      }
    }

    if (ctx && game.enemies.length > 0) {
      // Lead = enemy closest to targetX. Game convention: targetX < startX,
      // so "closest to target" = minimum x among alive enemies.
      let leadX = Infinity
      for (const e of game.enemies) {
        if (e.x < leadX) leadX = e.x
      }
      ctx.tracker.update(leadX)
      this.setLeadEnemyX?.(leadX)
    }
  }

  render(_renderer: unknown, _game: Game): void {}

  private _advanceSegmented(
    enemy: Enemy,
    dt: number,
    game: Game,
    path: SegmentedPath,
  ): void {
    const segment = path.findSegmentAt(enemy.x)
    if (!segment) return
    const strategy = getStrategy(segment.kind)
    const prev = this._states.get(enemy.id) ?? { x: enemy.x, y: enemy.y, t: 0 }
    const effectiveSpeed =
      enemy.speed * enemy.speedMultiplier * game.state.enemySpeedMultiplier
    const next = strategy.advance(prev, segment, dt, {
      speed: effectiveSpeed,
      direction: enemy._direction,
    })
    this._states.set(enemy.id, next)
    enemy.x = next.x
    enemy.y = next.y
    enemy._pathX = next.x
  }

  private _applyPostAdvance(enemy: Enemy, game: Game): void {
    enemy.isStealthed = enemy.stealthRanges.some(
      ([min, max]) => enemy.x >= min && enemy.x <= max,
    )

    const distToOrigin = distance(enemy.x, enemy.y, 0, 0)
    const reachedTarget =
      enemy._direction < 0
        ? enemy._pathX <= enemy._targetX
        : enemy._pathX >= enemy._targetX

    if (distToOrigin < 0.5 || reachedTarget) {
      enemy.alive = false
      enemy.active = false
      // Reaching origin damages the player (handled by EconomySystem) and
      // the enemy disappears. Splitting only happens on combat death —
      // otherwise children would spawn next to the origin and immediately
      // deal more damage on their way out.
      game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, enemy)
    }
  }
}
