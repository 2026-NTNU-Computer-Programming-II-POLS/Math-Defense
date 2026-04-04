/**
 * MovementSystem — 敵人沿數學路徑移動
 * 從舊 Enemy.update() 提取，Entity 不再需要 update() 方法。
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

    // 弧長修正：讓速度沿曲線而非沿 x 軸
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

    // 更新隱身狀態
    enemy.isStealthed = enemy.stealthRanges.some(
      ([min, max]) => enemy.x >= min && enemy.x <= max,
    )

    // 到達原點判定
    const distToOrigin = distance(enemy.x, enemy.y, 0, 0)
    const reachedTarget =
      enemy._direction < 0
        ? enemy._pathX <= enemy._targetX
        : enemy._pathX >= enemy._targetX

    if (distToOrigin < 0.5 || reachedTarget) {
      enemy.alive = false
      enemy.active = false
      game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, enemy)
    }
  }

  render(_renderer: unknown, _game: Game): void {}
}
