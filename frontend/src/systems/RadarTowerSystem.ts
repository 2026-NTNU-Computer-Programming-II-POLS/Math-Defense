import { Events, GamePhase, TowerType } from '@/data/constants'
import { distance } from '@/math/MathUtils'
import { applyDamage } from '@/domain/combat/SplitPolicy'
import { interceptPoint, radarProjectileSpeed, selectRadarTargets, radarTargetCount, isAngleInArc } from '@/domain/combat/RadarTargeting'
import type { Game } from '@/engine/Game'
import type { Tower, Enemy, Projectile, TargetingMode } from '@/entities/types'

let _projId = 0

function makeProjectile(
  x: number, y: number,
  vx: number, vy: number,
  damage: number, color: string, ownerId: string,
): Projectile {
  return { id: `rproj_${++_projId}`, x, y, vx, vy, damage, color, active: true, ownerId, age: 0, history: [] }
}

export class RadarTowerSystem {
  private _sweepAngles = new Map<string, number>()
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.RADAR_ARC_CHANGED, ({ towerId, arcStart, arcEnd, restrict }) => {
        const tower = game.towers.find((t) => t.id === towerId)
        if (!tower) return
        tower.arcStart = arcStart
        tower.arcEnd = arcEnd
        tower.arcRestrict = restrict
        tower.configured = true
      }),
      game.eventBus.on(Events.TOWER_TARGETING_CHANGED, ({ towerId, mode }: { towerId: string; mode: TargetingMode }) => {
        const tower = game.towers.find((t) => t.id === towerId)
        if (!tower) return
        tower.targetingMode = mode
      }),
      game.eventBus.on(Events.LEVEL_START, () => {
        this._sweepAngles.clear()
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
    this._sweepAngles.clear()
  }

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    for (const tower of game.towers) {
      if (tower.disabled || !tower.configured) continue
      switch (tower.type) {
        case TowerType.RADAR_A: this._updateSweep(tower, dt, game); break
        case TowerType.RADAR_B: this._updateRapid(tower, dt, game); break
        case TowerType.RADAR_C: this._updateSniper(tower, dt, game); break
      }
    }
  }

  private _updateSweep(tower: Tower, dt: number, game: Game): void {
    let angle = this._sweepAngles.get(tower.id) ?? 0
    const upgradeSweep = tower.upgradeExtras?.['sweepSpeed'] ?? 0
    const sweepSpeed = 2.0 * (1 + (tower.talentMods['sweep_speed'] ?? 0) + upgradeSweep)
    angle += sweepSpeed * dt
    if (angle > 2 * Math.PI) angle -= 2 * Math.PI
    this._sweepAngles.set(tower.id, angle)

    const range = tower.effectiveRange
    const aoeWidth = 0.5 + (tower.upgradeExtras?.['aoeWidth'] ?? 0)

    for (const enemy of game.enemies) {
      if (!enemy.alive) continue
      const d = distance(tower.x, tower.y, enemy.x, enemy.y)
      if (d > range) continue
      if (tower.arcRestrict && !this._isInArc(tower, enemy)) continue
      // allow-non-deterministic-math: visual/geometric arc check, not in RNG draw schedule (follow-up: MovementSystem audit per construction plan §8).
      const enemyAngle = Math.atan2(enemy.y - tower.y, enemy.x - tower.x)
      const angleDiff = Math.abs(normalizeAngle(enemyAngle - angle))
      if (angleDiff < aoeWidth) {
        // Focus-sector bonus keyed on the ENEMY's angle, not the sweep
        // needle's — same basis as RADAR_B/C (_getArcBonusForTarget), so all
        // three radars agree on what "inside the arc" means. Keying it on the
        // needle smeared the ×1.5 across the arc edge by ±aoeWidth.
        const arcBonus = this._getArcBonus(tower, enemyAngle)
        this._dealDamage(enemy, tower.effectiveDamage * arcBonus * dt, game)
      }
    }
  }

  private _updateRapid(tower: Tower, dt: number, game: Game): void {
    tower.cooldownTimer -= dt
    if (tower.cooldownTimer > 0) return
    tower.cooldownTimer = tower.cooldown

    const count = radarTargetCount(tower)
    const targets = selectRadarTargets(tower, game.enemies, count)
    for (const target of targets) {
      const arcBonus = this._getArcBonusForTarget(tower, target)
      this._fireProjectile(tower, target, tower.effectiveDamage * arcBonus, game)
    }
  }

  private _updateSniper(tower: Tower, dt: number, game: Game): void {
    tower.cooldownTimer -= dt
    if (tower.cooldownTimer > 0) return
    tower.cooldownTimer = tower.cooldown

    const count = radarTargetCount(tower)
    const critChance = Math.min(1, tower.upgradeExtras?.['critChance'] ?? 0)
    const critDmgBonus = tower.upgradeExtras?.['critDamage'] ?? 0
    const targets = selectRadarTargets(tower, game.enemies, count)
    for (const target of targets) {
      const arcBonus = this._getArcBonusForTarget(tower, target)
      // game.rng (seeded) so a recorded run replays with identical crit hits
      // (Backlog §24 determinism contract).
      const isCrit = critChance > 0 && game.rng() < critChance
      const critMult = isCrit ? 2.0 + critDmgBonus : 1.0
      this._fireProjectile(tower, target, tower.effectiveDamage * arcBonus * critMult, game)
    }
  }

  private _fireProjectile(tower: Tower, target: Enemy, damage: number, game: Game): void {
    const speed = radarProjectileSpeed(tower.type)
    // Lead-aim: both projectile direction and the RADAR_C dashed bore-sight
    // call interceptPoint with the same inputs, guaranteeing the aim line
    // and projectile cannot diverge at fire time.
    const aim = interceptPoint(tower.x, tower.y, target, speed)
    const dx = aim.x - tower.x
    const dy = aim.y - tower.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1e-3) return
    game.projectiles.push(makeProjectile(
      tower.x, tower.y,
      (dx / len) * speed, (dy / len) * speed,
      damage, tower.color, tower.id,
    ))
    // Visual Redesign Phase 1: arm muzzle flash. Same system that emits the
    // event owns the cosmetic state, so no extra subscriber is needed.
    tower.firingFlashAge = 0
    // Visual Redesign Phase 0: notify renderers that a tower fired. Consumed
    // by the muzzle-flash / projectile-trail renderers added in Phase 1.
    game.eventBus.emit(Events.TOWER_FIRED, {
      towerId: tower.id,
      x: tower.x,
      y: tower.y,
      type: tower.type,
    })
  }

  private _getArcBonus(tower: Tower, angle: number): number {
    const start = tower.arcStart ?? 0
    const end = tower.arcEnd ?? Math.PI / 2
    if (isAngleInArc(angle, start, end)) return 1.5
    return 1.0
  }

  private _getArcBonusForTarget(tower: Tower, enemy: Enemy): number {
    // allow-non-deterministic-math: visual/geometric arc check, not in RNG draw schedule (follow-up: MovementSystem audit per construction plan §8).
    const angle = Math.atan2(enemy.y - tower.y, enemy.x - tower.x)
    return this._getArcBonus(tower, angle)
  }

  private _isInArc(tower: Tower, enemy: Enemy): boolean {
    // allow-non-deterministic-math: visual/geometric arc check, not in RNG draw schedule (follow-up: MovementSystem audit per construction plan §8).
    const angle = Math.atan2(enemy.y - tower.y, enemy.x - tower.x)
    return isAngleInArc(angle, tower.arcStart ?? 0, tower.arcEnd ?? Math.PI / 2)
  }

  private _dealDamage(enemy: Enemy, amount: number, game: Game): void {
    // Radar A's sweep is continuous, dt-scaled damage.
    applyDamage(enemy, amount, game, 'towerTick')
  }

}

// Difference helper for RADAR_A's sweep band — maps an angle delta into
// (-π, π] so `Math.abs(diff) < aoeWidth` measures the true gap. Distinct from
// isAngleInArc (a [0, 2π) containment test); kept local because only the sweep
// uses it.
function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}
