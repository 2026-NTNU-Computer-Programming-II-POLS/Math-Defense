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

    // Restrict mode oscillates the needle from arcStart (1.0); update(0.15)
    // advances it 2.0×0.15 = 0.3 rad to 1.3, landing the band on the in-arc
    // enemy. The out-of-arc enemy is hard-filtered regardless of needle angle.
    system.update(0.15, game)

    expect(damageTaken(outArc)).toBe(0)
    expect(damageTaken(inArc)).toBeGreaterThan(0)
  })
})

// Task: RADAR_A is a discrete "ping per pass" tower (was a flat dt-scaled
// continuous beam). Each enemy is struck once when it first enters the sweep
// band, then again only after the needle comes back around — so a faster
// sweep deals proportionally more damage, which the old model ignored.
describe('RadarTowerSystem — RADAR_A per-pass ping model', () => {
  let game: ReturnType<typeof createMockGame>
  let system: RadarTowerSystem

  beforeEach(() => {
    game = createMockGame({ phase: GamePhase.WAVE })
    system = new RadarTowerSystem()
    system.init(game)
  })

  it('pings an in-band enemy once per pass, not every frame', () => {
    // Enemy at angle 0 (the needle's free-mode start). Default arc [0, π/2]
    // grants it the ×1.5 focus bonus → one ping = effectiveDamage × 1.5.
    const tower = createMockTower({
      type: TowerType.RADAR_A, x: 0, y: 0,
      effectiveDamage: 5, effectiveRange: 5,
    })
    game.towers.push(tower)
    const enemy = enemyAtAngle(0, 3)
    game.enemies.push(enemy)

    // Five small ticks keep the needle (0 → 0.16 rad) inside the 0.5 band the
    // whole time. A continuous model would have dealt five slices; the ping
    // model deals exactly one hit on the rising edge.
    for (let i = 0; i < 5; i++) system.update(0.016, game)

    expect(damageTaken(enemy)).toBeCloseTo(5 * 1.5, 5)
  })

  it('faster sweep speed deals more damage over the same time', () => {
    function damageOver(seconds: number, sweepTalent: number): number {
      const g = createMockGame({ phase: GamePhase.WAVE })
      const s = new RadarTowerSystem()
      s.init(g)
      const t = createMockTower({
        type: TowerType.RADAR_A, x: 0, y: 0,
        effectiveDamage: 5, effectiveRange: 5,
        talentMods: sweepTalent ? { sweep_speed: sweepTalent } : {},
      })
      g.towers.push(t)
      const e = createMockEnemy({ x: 3, y: 0, hp: 1e6, maxHp: 1e6 })
      g.enemies.push(e)
      const steps = Math.round(seconds / 0.016)
      for (let i = 0; i < steps; i++) s.update(0.016, g)
      return e.maxHp - e.hp
    }

    const base = damageOver(10, 0)       // ω = 2.0 rad/s
    const fast = damageOver(10, 1.0)     // ω = 4.0 rad/s → ~2× the passes
    expect(base).toBeGreaterThan(0)
    expect(fast).toBeGreaterThan(base * 1.5)
  })
})

