import { Events, GamePhase, TowerType } from '@/data/constants'
import { distance } from '@/math/MathUtils'
import { applyDamage } from '@/domain/combat/SplitPolicy'
import { interceptPoint, radarProjectileSpeed, selectRadarTargets, radarTargetCount, isAngleInArc, arcSpan, relAngle, normalizeTwoPi } from '@/domain/combat/RadarTargeting'
import { effectiveCooldown } from '@/entities/tower-stats'
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
  // Per-tower sweep direction (+1 / −1) used only in arc-restrict mode, where
  // the needle oscillates like a windshield wiper inside [arcStart, arcEnd]
  // instead of circling the full 360°.
  private _sweepDirs = new Map<string, number>()
  // Per-tower set of enemy ids currently inside the needle's detection band.
  // RADAR_A deals one discrete "ping" when an enemy first enters the band
  // (rising edge), not every frame — so sweep speed scales hit rate.
  private _inBand = new Map<string, Set<string>>()
  // Per-tower countdown (seconds to next pulse) for the degenerate narrow-arc
  // fallback in _pulseNarrowArc, used when the restricted sector is narrower
  // than the detection band and the rising-edge model can no longer fire.
  private _pulseTimers = new Map<string, number>()
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
        // Re-seed the needle so a freshly restricted sweep starts on the arc's
        // edge rather than wherever the full-circle pass had left it. Clearing
        // _inBand also resets the rising-edge memory; this is safe only because
        // the arc panel is BUILD-only (no live enemies), so the next-tick
        // re-ping it would otherwise cause cannot land during a wave. If the
        // panel is ever exposed during WAVE, gate the damage path accordingly.
        this._sweepAngles.delete(towerId)
        this._sweepDirs.delete(towerId)
        this._inBand.delete(towerId)
        this._pulseTimers.delete(towerId)
      }),
      game.eventBus.on(Events.TOWER_TARGETING_CHANGED, ({ towerId, mode }: { towerId: string; mode: TargetingMode }) => {
        const tower = game.towers.find((t) => t.id === towerId)
        if (!tower) return
        tower.targetingMode = mode
      }),
      // Drop per-tower sweep state when a tower is sold so the maps don't
      // accumulate stale entries until the next LEVEL_START. A refund is the
      // only runtime path that removes a tower from game.towers
      // (TowerUpgradeSystem splices it and emits this); the declared
      // TOWER_REMOVED event has no emitter, so listening to it would be a
      // silent no-op.
      game.eventBus.on(Events.TOWER_REFUND_RESULT, ({ success, towerId }) => {
        if (!success || !towerId) return
        this._sweepAngles.delete(towerId)
        this._sweepDirs.delete(towerId)
        this._inBand.delete(towerId)
        this._pulseTimers.delete(towerId)
      }),
      game.eventBus.on(Events.LEVEL_START, () => {
        this._sweepAngles.clear()
        this._sweepDirs.clear()
        this._inBand.clear()
        this._pulseTimers.clear()
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
    this._sweepAngles.clear()
    this._sweepDirs.clear()
    this._inBand.clear()
    this._pulseTimers.clear()
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
    const upgradeSweep = tower.upgradeExtras?.['sweepSpeed'] ?? 0
    const sweepSpeed = 2.0 * (1 + (tower.talentMods['sweep_speed'] ?? 0) + upgradeSweep)
    const restricted = tower.arcRestrict ?? false
    const arcStart = tower.arcStart ?? 0
    const arcEnd = tower.arcEnd ?? Math.PI / 2

    const angle = this._advanceNeedle(tower, sweepSpeed * dt, restricted, arcStart, arcEnd)
    this._sweepAngles.set(tower.id, angle)
    // Mirror onto the entity so projectTowerScene / RadarRangeRenderer can
    // surface it without reaching into this system's private Map. In restrict
    // mode this value stays within [arcStart, arcEnd], so the painted needle
    // never crosses the sector walls.
    tower.sweepAngle = angle

    const range = tower.effectiveRange
    // Phase 7 (Q14): `aoe_width` talent adds to the sweep arc half-width in
    // radians. Additive on top of the upgrade extra so both routes contribute.
    const aoeWidth = 0.5
      + (tower.upgradeExtras?.['aoeWidth'] ?? 0)
      + (tower.talentMods['aoe_width'] ?? 0)

    // Degenerate-arc guard: when restricted to a sector narrower than the
    // detection band itself (span < 2*aoeWidth), the band blankets the whole
    // wedge, so an enemy inside it never crosses the band's edge — the
    // rising-edge model below would ping it exactly once and then fall silent.
    // Switch to a periodic pulse whose cadence equals the time the needle
    // takes to sweep one band-width (2*aoeWidth / sweepSpeed). That rate is
    // continuous with the wider-arc wiper at the threshold, stays bounded as
    // the arc shrinks (no per-tick ping explosion), and still scales with
    // sweep speed so the talent/upgrade keeps paying off. The needle is still
    // advanced above so the renderer animates the wiper inside the wedge.
    if (restricted && arcSpan(arcStart, arcEnd) < 2 * aoeWidth) {
      this._pulseNarrowArc(tower, dt, game, range, sweepSpeed, aoeWidth)
      return
    }

    // Discrete "ping" per sweep pass. The needle deals one hit when an enemy
    // FIRST enters its band (rising edge), not every frame the band overlaps.
    // A stationary enemy is therefore struck once per revolution, so faster
    // sweep speed = more passes = more damage (the upgrade/talent now scales
    // DPS, which the old continuous dt-tick model left flat). It also keeps
    // single-target output low and crowd-clear wide: every enemy the band
    // crosses on a pass is pinged, with no per-target accumulation.
    const prevBand = this._inBand.get(tower.id)
    const nowBand = new Set<string>()
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue
      const d = distance(tower.x, tower.y, enemy.x, enemy.y)
      if (d > range) continue
      if (restricted && !this._isInArc(tower, enemy)) continue
      // allow-non-deterministic-math: visual/geometric arc check, not in RNG draw schedule (follow-up: MovementSystem audit per construction plan §8).
      const enemyAngle = Math.atan2(enemy.y - tower.y, enemy.x - tower.x)
      const angleDiff = Math.abs(normalizeAngle(enemyAngle - angle))
      if (angleDiff < aoeWidth) {
        nowBand.add(enemy.id)
        if (!prevBand?.has(enemy.id)) {
          // Focus-sector bonus keyed on the ENEMY's angle, not the sweep
          // needle's — same basis as RADAR_B/C (_getArcBonusForTarget), so all
          // three radars agree on what "inside the arc" means.
          const arcBonus = this._getArcBonus(tower, enemyAngle)
          // 'towerHit' (discrete) rather than 'towerTick': each ping is a
          // whole, undivided hit, so it routes through the same defensive
          // pipeline (cap / armor) and damage-feedback popup as a projectile.
          applyDamage(enemy, tower.effectiveDamage * arcBonus, game, 'towerHit')
        }
      }
    }
    this._inBand.set(tower.id, nowBand)
  }

  // Advance the sweep needle by `step` radians and return its new angle in
  // [0, 2π). Free mode circles the full 360°; restrict mode oscillates inside
  // the configured sector so neither the needle nor its detection band ever
  // leaves [arcStart, arcEnd].
  private _advanceNeedle(
    tower: Tower,
    step: number,
    restricted: boolean,
    arcStart: number,
    arcEnd: number,
  ): number {
    let angle = this._sweepAngles.get(tower.id)
    if (angle === undefined) angle = restricted ? arcStart : 0

    if (!restricted) {
      angle += step
      return normalizeTwoPi(angle)
    }

    const span = arcSpan(arcStart, arcEnd)
    let dir = this._sweepDirs.get(tower.id) ?? 1
    // Phase = CCW distance of the needle from the arc start, clamped into the
    // span (snaps an out-of-arc needle onto the near wall on the first tick).
    let s = relAngle(angle, arcStart)
    if (s > span) s = span
    s += dir * step
    if (s >= span) { s = span; dir = -1 }
    else if (s <= 0) { s = 0; dir = 1 }
    this._sweepDirs.set(tower.id, dir)
    return normalizeTwoPi(arcStart + s)
  }

  // Periodic-pulse fallback for a restricted sector narrower than the
  // detection band (see the degenerate-arc guard in _updateSweep). Pings every
  // in-arc, in-range enemy on a fixed cadence instead of on band rising-edges,
  // because the band can no longer clear. Deterministic (timer only, no RNG).
  private _pulseNarrowArc(
    tower: Tower,
    dt: number,
    game: Game,
    range: number,
    sweepSpeed: number,
    aoeWidth: number,
  ): void {
    const interval = (2 * aoeWidth) / sweepSpeed
    let timer = (this._pulseTimers.get(tower.id) ?? 0) - dt
    if (timer > 0) {
      this._pulseTimers.set(tower.id, timer)
      return
    }
    // Carry the overshoot so the average cadence stays exact across frames.
    timer += interval
    this._pulseTimers.set(tower.id, timer)

    for (const enemy of game.enemies) {
      if (!enemy.alive) continue
      if (distance(tower.x, tower.y, enemy.x, enemy.y) > range) continue
      // allow-non-deterministic-math: visual/geometric arc check, not in RNG draw schedule.
      const enemyAngle = Math.atan2(enemy.y - tower.y, enemy.x - tower.x)
      if (!isAngleInArc(enemyAngle, tower.arcStart ?? 0, tower.arcEnd ?? Math.PI / 2)) continue
      // Restrict mode ⇒ every pinged enemy is in-arc, so the focus-sector
      // bonus always applies — same basis (_getArcBonus on the enemy angle) as
      // the wiper path, so the two damage models agree.
      const arcBonus = this._getArcBonus(tower, enemyAngle)
      applyDamage(enemy, tower.effectiveDamage * arcBonus, game, 'towerHit')
    }
  }

  private _updateRapid(tower: Tower, dt: number, game: Game): void {
    tower.cooldownTimer -= dt
    if (tower.cooldownTimer > 0) return
    tower.cooldownTimer = effectiveCooldown(tower, game.state)

    const count = radarTargetCount(tower)
    // Phase 7 (Q14): `crit_chance` talent on RADAR_B. Crits fixed at 2× — the
    // tower's identity is "rapid fire," so the variance comes from chance
    // rather than crit magnitude (that's RADAR_C's lane). Uses game.rng so
    // recorded runs replay byte-identical (Backlog §24 determinism contract).
    const critChance = Math.min(1, tower.talentMods['crit_chance'] ?? 0)
    const targets = selectRadarTargets(tower, game.enemies, count)
    for (const target of targets) {
      const arcBonus = this._getArcBonusForTarget(tower, target)
      const isCrit = critChance > 0 && game.rng() < critChance
      const critMult = isCrit ? 2.0 : 1.0
      this._fireProjectile(tower, target, tower.effectiveDamage * arcBonus * critMult, game)
    }
  }

  private _updateSniper(tower: Tower, dt: number, game: Game): void {
    tower.cooldownTimer -= dt
    if (tower.cooldownTimer > 0) return
    tower.cooldownTimer = effectiveCooldown(tower, game.state)

    const count = radarTargetCount(tower)
    const critChance = Math.min(1, tower.upgradeExtras?.['critChance'] ?? 0)
    // Phase 7 (Q14): `crit_damage` talent stacks additively with the upgrade
    // extra. Final crit multiplier = 2.0 + (upgrade) + (talent).
    const critDmgBonus = (tower.upgradeExtras?.['critDamage'] ?? 0)
      + (tower.talentMods['crit_damage'] ?? 0)
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
