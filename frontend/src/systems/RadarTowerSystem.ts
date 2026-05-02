import { Events, GamePhase, TowerType } from '@/data/constants'
import { distance } from '@/math/MathUtils'
import { applyDamage } from '@/domain/combat/SplitPolicy'
import type { Game } from '@/engine/Game'
import type { Tower, Enemy, Projectile } from '@/entities/types'

let _projId = 0

function makeProjectile(
  x: number, y: number,
  vx: number, vy: number,
  damage: number, color: string, ownerId: string,
): Projectile {
  return { id: `rproj_${++_projId}`, x, y, vx, vy, damage, color, active: true, ownerId, age: 0 }
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
    const arcBonus = this._getArcBonus(tower, angle)

    for (const enemy of game.enemies) {
      if (!enemy.alive) continue
      const d = distance(tower.x, tower.y, enemy.x, enemy.y)
      if (d > range) continue
      if (tower.arcRestrict && !this._isInArc(tower, enemy)) continue
      const enemyAngle = Math.atan2(enemy.y - tower.y, enemy.x - tower.x)
      const angleDiff = Math.abs(normalizeAngle(enemyAngle - angle))
      if (angleDiff < aoeWidth) {
        this._dealDamage(enemy, tower.effectiveDamage * arcBonus * dt, game)
      }
    }
  }

  private _updateRapid(tower: Tower, dt: number, game: Game): void {
    tower.cooldownTimer -= dt
    if (tower.cooldownTimer > 0) return
    tower.cooldownTimer = tower.cooldown

    const count = 1 + Math.floor(tower.talentMods['target_count'] ?? 0) + Math.floor(tower.upgradeExtras?.['targetCount'] ?? 0)
    const targets = this._findTargets(tower, game, count)
    for (const target of targets) {
      const arcBonus = this._getArcBonusForTarget(tower, target)
      this._fireProjectile(tower, target, tower.effectiveDamage * arcBonus, game)
    }
  }

  private _updateSniper(tower: Tower, dt: number, game: Game): void {
    tower.cooldownTimer -= dt
    if (tower.cooldownTimer > 0) return
    tower.cooldownTimer = tower.cooldown

    const count = 1 + Math.floor(tower.talentMods['target_count'] ?? 0) + Math.floor(tower.upgradeExtras?.['targetCount'] ?? 0)
    const critChance = Math.min(1, tower.upgradeExtras?.['critChance'] ?? 0)
    const critDmgBonus = tower.upgradeExtras?.['critDamage'] ?? 0
    const targets = this._findTargets(tower, game, count)
    for (const target of targets) {
      const arcBonus = this._getArcBonusForTarget(tower, target)
      const isCrit = critChance > 0 && Math.random() < critChance
      const critMult = isCrit ? 2.0 + critDmgBonus : 1.0
      this._fireProjectile(tower, target, tower.effectiveDamage * arcBonus * critMult, game)
    }
  }

  private _findTargets(tower: Tower, game: Game, count: number): Enemy[] {
    const range = tower.effectiveRange
    const candidates: { enemy: Enemy; dist: number }[] = []
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue
      const d = distance(tower.x, tower.y, enemy.x, enemy.y)
      if (d > range) continue
      if (tower.arcRestrict && !this._isInArc(tower, enemy)) continue
      candidates.push({ enemy, dist: d })
    }
    candidates.sort((a, b) => a.dist - b.dist)
    return candidates.slice(0, count).map(c => c.enemy)
  }

  private _fireProjectile(tower: Tower, target: Enemy, damage: number, game: Game): void {
    const dx = target.x - tower.x
    const dy = target.y - tower.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1e-3) return
    const speed = tower.type === TowerType.RADAR_C ? 8 : 15
    game.projectiles.push(makeProjectile(
      tower.x, tower.y,
      (dx / len) * speed, (dy / len) * speed,
      damage, tower.color, tower.id,
    ))
  }

  private _getArcBonus(tower: Tower, angle: number): number {
    const start = tower.arcStart ?? 0
    const end = tower.arcEnd ?? Math.PI / 2
    if (isAngleInArc(angle, start, end)) return 1.5
    return 1.0
  }

  private _getArcBonusForTarget(tower: Tower, enemy: Enemy): number {
    const angle = Math.atan2(enemy.y - tower.y, enemy.x - tower.x)
    return this._getArcBonus(tower, angle)
  }

  private _isInArc(tower: Tower, enemy: Enemy): boolean {
    const angle = Math.atan2(enemy.y - tower.y, enemy.x - tower.x)
    return isAngleInArc(angle, tower.arcStart ?? 0, tower.arcEnd ?? Math.PI / 2)
  }

  private _dealDamage(enemy: Enemy, amount: number, game: Game): void {
    applyDamage(enemy, amount, game)
  }

  render(): void {}
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

function isAngleInArc(angle: number, start: number, end: number): boolean {
  let a = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  let s = ((start % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  let e = ((end % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  if (s <= e) return a >= s && a <= e
  return a >= s || a <= e
}