// Task: when "Restrict attacks to arc" is on, the sweep needle must oscillate
// like a windshield wiper strictly inside [arcStart, arcEnd] — it must never
// circle past the sector walls (the renderer reads tower.sweepAngle directly).
describe('RadarTowerSystem — RADAR_A restrict-mode wiper bounds', () => {
  let game: ReturnType<typeof createMockGame>
  let system: RadarTowerSystem

  beforeEach(() => {
    game = createMockGame({ phase: GamePhase.WAVE })
    system = new RadarTowerSystem()
    system.init(game)
  })

  it('keeps the needle inside the arc and reverses at both walls', () => {
    const tower = createMockTower({
      type: TowerType.RADAR_A, x: 0, y: 0,
      arcStart: 1.0, arcEnd: 2.0, arcRestrict: true,
      effectiveRange: 5,
    })
    game.towers.push(tower)

    let min = Infinity
    let max = -Infinity
    // ~8 s at ω = 2.0 over a 1.0 rad span sweeps the wiper back and forth many
    // times, so it must visit both edges while never leaving the sector.
    for (let i = 0; i < 500; i++) {
      system.update(0.016, game)
      const a = tower.sweepAngle!
      if (a < min) min = a
      if (a > max) max = a
    }

    expect(min).toBeGreaterThanOrEqual(1.0 - 1e-6)
    expect(max).toBeLessThanOrEqual(2.0 + 1e-6)
    // Confirm it actually oscillates across the span, not just sits at a wall.
    expect(min).toBeLessThan(1.1)
    expect(max).toBeGreaterThan(1.9)
  })

  it('free (unrestricted) sweep still circles the full 360°', () => {
    const tower = createMockTower({
      type: TowerType.RADAR_A, x: 0, y: 0,
      arcStart: 1.0, arcEnd: 2.0, arcRestrict: false,
      effectiveRange: 5,
    })
    game.towers.push(tower)

    let max = -Infinity
    for (let i = 0; i < 300; i++) {
      system.update(0.016, game)
      if (tower.sweepAngle! > max) max = tower.sweepAngle!
    }
    // A full circle reaches angles well outside the [1.0, 2.0] focus sector.
    expect(max).toBeGreaterThan(3.0)
  })
})

