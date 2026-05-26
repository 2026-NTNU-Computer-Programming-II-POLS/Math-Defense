/**
 * RADAR_A sweep — the focus-sector (×1.5) bonus must be decided by each
 * ENEMY's angle, not by where the sweep needle currently points. Keying it on
 * the needle smeared the bonus across the arc boundary by ±aoeWidth: an in-arc
 * enemy could be denied ×1.5 (needle not yet in the arc) and an out-of-arc
 * enemy could be over-credited. RADAR_B/C never had this — they already key on
 * the target's own angle (_getArcBonusForTarget). These tests pin RADAR_A to
 * that same contract, and cover the optional arcRestrict hard filter.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { RadarTowerSystem } from '../RadarTowerSystem'
import { GamePhase, TowerType } from '@/data/constants'
import { createMockGame, createMockTower, createMockEnemy } from './helpers'
import type { Enemy } from '@/entities/types'

// Place an enemy on a circle of radius `r` around a tower at the origin, so
// atan2(y, x) === theta exactly. hp is large enough that no sweep tick kills it.
function enemyAtAngle(theta: number, r = 3): Enemy {
  return createMockEnemy({
    x: r * Math.cos(theta),
    y: r * Math.sin(theta),
    hp: 1000,
    maxHp: 1000,
  })
}

const damageTaken = (e: Enemy) => e.maxHp - e.hp

describe('RadarTowerSystem — RADAR_A focus-sector bonus', () => {
  let game: ReturnType<typeof createMockGame>
  let system: RadarTowerSystem

  beforeEach(() => {
    game = createMockGame({ phase: GamePhase.WAVE })
    system = new RadarTowerSystem()
    system.init(game)
  })

  // Arc [1.0, 2.0] rad. The sweep needle starts at 0 and advances at the base
  // sweepSpeed of 2.0 rad/s, so a single update(dt) parks it at exactly 2.0*dt.
  function radarA() {
    return createMockTower({
      type: TowerType.RADAR_A, x: 0, y: 0,
      arcStart: 1.0, arcEnd: 2.0,
    })
  }

  it('credits ×1.5 by the enemy angle even when the needle sits inside the arc', () => {
    // update(0.5) → needle parked at 1.0 (the arc's start edge). Both enemies
    // fall within aoeWidth (0.5) of it, so both are struck this tick.
    const inArc = enemyAtAngle(1.3)   // inside [1.0, 2.0]
    const outArc = enemyAtAngle(0.7)  // outside
    game.towers.push(radarA())
    game.enemies.push(inArc, outArc)

    system.update(0.5, game)

    expect(damageTaken(outArc)).toBeGreaterThan(0)
    // Pre-fix the needle (1.0, in-arc) credited BOTH enemies ×1.5 → ratio 1.0.
    expect(damageTaken(inArc)).toBeCloseTo(damageTaken(outArc) * 1.5, 3)
  })

  it('credits ×1.5 by the enemy angle even when the needle sits outside the arc', () => {
    // update(0.35) → needle parked at 0.7, outside [1.0, 2.0].
    const inArc = enemyAtAngle(1.1)   // inside
    const outArc = enemyAtAngle(0.4)  // outside
    game.towers.push(radarA())
    game.enemies.push(inArc, outArc)

    system.update(0.35, game)

    expect(damageTaken(outArc)).toBeGreaterThan(0)
    // Pre-fix the needle (0.7, out-of-arc) denied BOTH enemies the bonus → 1.0.
    expect(damageTaken(inArc)).toBeCloseTo(damageTaken(outArc) * 1.5, 3)
  })

  it('arcRestrict skips enemies outside the arc entirely (hard filter)', () => {
    const tower = radarA()
    tower.arcRestrict = true
    const inArc = enemyAtAngle(1.3)
    const outArc = enemyAtAngle(0.7)
    game.towers.push(tower)
    game.enemies.push(inArc, outArc)

    system.update(0.5, game)

    expect(damageTaken(outArc)).toBe(0)
    expect(damageTaken(inArc)).toBeGreaterThan(0)
  })
})

// Phase 7 (Q14) — RADAR_A `aoe_width` advanced talent. The sweep band's
// half-width is the only gating value for whether an off-needle enemy is
// struck; the talent is additive on top of the upgrade extra so the two
// routes do not double-apply.
describe('RadarTowerSystem — RADAR_A aoe_width talent', () => {
  let game: ReturnType<typeof createMockGame>
  let system: RadarTowerSystem

  beforeEach(() => {
    game = createMockGame({ phase: GamePhase.WAVE })
    system = new RadarTowerSystem()
    system.init(game)
  })

  it('widens the sweep band so a previously-missed enemy is now struck', () => {
    // Needle parks at 0.7 (= 2.0 rad/s × 0.35). Enemy at 1.3 sits 0.6 rad
    // off-needle, just past the default 0.5 half-width. With +0.2 talent
    // mod (2 levels × 0.10) the new half-width is 0.7 and the enemy lands
    // inside the band.
    const baseTower = createMockTower({ type: TowerType.RADAR_A, x: 0, y: 0 })
    const enemyOutside = enemyAtAngle(1.3)
    game.towers.push(baseTower)
    game.enemies.push(enemyOutside)
    system.update(0.35, game)
    expect(damageTaken(enemyOutside)).toBe(0)

    // Fresh game with the talent mod and an identically-positioned enemy.
    game = createMockGame({ phase: GamePhase.WAVE })
    system = new RadarTowerSystem()
    system.init(game)
    const wideTower = createMockTower({
      type: TowerType.RADAR_A, x: 0, y: 0,
      talentMods: { aoe_width: 0.20 },
    })
    const enemyNowHit = enemyAtAngle(1.3)
    game.towers.push(wideTower)
    game.enemies.push(enemyNowHit)
    system.update(0.35, game)
    expect(damageTaken(enemyNowHit)).toBeGreaterThan(0)
  })
})

// Phase 7 (Q14) — RADAR_B `crit_chance` advanced talent. Crits use game.rng
// so a recorded replay reproduces hit-for-hit. crit_chance=1 guarantees the
// crit so we don't need to reach into the RNG to assert the damage scaling.
describe('RadarTowerSystem — RADAR_B crit_chance talent', () => {
  let game: ReturnType<typeof createMockGame>
  let system: RadarTowerSystem

  beforeEach(() => {
    game = createMockGame({ phase: GamePhase.WAVE })
    system = new RadarTowerSystem()
    system.init(game)
  })

  // Enemy at (2, 0) lands inside the default arc [0, π/2] of RADAR_B, so
  // the ×1.5 focus-sector bonus applies. Each expected-damage assertion
  // bakes the 1.5 in explicitly so a future arc-bonus tweak is loud.
  it('crit_chance=1 doubles the projectile damage on every fire', () => {
    const tower = createMockTower({
      type: TowerType.RADAR_B, x: 0, y: 0,
      effectiveDamage: 10, effectiveRange: 5,
      cooldown: 1.0, cooldownTimer: 0,
      talentMods: { crit_chance: 1.0 },
    })
    game.towers.push(tower)
    game.enemies.push(createMockEnemy({ x: 2, y: 0 }))

    system.update(0.016, game)

    expect(game.projectiles.length).toBe(1)
    expect(game.projectiles[0].damage).toBeCloseTo(10 * 1.5 * 2, 5)  // eff × arc × crit
  })

  it('crit_chance=0 fires at base damage (no crit roll)', () => {
    const tower = createMockTower({
      type: TowerType.RADAR_B, x: 0, y: 0,
      effectiveDamage: 10, effectiveRange: 5,
      cooldown: 1.0, cooldownTimer: 0,
    })
    game.towers.push(tower)
    game.enemies.push(createMockEnemy({ x: 2, y: 0 }))

    system.update(0.016, game)

    expect(game.projectiles[0].damage).toBeCloseTo(10 * 1.5, 5)  // eff × arc, no crit
  })
})

// Phase 7 (Q14) — RADAR_C `crit_damage` talent stacks ADDITIVELY with the
// existing upgrade-extra critDamage; the base multiplier (2×) is untouched.
describe('RadarTowerSystem — RADAR_C crit_damage talent', () => {
  let game: ReturnType<typeof createMockGame>
  let system: RadarTowerSystem

  beforeEach(() => {
    game = createMockGame({ phase: GamePhase.WAVE })
    system = new RadarTowerSystem()
    system.init(game)
  })

  it('crit_damage talent additively raises the crit multiplier above 2.0', () => {
    const tower = createMockTower({
      type: TowerType.RADAR_C, x: 0, y: 0,
      effectiveDamage: 10, effectiveRange: 5,
      cooldown: 1.0, cooldownTimer: 0,
      upgradeExtras: { critChance: 1.0 },
      talentMods: { crit_damage: 1.0 },  // 2 levels × 0.5 = +1.0 → 3× crit
    })
    game.towers.push(tower)
    game.enemies.push(createMockEnemy({ x: 2, y: 0 }))

    system.update(0.016, game)

    expect(game.projectiles[0].damage).toBeCloseTo(10 * 1.5 * 3, 5)  // eff × arc × crit (2+1.0)
  })

  it('crit_damage stacks with upgrade extra critDamage (both additive)', () => {
    const tower = createMockTower({
      type: TowerType.RADAR_C, x: 0, y: 0,
      effectiveDamage: 10, effectiveRange: 5,
      cooldown: 1.0, cooldownTimer: 0,
      upgradeExtras: { critChance: 1.0, critDamage: 0.5 },  // +0.5 → 2.5×
      talentMods: { crit_damage: 1.0 },                      // +1.0 → 3.5×
    })
    game.towers.push(tower)
    game.enemies.push(createMockEnemy({ x: 2, y: 0 }))

    system.update(0.016, game)

    expect(game.projectiles[0].damage).toBeCloseTo(10 * 1.5 * 3.5, 5)  // eff × arc × crit
  })
})
