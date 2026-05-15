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
import type { SegmentedPath, PathSegmentRuntime } from '@/domain/path/segmented-path'
import type { Game, MovementLevelContext } from '@/engine/Game'
import type { Enemy } from '@/entities/types'

const ORIGIN = Object.freeze({ x: 0, y: 0 })

export class MovementSystem {
  private _states = new Map<string, MovementState>()
  private _assignedPaths = new Map<string, SegmentedPath>()
  private _activeSegmentIds = new Map<string, string>()

  /**
   * Optional sink for the lead-enemy x value. The composable injects
   * `gameStore.setLeadEnemyX` here so the system never imports Pinia
   * directly — same pattern as `TowerPlacementSystem`'s selected-tower
   * callback.
   */
  setLeadEnemyX?: (x: number) => void

  registerEnemyPath(enemyId: string, path: SegmentedPath): void {
    this._assignedPaths.set(enemyId, path)
  }

  init(_game: Game): void {}

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    const ctx: MovementLevelContext | null = game.levelContext

    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const enemy = game.enemies[i]
      if (!enemy.alive) {
        this._states.delete(enemy.id)
        this._assignedPaths.delete(enemy.id)
        this._activeSegmentIds.delete(enemy.id)
        game.enemies.splice(i, 1)
        continue
      }

      // Compute speedMultiplier from live fields; consume speedBoost; clear slowFactor
      // once consumed if the timer has run out (preserving the original consume-then-clear order).
      const baseMul = 1 + enemy.speedBoost
      enemy.speedMultiplier = enemy.slowFactor > 0 ? baseMul * (1 - enemy.slowFactor) : baseMul
      enemy.speedBoost = 0
      if (enemy.slowFactor > 0 && enemy.slowTimer <= 0) {
        enemy.slowFactor = 0
      }

      if (ctx) {
        this._advanceSegmented(enemy, dt, game, this._assignedPaths.get(enemy.id) ?? ctx.path)
      }

      this._applyPostAdvance(enemy, game)

      if (!enemy.alive) {
        this._states.delete(enemy.id)
        this._assignedPaths.delete(enemy.id)
        this._activeSegmentIds.delete(enemy.id)
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



  private _advanceSegmented(
    enemy: Enemy,
    dt: number,
    game: Game,
    path: SegmentedPath,
  ): void {
    const prev = this._states.get(enemy.id) ?? { x: enemy.x, y: enemy.y, t: 0 }
    const lockedId = this._activeSegmentIds.get(enemy.id)

    // State-machine segment resolution.
    //
    // findSegmentAt uses a right-hand boundary convention (spec §14.1): at x=v
    // shared by three segments [_, v] | [v, v] (vertical) | [v, _], it always
    // returns the rightmost one.  This means vertical segments are invisible to
    // findSegmentAt — we must advance by index instead.
    //
    // Strategy:
    //   - If locked to a segment, decide whether to stay or advance to the
    //     adjacent segment in the direction of travel (lockedIdx ± 1).
    //   - Vertical: stay while t < 1; advance when t >= 1.
    //   - X-driven: stay while enemy.x is still in xRange; advance when it exits.
    //   - First tick (no lockedId): bootstrap via findSegmentAt.
    let segment: PathSegmentRuntime | null = null

    if (lockedId !== undefined) {
      const lockedIdx = path.segments.findIndex(s => s.id === lockedId)
      const locked = lockedIdx >= 0 ? (path.segments[lockedIdx] ?? null) : null

      if (locked !== null) {
        const travelStep = enemy._direction < 0 ? -1 : 1

        if (locked.kind === 'vertical') {
          segment = prev.t < 1
            ? locked
            : (path.segments[lockedIdx + travelStep] ?? null)
        } else {
          const [lo, hi] = locked.xRange
          segment = (enemy.x >= lo && enemy.x <= hi)
            ? locked
            : (path.segments[lockedIdx + travelStep] ?? null)
        }
      }
    }

    // First tick or locked segment not found in this path.
    if (segment === null) segment = path.findSegmentAt(enemy.x)

    if (!segment) {
      // Distinguish "reached goal" from "genuinely off-path" so the EconomySystem
      // receives ENEMY_REACHED_ORIGIN (deals HP damage) rather than ENEMY_KILLED
      // (awards kill credit) when the enemy exits the last segment naturally.
      const reachedTarget =
        enemy._direction < 0
          ? enemy._pathX <= enemy._targetX
          : enemy._pathX >= enemy._targetX
      if (reachedTarget && !enemy._emittedReachedOrigin) {
        enemy._emittedReachedOrigin = true
        enemy.alive = false
        enemy.active = false
        game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, enemy)
      } else if (enemy.alive) {
        console.warn(
          `[MovementSystem] Enemy ${enemy.id} at x=${enemy.x} outside path [${path.targetX}, ${path.startX}]; marking dead.`,
        )
        enemy.alive = false
        enemy.active = false
        game.eventBus.emit(Events.ENEMY_KILLED, enemy)
      }
      return
    }

    this._activeSegmentIds.set(enemy.id, segment.id)
    const strategy = getStrategy(segment.kind)
    // Reset t when entering a new segment so time-driven strategies start fresh.
    const prevState = segment.id !== lockedId ? { ...prev, t: 0 } : prev
    const effectiveSpeed =
      enemy.speed * enemy.speedMultiplier * game.state.enemySpeedMultiplier
    const next = strategy.advance(prevState, segment, dt, {
      speed: effectiveSpeed,
      direction: enemy._direction,
    })
    this._states.set(enemy.id, next)
    enemy.x = next.x
    enemy.y = next.y
    enemy._pathX = next.x
  }

  private _applyPostAdvance(enemy: Enemy, game: Game): void {
    // Dead enemies (e.g. an out-of-path enemy just marked dead in
    // `_advanceSegmented`) must not re-emit ENEMY_REACHED_ORIGIN or damage
    // the player — the outer update loop cleans them up next.
    if (!enemy.alive) return
    // Goal = level endpoint P* (V2) or origin (V1 fallback). MovementSystem
    // reads `endpoint` structurally so it does not import context internals.
    const ctx = game.levelContext
    const goal = (ctx && 'endpoint' in ctx) ? (ctx as { endpoint: { x: number; y: number } }).endpoint : ORIGIN
    const distToGoal = distance(enemy.x, enemy.y, goal.x, goal.y)
    const reachedTarget =
      enemy._direction < 0
        ? enemy._pathX <= enemy._targetX
        : enemy._pathX >= enemy._targetX

    if ((distToGoal < 0.5 || reachedTarget) && !enemy._emittedReachedOrigin) {
      enemy._emittedReachedOrigin = true
      enemy.alive = false
      enemy.active = false
      // Reaching the goal damages the player (handled by EconomySystem) and
      // the enemy disappears. Splitting only happens on combat death —
      // otherwise children would spawn next to the goal and immediately
      // deal more damage on their way out.
      game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, enemy)
    }
  }
}
