import { Events, GamePhase, GRID_MIN_X, GRID_MAX_X, GRID_MIN_Y, GRID_MAX_Y, UNIT_PX } from '@/data/constants'
import { distance } from '@/math/MathUtils'
import { shouldSplit, spawnChildren } from '@/domain/combat/SplitPolicy'
import type { Game } from '@/engine/Game'
import type { Enemy } from '@/entities/types'

const PROJECTILE_MAX_AGE = 5

export class CombatSystem {
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.WAVE_START, () => {
        for (const tower of game.towers) tower.cooldownTimer = 0
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
  }

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    this._tickDoT(dt, game)
    this._tickProjectiles(dt, game)
  }

  private _tickDoT(dt: number, game: Game): void {
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue
      if (enemy.dotTimer > 0) {
        enemy.dotTimer -= dt
        const dotDmg = enemy.dotDamage * dt * game.state.enemyVulnerability
        if (enemy.shield > 0) {
          const absorbed = Math.min(enemy.shield, dotDmg)
          enemy.shield -= absorbed
          enemy.hp -= dotDmg - absorbed
        } else {
          enemy.hp -= dotDmg
        }
        if (enemy.hp <= 0) {
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
        if (enemy.dotTimer <= 0) {
          enemy.dotDamage = 0
        }
      }
      if (enemy.slowTimer > 0) {
        enemy.slowTimer -= dt
        if (enemy.slowTimer <= 0) {
          enemy.slowTimer = 0
        }
      }
      const baseMul = 1 + enemy.speedBoost
      if (enemy.slowFactor > 0) {
        enemy.speedMultiplier = baseMul * (1 - enemy.slowFactor)
        if (enemy.slowTimer <= 0) {
          enemy.slowFactor = 0
        }
      } else {
        enemy.speedMultiplier = baseMul
      }
      enemy.speedBoost = 0
    }
  }

  private _tickProjectiles(dt: number, game: Game): void {
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
      const proj = game.projectiles[i]
      proj.x += proj.vx * dt
      proj.y += proj.vy * dt
      proj.age += dt

      if (proj.x < GRID_MIN_X - 2 || proj.x > GRID_MAX_X + 5 ||
          proj.y < GRID_MIN_Y - 3 || proj.y > GRID_MAX_Y + 2) {
        proj.active = false
      }

      if (proj.active && proj.age >= PROJECTILE_MAX_AGE) {
        proj.active = false
      }

      if (proj.active) {
        for (const enemy of [...game.enemies]) {
          if (!enemy.alive) continue
          const hitRadius = Math.max(0.5, enemy.size / 2 / UNIT_PX) + 3 / UNIT_PX
          if (distance(proj.x, proj.y, enemy.x, enemy.y) < hitRadius) {
            this._dealDamage(enemy, proj.damage, game)
            proj.active = false
            break
          }
        }
      }

      if (!proj.active) game.projectiles.splice(i, 1)
    }
  }

  private _dealDamage(enemy: Enemy, amount: number, game: Game): void {
    if (!enemy.alive) return

    let remaining = amount * game.state.enemyVulnerability
    if (enemy.shield > 0) {
      const absorbed = Math.min(enemy.shield, remaining)
      enemy.shield -= absorbed
      remaining -= absorbed
    }

    if (remaining > 0) {
      enemy.hp -= remaining
    }

    if (enemy.hp <= 0) {
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
  }

  render(_renderer: unknown, _game: Game): void {}
}
