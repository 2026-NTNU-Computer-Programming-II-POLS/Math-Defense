/**
 * MovementSystem — enemies move along the mathematical path
 * Extracted from the old Enemy.update(); entities no longer need an update() method.
 */
import { Events, GamePhase } from '@/data/constants'
import { distance } from '@/math/MathUtils'
import type { Game } from '@/engine/Game'
import type { Enemy } from '@/entities/types'

export class MovementSystem {
  init(_game: Game): void {}

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const enemy = game.enemies[i]
      if (!enemy.alive) {
        game.enemies.splice(i, 1)
        continue
      }

      this._moveEnemy(enemy, dt, game)

      if (!enemy.alive) {
        game.enemies.splice(i, 1)
      }
    }
  }

  private _moveEnemy(enemy: Enemy, dt: number, game: Game): void {
    const effectiveSpeed = enemy.speed * enemy.speedMultiplier * game.state.enemySpeedMultiplier

    // arc-length correction: move at constant speed along the curve, not along the x-axis
    const dx = effectiveSpeed * dt * enemy._direction
    const currentY = enemy.pathFn(enemy._pathX)
    const nextX = enemy._pathX + dx
    const nextY = enemy.pathFn(nextX)
    const arcLen = distance(enemy._pathX, currentY, nextX, nextY)

    if (arcLen > 0) {
      const scale = (effectiveSpeed * dt) / arcLen
      enemy._pathX += dx * Math.min(scale, 2)
    } else {
      enemy._pathX += dx
    }

    enemy.x = enemy._pathX
    enemy.y = enemy.pathFn(enemy._pathX)

    // update stealth state
    enemy.isStealthed = enemy.stealthRanges.some(
      ([min, max]) => enemy.x >= min && enemy.x <= max,
    )

    // check if enemy has reached the origin
    const distToOrigin = distance(enemy.x, enemy.y, 0, 0)
    const reachedTarget =
      enemy._direction < 0
        ? enemy._pathX <= enemy._targetX
        : enemy._pathX >= enemy._targetX

    if (distToOrigin < 0.5 || reachedTarget) {
      enemy.alive = false
      enemy.active = false

      // Reaching origin damages the player (handled by EconomySystem) and the enemy disappears.
      // Splitting only happens on combat death — otherwise children would spawn next to the
      // origin and immediately deal more damage on their way out.
      game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, enemy)
    }
  }

  render(_renderer: unknown, _game: Game): void {}
}