// Regression: a restricted sector narrower than the detection band
// (span < 2*aoeWidth) used to ping a dwelling in-arc enemy exactly once — the
// band blanketed the whole wedge so the rising-edge never re-fired. The
// degenerate-arc guard switches to a bounded periodic pulse so a focused
// narrow arc deals sustained damage, the natural payoff for giving up 360°.
describe('RadarTowerSystem — RADAR_A narrow restricted-arc pulse', () => {
  let game: ReturnType<typeof createMockGame>
  let system: RadarTowerSystem

  beforeEach(() => {
    game = createMockGame({ phase: GamePhase.WAVE })
    system = new RadarTowerSystem()
    system.init(game)
  })

  // Arc [0, 0.3] rad (~17°) is far narrower than the 1.0 rad band, with
  // restrict on. sweepSpeed = 2.0, aoeWidth = 0.5 ⇒ pulse every
  // 2*0.5/2.0 = 0.5 s. Enemy mid-arc gets effectiveDamage × 1.5 per pulse.
  function narrowTower() {
    const t = createMockTower({
      type: TowerType.RADAR_A, x: 0, y: 0,
      arcStart: 0, arcEnd: 0.3, arcRestrict: true,
      effectiveDamage: 5, effectiveRange: 5,
    })
    return t
  }

  it('deals sustained damage to a dwelling enemy, not a single ping', () => {
    const tower = narrowTower()
    game.towers.push(tower)
    const enemy = createMockEnemy({
      x: 3 * Math.cos(0.15), y: 3 * Math.sin(0.15), hp: 1e6, maxHp: 1e6,
    })
    game.enemies.push(enemy)

    // ~6.4 s. At a 0.5 s cadence that is ~13 pulses of 5 × 1.5 = 7.5 each.
    for (let i = 0; i < 400; i++) system.update(0.016, game)

    // Pre-fix this was exactly one ping (7.5). Require many more.
    expect(damageTaken(enemy)).toBeGreaterThan(7.5 * 5)
  })

  it('keeps the pulse cadence bounded — no per-tick ping explosion', () => {
    // 5° arc (UI minimum). A naive "clear on wiper reversal" fix would ping
    // ~20×/s here; the cadence-based pulse caps it to ~2 pings/s.
    const tower = createMockTower({
      type: TowerType.RADAR_A, x: 0, y: 0,
      arcStart: 0, arcEnd: 5 * Math.PI / 180, arcRestrict: true,
      effectiveDamage: 5, effectiveRange: 5,
    })
    game.towers.push(tower)
    const enemy = createMockEnemy({
      x: 3 * Math.cos(0.04), y: 3 * Math.sin(0.04), hp: 1e6, maxHp: 1e6,
    })
    game.enemies.push(enemy)

    // 1.0 s. pulseInterval = 0.5 s ⇒ at most 3 pulses (t=0, 0.5, 1.0).
    for (let i = 0; i < 63; i++) system.update(0.016, game)

    // 3 pulses × 7.5 = 22.5; nowhere near a per-tick (60×) explosion.
    expect(damageTaken(enemy)).toBeLessThanOrEqual(7.5 * 3 + 1e-6)
    expect(damageTaken(enemy)).toBeGreaterThan(0)
  })

  it('still hard-filters enemies outside the narrow restricted arc', () => {
    const tower = narrowTower()
    game.towers.push(tower)
    const inArc = createMockEnemy({
      x: 3 * Math.cos(0.15), y: 3 * Math.sin(0.15), hp: 1e6, maxHp: 1e6,
    })
    const outArc = createMockEnemy({
      x: 3 * Math.cos(1.2), y: 3 * Math.sin(1.2), hp: 1e6, maxHp: 1e6,
    })
    game.enemies.push(inArc, outArc)

    for (let i = 0; i < 100; i++) system.update(0.016, game)

    expect(damageTaken(inArc)).toBeGreaterThan(0)
    expect(damageTaken(outArc)).toBe(0)
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

// RADAR_C ships with an innate base crit chance (def `baseCritChance` = 0.05) so
// the `crit_damage` talent is never dead weight on a not-yet-upgraded tower —
// before this, crit chance came only from the Tier-2/3 upgrade, making the
// talent do nothing until then. Crits roll against game.rng (seeded for replay);
// the rng is stubbed to a fixed value here to pin the 0.05 boundary exactly.
describe('RadarTowerSystem — RADAR_C innate base crit chance', () => {
  let game: ReturnType<typeof createMockGame>
  let system: RadarTowerSystem

  beforeEach(() => {
    game = createMockGame({ phase: GamePhase.WAVE })
    system = new RadarTowerSystem()
    system.init(game)
  })

  // No upgradeExtras → crit chance is the innate base alone. baseCritChance
  // mirrors the RADAR_C tower def value (createMockTower doesn't read defs).
  function baseSniper(rngValue: number) {
    game.rng = () => rngValue
    const tower = createMockTower({
      type: TowerType.RADAR_C, x: 0, y: 0,
      effectiveDamage: 10, effectiveRange: 5,
      cooldown: 1.0, cooldownTimer: 0,
      baseCritChance: 0.05,
    })
    game.towers.push(tower)
    game.enemies.push(createMockEnemy({ x: 2, y: 0 }))
  }

  it('crits on a base (un-upgraded) tower when the roll lands under 0.05', () => {
    baseSniper(0.04)  // < 0.05 → crit at the fixed 2× base multiplier
    system.update(0.016, game)
    expect(game.projectiles[0].damage).toBeCloseTo(10 * 1.5 * 2, 5)  // eff × arc × crit
  })

  it('does not crit when the roll lands at/above 0.05', () => {
    baseSniper(0.05)  // not < 0.05 → no crit
    system.update(0.016, game)
    expect(game.projectiles[0].damage).toBeCloseTo(10 * 1.5, 5)  // eff × arc, no crit
  })

  it('innate base stacks additively with the critChance upgrade extra', () => {
    game.rng = () => 0.10  // would miss on base 0.05 alone, hits at 0.05+0.20
    const tower = createMockTower({
      type: TowerType.RADAR_C, x: 0, y: 0,
      effectiveDamage: 10, effectiveRange: 5,
      cooldown: 1.0, cooldownTimer: 0,
      baseCritChance: 0.05,
      upgradeExtras: { critChance: 0.20 },  // 0.05 + 0.20 = 0.25 > 0.10 → crit
    })
    game.towers.push(tower)
    game.enemies.push(createMockEnemy({ x: 2, y: 0 }))

    system.update(0.016, game)

    expect(game.projectiles[0].damage).toBeCloseTo(10 * 1.5 * 2, 5)  // eff × arc × crit
  })
})
