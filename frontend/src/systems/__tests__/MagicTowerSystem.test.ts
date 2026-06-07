/**
 * Phase 6 Q7: MagicTowerSystem coverage.
 *
 * The debuff path applies slow + DoT to enemies inside the curve zone and
 * gated by the tower's range; the buff path raises `magicBuff` on towers
 * inside the (wider) buff zone. Both paths are cooldown-gated on the debuff
 * side and per-frame on the buff side. These tests pin all three concerns:
 *
 *   - zone gating (range, vertical width, curve-relative)
 *   - effect application (slowFactor, slowTimer, dotDamage, dotTimer)
 *   - mode + lifecycle (debuff vs buff, disabled/unconfigured no-op)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  MagicTowerSystem,
  ZONE_WIDTH,
  BUFF_ZONE_MULTIPLIER,
  SLOW_BASE_DURATION,
  DOT_BASE_DURATION,
  SLOW_FACTOR,
  SLOW_FACTOR_CEIL,
} from '../MagicTowerSystem'
import { Events, GamePhase, TowerType } from '@/data/constants'
import { createMockGame, createMockEnemy, createMockTower } from './helpers'
import type { Game } from '@/engine/Game'
import type { Tower } from '@/entities/types'

function makeMagicTower(game: Game, overrides: Partial<Tower> = {}): Tower {
  const tower = createMockTower({
    type: TowerType.MAGIC,
    x: 0,
    y: 0,
    effectiveDamage: 8,
    effectiveRange: 5,
    cooldown: 1.0,
    cooldownTimer: 0,
    magicMode: 'debuff',
    magicExpression: '0',
    configured: true,
    ...overrides,
  })
  game.towers.push(tower)
  return tower
}

describe('MagicTowerSystem — Q7 debuff zone applies AoE damage + slow', () => {
  let game: ReturnType<typeof createMockGame>
  let system: MagicTowerSystem

  beforeEach(() => {
    game = createMockGame({ phase: GamePhase.WAVE })
    system = new MagicTowerSystem()
    system.init(game)
  })

  it('slows and DoTs an enemy on the curve and inside range', () => {
    const tower = makeMagicTower(game)
    const enemy = createMockEnemy({ x: 2, y: 0 })
    game.enemies.push(enemy)

    system.update(0.016, game)

    expect(enemy.slowFactor).toBe(SLOW_FACTOR)
    expect(enemy.slowTimer).toBeCloseTo(SLOW_BASE_DURATION, 5)
    expect(enemy.dotTimer).toBeCloseTo(DOT_BASE_DURATION, 5)
    expect(enemy.dotDamage).toBeCloseTo(tower.effectiveDamage, 5)
  })

  it('slow duration outlasts the DoT (Phase 6 Q7 decoupling)', () => {
    // Pinned regression: SLOW_BASE_DURATION must be strictly greater than
    // DOT_BASE_DURATION, otherwise consecutive 1 s cooldown hits leave a
    // gap with no slow between ticks.
    expect(SLOW_BASE_DURATION).toBeGreaterThan(DOT_BASE_DURATION)
  })

  it('does not affect enemies outside the tower range', () => {
    makeMagicTower(game, { effectiveRange: 3 })
    const enemy = createMockEnemy({ x: 10, y: 0 })
    game.enemies.push(enemy)

    system.update(0.016, game)

    expect(enemy.slowFactor).toBe(0)
    expect(enemy.dotDamage).toBe(0)
  })

  it('gates reach by radial distance to the curve, not x-projection', () => {
    // Regression: the debuff gate used to test only `|enemy.x − tower.x| ≤
    // range`, so a steep curve reached far past `range` along its arc. The gate
    // is now the Euclidean distance from the tower to the curve point — same
    // radial semantics as every other tower (RadarTargeting) and the drawn
    // band. Curve `y = x`, range 5, tower at the origin:
    makeMagicTower(game, { effectiveRange: 5, magicExpression: 'x' })
    // x = 4: x-distance 4 (≤ 5) but radial distance √32 ≈ 5.66 (> 5) → no hit.
    const far = createMockEnemy({ x: 4, y: 4 })
    // x = 3: radial distance √18 ≈ 4.24 (≤ 5), and on the curve → hit.
    const near = createMockEnemy({ x: 3, y: 3 })
    game.enemies.push(far, near)

    system.update(0.016, game)

    expect(far.slowFactor).toBe(0)
    expect(far.dotDamage).toBe(0)
    expect(near.slowFactor).toBe(SLOW_FACTOR)
  })

  it('does not affect enemies above/below the curve outside zone width', () => {
    makeMagicTower(game)
    // Curve `y = 0` and ZONE_WIDTH 1.5 — an enemy at y = 5 is far outside.
    const enemy = createMockEnemy({ x: 2, y: 5 })
    game.enemies.push(enemy)

    system.update(0.016, game)

    expect(enemy.slowFactor).toBe(0)
    expect(enemy.dotDamage).toBe(0)
  })

  it('respects the zone_width talent mod', () => {
    const tower = makeMagicTower(game, { talentMods: { zone_width: 1.0 } })
    // Effective zone width = 1.5 * 2 = 3.0; an enemy at y = 2.5 now lands inside.
    const enemy = createMockEnemy({ x: 2, y: 2.5 })
    game.enemies.push(enemy)

    system.update(0.016, game)

    expect(enemy.slowFactor).toBe(SLOW_FACTOR)
    expect(tower.talentMods['zone_width']).toBe(1.0)
  })

  it('does not stack slowFactor stronger than SLOW_FACTOR on re-hit', () => {
    // Refresh-on-rehit semantics (design note §Q7): max() on slowFactor
    // means two MAGIC towers debuffing the same enemy do not push the
    // factor past SLOW_FACTOR; they just keep the timer fresh.
    makeMagicTower(game, { x: 0 })
    makeMagicTower(game, { x: 1 })
    const enemy = createMockEnemy({ x: 0.5, y: 0 })
    game.enemies.push(enemy)

    system.update(0.016, game)

    expect(enemy.slowFactor).toBe(SLOW_FACTOR)
  })

  it('respects the duration talent mod on both slow and DoT timers', () => {
    makeMagicTower(game, { talentMods: { duration: 0.5 } })
    const enemy = createMockEnemy({ x: 2, y: 0 })
    game.enemies.push(enemy)

    system.update(0.016, game)

    expect(enemy.slowTimer).toBeCloseTo(SLOW_BASE_DURATION * 1.5, 5)
    expect(enemy.dotTimer).toBeCloseTo(DOT_BASE_DURATION * 1.5, 5)
  })

  it('does not re-fire while cooldown is active', () => {
    const tower = makeMagicTower(game, { cooldown: 2.0, cooldownTimer: 1.5 })
    const enemy = createMockEnemy({ x: 2, y: 0 })
    game.enemies.push(enemy)

    system.update(0.5, game)

    // dt=0.5 brings cooldownTimer to 1.0, still > 0 → no application.
    expect(enemy.slowFactor).toBe(0)
    expect(enemy.dotDamage).toBe(0)
    expect(tower.cooldownTimer).toBeCloseTo(1.0, 5)
  })

  it('does nothing during non-WAVE phases', () => {
    game.state.phase = GamePhase.BUFF_SELECT
    makeMagicTower(game)
    const enemy = createMockEnemy({ x: 2, y: 0 })
    game.enemies.push(enemy)

    system.update(0.016, game)

    expect(enemy.slowFactor).toBe(0)
    expect(enemy.dotDamage).toBe(0)
  })

  it('skips disabled or unconfigured magic towers', () => {
    makeMagicTower(game, { disabled: true })
    makeMagicTower(game, { configured: false, x: 1 })
    const enemy = createMockEnemy({ x: 1, y: 0 })
    game.enemies.push(enemy)

    system.update(0.016, game)

    expect(enemy.slowFactor).toBe(0)
  })

  it('ignores dead enemies', () => {
    makeMagicTower(game)
    const enemy = createMockEnemy({ x: 2, y: 0, alive: false })
    game.enemies.push(enemy)

    system.update(0.016, game)

    expect(enemy.slowFactor).toBe(0)
  })

  it('does not truncate a longer pre-existing slow timer (max semantics)', () => {
    // Cross-source regression: an Asymptote spell sets a 5 s slow; a Magic
    // debuff (2 s) overlapping the same enemy must NOT overwrite the shared
    // slowTimer down to 2 s. max() keeps the longer window.
    makeMagicTower(game)
    const enemy = createMockEnemy({ x: 2, y: 0, slowFactor: SLOW_FACTOR, slowTimer: 5 })
    game.enemies.push(enemy)

    system.update(0.016, game)

    expect(enemy.slowTimer).toBeCloseTo(5, 5)
    expect(enemy.slowFactor).toBe(SLOW_FACTOR)
  })

  it('keeps a stronger existing DoT when a weaker debuff zone overlaps (max semantics)', () => {
    // A weaker Magic tower iterated later must not clobber a stronger DoT
    // already on the enemy (the old last-writer-wins assignment could lower it).
    makeMagicTower(game, { effectiveDamage: 5 })
    const enemy = createMockEnemy({ x: 2, y: 0, dotDamage: 20, dotTimer: 1 })
    game.enemies.push(enemy)

    system.update(0.016, game)

    expect(enemy.dotDamage).toBeCloseTo(20, 5)
  })

  it('boosts the DoT of a debuff tower regardless of tower placement order', () => {
    // Order-independence regression: the buff tower is placed AFTER the debuff
    // tower, yet the debuff's DoT must still read the buffed effectiveDamage.
    // (The old interleaved single pass only buffed debuff towers that sat
    // earlier in game.towers.) base 8 × 1.25 buff = 10.
    const debuff = makeMagicTower(game, { x: 0, baseDamage: 8, effectiveDamage: 8, magicMode: 'debuff' })
    makeMagicTower(game, { x: 1, magicMode: 'buff' })
    const enemy = createMockEnemy({ x: 2, y: 0 })
    game.enemies.push(enemy)

    system.update(0.016, game)

    expect(debuff.magicBuff).toBeCloseTo(1.25, 5)
    expect(enemy.dotDamage).toBeCloseTo(10, 5)
  })
})

describe('MagicTowerSystem — Q7 buff zone (preserved)', () => {
  let game: ReturnType<typeof createMockGame>
  let system: MagicTowerSystem

  beforeEach(() => {
    game = createMockGame({ phase: GamePhase.WAVE })
    system = new MagicTowerSystem()
    system.init(game)
  })

  it('raises magicBuff on a tower inside the buff zone', () => {
    makeMagicTower(game, { magicMode: 'buff', x: 0 })
    const ally = createMockTower({
      type: TowerType.RADAR_A,
      x: 2,
      y: 0,
      baseDamage: 10,
      damageBonus: 1,
      magicBuff: 1,
      interferenceFactor: 1,
      effectiveDamage: 10,
    })
    game.towers.push(ally)

    system.update(0.016, game)

    expect(ally.magicBuff).toBeGreaterThan(1)
    // effectiveDamage = base * damageBonus * magicBuff * interferenceFactor
    expect(ally.effectiveDamage).toBeCloseTo(ally.baseDamage * ally.magicBuff, 5)
  })

  it('does not buff the source magic tower itself', () => {
    const source = makeMagicTower(game, { magicMode: 'buff', x: 0 })

    system.update(0.016, game)

    expect(source.magicBuff).toBe(1)
  })

  it('uses the wider buff zone (BUFF_ZONE_MULTIPLIER × debuff width)', () => {
    makeMagicTower(game, { magicMode: 'buff', x: 0 })
    // y = ZONE_WIDTH * 1.5 — outside debuff zone, still inside buff zone
    // (since BUFF_ZONE_MULTIPLIER = 2 → buff half-width = 3.0).
    const ally = createMockTower({
      type: TowerType.RADAR_A,
      x: 1,
      y: ZONE_WIDTH * 1.5,
      baseDamage: 10,
      damageBonus: 1,
      magicBuff: 1,
      interferenceFactor: 1,
      effectiveDamage: 10,
    })
    game.towers.push(ally)

    system.update(0.016, game)

    expect(ZONE_WIDTH * 1.5).toBeLessThan(ZONE_WIDTH * BUFF_ZONE_MULTIPLIER)
    expect(ally.magicBuff).toBeGreaterThan(1)
  })

  it('gates the buff zone by radial distance to the curve, not x-projection', () => {
    // Buff shares the debuff radial gate: a tower under a steep curve but beyond
    // the tower's circular range is not buffed even though its x is within range.
    makeMagicTower(game, { magicMode: 'buff', x: 0, effectiveRange: 5, magicExpression: 'x' })
    // Curve y = x. Ally on the curve at x = 4: radial distance √32 ≈ 5.66 (> 5).
    const ally = createMockTower({
      type: TowerType.RADAR_A,
      x: 4,
      y: 4,
      baseDamage: 10,
      damageBonus: 1,
      magicBuff: 1,
      interferenceFactor: 1,
      effectiveDamage: 10,
    })
    game.towers.push(ally)

    system.update(0.016, game)

    expect(ally.magicBuff).toBe(1)
  })

  it('resets magicBuff to 1 on the next tick when the source is disabled', () => {
    const source = makeMagicTower(game, { magicMode: 'buff', x: 0 })
    const ally = createMockTower({
      type: TowerType.RADAR_A,
      x: 2,
      y: 0,
      baseDamage: 10,
      damageBonus: 1,
      magicBuff: 1,
      interferenceFactor: 1,
      effectiveDamage: 10,
    })
    game.towers.push(ally)

    system.update(0.016, game)
    expect(ally.magicBuff).toBeGreaterThan(1)

    source.disabled = true
    system.update(0.016, game)

    expect(ally.magicBuff).toBe(1)
    expect(ally.effectiveDamage).toBeCloseTo(ally.baseDamage, 5)
  })

  it('clears a stale magic buff once the wave ends (reset runs outside WAVE)', () => {
    // Regression: the per-frame magicBuff reset used to sit behind the
    // `phase === WAVE` gate, so a buff applied during a wave lingered through
    // BUILD/BUFF_SELECT — and a Calculus respawn between waves snapshotted the
    // stale buff into its pets. The reset now runs before the phase gate.
    game.state.phase = GamePhase.BUFF_SELECT
    const ally = createMockTower({
      type: TowerType.RADAR_A,
      baseDamage: 10,
      damageBonus: 1,
      magicBuff: 1.25,
      interferenceFactor: 1,
      effectiveDamage: 12.5,
    })
    game.towers.push(ally)

    system.update(0.016, game)

    expect(ally.magicBuff).toBe(1)
    expect(ally.effectiveDamage).toBeCloseTo(ally.baseDamage, 5)
  })
})

describe('MagicTowerSystem — event handlers', () => {
  it('MAGIC_FUNCTION_SELECTED accepts a valid expression and configures the tower', () => {
    const game = createMockGame()
    const system = new MagicTowerSystem()
    system.init(game)
    const tower = createMockTower({
      type: TowerType.MAGIC,
      magicExpression: undefined,
      configured: false,
    })
    game.towers.push(tower)

    game.eventBus.emit(Events.MAGIC_FUNCTION_SELECTED, {
      towerId: tower.id,
      expression: 'x',
    })

    expect(tower.magicExpression).toBe('x')
    expect(tower.configured).toBe(true)
  })

  it('MAGIC_FUNCTION_SELECTED rejects an unparseable expression', () => {
    const game = createMockGame()
    const system = new MagicTowerSystem()
    system.init(game)
    const tower = createMockTower({
      type: TowerType.MAGIC,
      magicExpression: undefined,
      configured: false,
    })
    game.towers.push(tower)

    game.eventBus.emit(Events.MAGIC_FUNCTION_SELECTED, {
      towerId: tower.id,
      expression: 'not-a-curve',
    })

    expect(tower.magicExpression).toBeUndefined()
    expect(tower.configured).toBe(false)
  })

  // Phase 7 (Q14): slow_strength advanced talent. Pinned to the additive
  // factor semantics (slowFactor is the speed amount REMOVED, so bigger =
  // slower) and the ceiling that keeps a future stacked mod from freezing
  // enemies.
  it('slow_strength talent additively deepens the slow factor', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const system = new MagicTowerSystem()
    system.init(game)
    const tower = createMockTower({
      type: TowerType.MAGIC,
      x: 0, y: 0,
      effectiveDamage: 8,
      effectiveRange: 5,
      cooldown: 1.0,
      cooldownTimer: 0,
      magicMode: 'debuff',
      magicExpression: '0',
      configured: true,
      talentMods: { slow_strength: 0.20 },  // = 2 levels at 0.10/lv
    })
    game.towers.push(tower)
    const enemy = createMockEnemy({ x: 2, y: 0 })
    game.enemies.push(enemy)

    system.update(0.016, game)

    expect(enemy.slowFactor).toBeCloseTo(SLOW_FACTOR + 0.20, 5)
  })

  it('slow_strength clamps to SLOW_FACTOR_CEIL so enemies never freeze', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const system = new MagicTowerSystem()
    system.init(game)
    const tower = createMockTower({
      type: TowerType.MAGIC,
      x: 0, y: 0,
      effectiveDamage: 8,
      effectiveRange: 5,
      cooldown: 1.0,
      cooldownTimer: 0,
      magicMode: 'debuff',
      magicExpression: '0',
      configured: true,
      // Absurdly large mod (impossible from talents alone) — clamp must hold.
      talentMods: { slow_strength: 5.0 },
    })
    game.towers.push(tower)
    const enemy = createMockEnemy({ x: 2, y: 0 })
    game.enemies.push(enemy)

    system.update(0.016, game)

    expect(enemy.slowFactor).toBe(SLOW_FACTOR_CEIL)
    expect(SLOW_FACTOR_CEIL).toBeLessThan(1)
  })

  it('MAGIC_MODE_CHANGED flips the tower mode', () => {
    const game = createMockGame()
    const system = new MagicTowerSystem()
    system.init(game)
    const tower = createMockTower({ type: TowerType.MAGIC, magicMode: 'debuff' })
    game.towers.push(tower)

    game.eventBus.emit(Events.MAGIC_MODE_CHANGED, { towerId: tower.id, mode: 'buff' })

    expect(tower.magicMode).toBe('buff')
  })
})
