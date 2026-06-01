import { Events, GamePhase, GRID_MIN_X, GRID_MAX_X, GRID_MIN_Y, GRID_MAX_Y, UNIT_PX, ANIM, EnemyType } from '@/data/constants'
import { distance } from '@/math/MathUtils'
import { applyDamage } from '@/domain/combat/SplitPolicy'
import type { Game } from '@/engine/Game'
import type { Enemy } from '@/entities/types'

const PROJECTILE_MAX_AGE = 5
// Cap history length so it never grows unbounded. Sized for the canonical
// 60-fps tick rate so a full `ANIM.PROJECTILE_TRAIL`-second tail is preserved
// without dropping samples (frame-rate aware trimming via age also runs).
const PROJECTILE_HISTORY_MAX = Math.ceil(ANIM.PROJECTILE_TRAIL * 60) + 2
// Screen-shake duration for an origin breach. Kept equal to the endpoint
// burst FX lifetime (EndpointFXSystem.HIT_FX_MAX_AGE) so the shake and the
// star-fragment burst settle together. Tune alongside that constant.
const ENDPOINT_BREACH_SHAKE_DURATION = 1.1

export class CombatSystem {
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.WAVE_START, () => {
        for (const tower of game.towers) tower.cooldownTimer = 0
      }),
      // Visual Redesign Phase 1: trigger a one-shot screen shake when an
      // enemy reaches the goal. Origin breaches are the canonical "the
      // player is losing" cue, so the shake is large and slow. Duration is
      // inlined (not ANIM.SHAKE_BREACH) so it stays in sync with the endpoint
      // burst lifetime (EndpointFXSystem HIT_FX_MAX_AGE) without lengthening
      // the shared boss-death shake that also reads ANIM.SHAKE_BREACH.
      game.eventBus.on(Events.ENEMY_REACHED_ORIGIN, () => {
        game.shake.shake(6, ENDPOINT_BREACH_SHAKE_DURATION)
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
  }

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    // Age the tower muzzle-flash window. The firing system writes 0 onto
    // `firingFlashAge` when it emits TOWER_FIRED; we monotonically grow
    // the value here and rely on the renderer's clamp to fade it out. Kept
    // adjacent to projectile ticking because both are combat-frame chores.
    for (const tower of game.towers) {
      if (tower.firingFlashAge !== undefined && tower.firingFlashAge < ANIM.TOWER_FIRE_FLASH) {
        tower.firingFlashAge += dt
      }
    }

    this._tickDoT(dt, game)
    this._tickProjectiles(dt, game)
  }

  private _tickDoT(dt: number, game: Game): void {
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue
      if (enemy.dotTimer > 0) {
        enemy.dotTimer -= dt
        applyDamage(enemy, enemy.dotDamage * dt, game, 'dot')
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
    }
  }

  private _tickProjectiles(dt: number, game: Game): void {
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
      const proj = game.projectiles[i]
      // Sample the trail BEFORE advancing so the head of `history` is the
      // previous frame's position and the projectile's live (x, y) reads as
      // the tip. The renderer draws history-to-tip, fading toward older.
      proj.history.push({ x: proj.x, y: proj.y })
      if (proj.history.length > PROJECTILE_HISTORY_MAX) proj.history.shift()

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
    // Projectiles (Radar B/C) are discrete tower hits.
    const wasBoss = enemy.type === EnemyType.BOSS_A || enemy.type === EnemyType.BOSS_B
    applyDamage(enemy, amount, game, 'towerHit')
    // Visual Redesign Phase 1: bosses absorbing a discrete hit shake the
    // screen. Gated on the pre-hit boss type so a kill still triggers the
    // shake even though the enemy is now `alive === false`. Continuous
    // (towerTick / dot) sources are deliberately silent — per-frame shake
    // would be seizure-inducing on Boss-A Matrix-laser sustains.
    if (wasBoss) {
      game.shake.shake(2.5, ANIM.SHAKE_HIT)
    }
  }

}
