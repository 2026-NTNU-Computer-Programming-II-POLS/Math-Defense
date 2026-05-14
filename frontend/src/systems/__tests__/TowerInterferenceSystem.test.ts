/**
 * Phase 7 §7.3 — same-type tower interference. Towers of the same type packed
 * within INTERFERENCE_RADIUS lose damage; different types never interfere; the
 * affected-type scope is the data-driven INTERFERING_TOWER_TYPES set.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TowerInterferenceSystem, INTERFERING_TOWER_TYPES } from '../TowerInterferenceSystem'
import { Events, GamePhase, TowerType } from '@/data/constants'
import { createMockGame, createMockTower } from './helpers'

describe('TowerInterferenceSystem', () => {
  let game: ReturnType<typeof createMockGame>
  let system: TowerInterferenceSystem

  beforeEach(() => {
    game = createMockGame({ phase: GamePhase.WAVE })
    system = new TowerInterferenceSystem()
    system.init(game)
  })

  it('leaves an isolated tower at factor 1', () => {
    const tower = createMockTower({ type: TowerType.RADAR_A, x: 0, y: 0, baseDamage: 20, damageBonus: 1 })
    game.towers.push(tower)

    system.update(0.016, game)

    expect(tower.interferenceFactor).toBe(1)
    expect(tower.effectiveDamage).toBe(20)
  })

  it('two same-type towers within radius each drop to 0.85', () => {
    const a = createMockTower({ type: TowerType.RADAR_A, x: 0, y: 0, baseDamage: 20, damageBonus: 1 })
    const b = createMockTower({ type: TowerType.RADAR_A, x: 2, y: 0, baseDamage: 20, damageBonus: 1 })
    game.towers.push(a, b)

    system.update(0.016, game)

    expect(a.interferenceFactor).toBeCloseTo(0.85)
    expect(b.interferenceFactor).toBeCloseTo(0.85)
    expect(a.effectiveDamage).toBeCloseTo(17)
  })

  it('three tightly-clustered same-type towers each drop to 0.70', () => {
    const a = createMockTower({ type: TowerType.MATRIX, x: 0, y: 0 })
    const b = createMockTower({ type: TowerType.MATRIX, x: 1, y: 0 })
    const c = createMockTower({ type: TowerType.MATRIX, x: 0, y: 1 })
    game.towers.push(a, b, c)

    system.update(0.016, game)

    expect(a.interferenceFactor).toBeCloseTo(0.7)
    expect(b.interferenceFactor).toBeCloseTo(0.7)
    expect(c.interferenceFactor).toBeCloseTo(0.7)
  })

  it('clamps a large cluster at the 0.40 interference floor', () => {
    const positions = [
      [0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5],
    ]
    const towers = positions.map(([x, y]) =>
      createMockTower({ type: TowerType.LIMIT, x, y }),
    )
    game.towers.push(...towers)

    system.update(0.016, game)

    // 5 neighbours each → 1 - 0.15*5 = 0.25, clamped up to the 0.40 floor.
    for (const t of towers) {
      expect(t.interferenceFactor).toBeCloseTo(0.4)
    }
  })

  it('different-type towers placed adjacent do not interfere', () => {
    const magic = createMockTower({ type: TowerType.MAGIC, x: 0, y: 0 })
    const radar = createMockTower({ type: TowerType.RADAR_A, x: 0.5, y: 0 })
    game.towers.push(magic, radar)

    system.update(0.016, game)

    expect(magic.interferenceFactor).toBe(1)
    expect(radar.interferenceFactor).toBe(1)
  })

  it('recomputes once on TOWER_PLACED so the BUILD-phase preview is correct', () => {
    game.state.phase = GamePhase.BUILD
    const a = createMockTower({ type: TowerType.RADAR_B, x: 0, y: 0, baseDamage: 20, damageBonus: 1 })
    const b = createMockTower({ type: TowerType.RADAR_B, x: 2, y: 0, baseDamage: 20, damageBonus: 1 })
    game.towers.push(a, b)

    // update() early-returns outside WAVE — the event handler is what keeps
    // the preview live during BUILD.
    system.update(0.016, game)
    expect(a.interferenceFactor).toBe(1)

    game.eventBus.emit(Events.TOWER_PLACED, b)

    expect(a.interferenceFactor).toBeCloseTo(0.85)
    expect(b.interferenceFactor).toBeCloseTo(0.85)
  })

  it('recomputes on TOWER_REFUND_RESULT so a removed neighbour lifts the penalty', () => {
    game.state.phase = GamePhase.BUILD
    const a = createMockTower({ type: TowerType.CALCULUS, x: 0, y: 0 })
    const b = createMockTower({ type: TowerType.CALCULUS, x: 2, y: 0 })
    game.towers.push(a, b)
    game.eventBus.emit(Events.TOWER_PLACED, b)
    expect(a.interferenceFactor).toBeCloseTo(0.85)

    // Simulate the refund: tower removed from the array, then the event fires.
    game.towers.splice(1, 1)
    game.eventBus.emit(Events.TOWER_REFUND_RESULT, { success: true, towerId: b.id })

    expect(a.interferenceFactor).toBe(1)
  })

  describe('data-driven scope (Decision D2)', () => {
    it('ships with all seven tower types in INTERFERING_TOWER_TYPES', () => {
      for (const type of Object.values(TowerType)) {
        expect(INTERFERING_TOWER_TYPES.has(type)).toBe(true)
      }
    })

    describe('a type removed from the set', () => {
      const removable = INTERFERING_TOWER_TYPES as Set<TowerType>
      let wasPresent = false

      beforeEach(() => {
        wasPresent = removable.has(TowerType.RADAR_C)
        removable.delete(TowerType.RADAR_C)
      })

      afterEach(() => {
        if (wasPresent) removable.add(TowerType.RADAR_C)
      })

      it('always reports factor 1 regardless of same-type neighbours', () => {
        const a = createMockTower({ type: TowerType.RADAR_C, x: 0, y: 0 })
        const b = createMockTower({ type: TowerType.RADAR_C, x: 1, y: 0 })
        const c = createMockTower({ type: TowerType.RADAR_C, x: 0, y: 1 })
        game.towers.push(a, b, c)

        system.update(0.016, game)

        expect(a.interferenceFactor).toBe(1)
        expect(b.interferenceFactor).toBe(1)
        expect(c.interferenceFactor).toBe(1)
      })
    })
  })

  describe('ordering with MagicTowerSystem', () => {
    it('a Magic-buffed, interfered-with tower folds in both factors', () => {
      const a = createMockTower({
        type: TowerType.RADAR_A, x: 0, y: 0,
        baseDamage: 20, damageBonus: 1, magicBuff: 1.25,
      })
      const b = createMockTower({ type: TowerType.RADAR_A, x: 2, y: 0 })
      game.towers.push(a, b)

      system.update(0.016, game)

      // baseDamage * damageBonus * magicBuff * interferenceFactor
      expect(a.effectiveDamage).toBeCloseTo(20 * 1 * 1.25 * 0.85)
    })
  })

  it('a same-type cluster deals measurably less total damage than the same towers spread apart', () => {
    const makeFour = (positions: [number, number][]) =>
      positions.map(([x, y]) =>
        createMockTower({ type: TowerType.RADAR_A, x, y, baseDamage: 20, damageBonus: 1 }),
      )
    const sumDamage = (towers: ReturnType<typeof makeFour>) =>
      towers.reduce((acc, t) => acc + t.effectiveDamage, 0)

    // Four towers packed inside INTERFERENCE_RADIUS — each sees 3 neighbours.
    const clustered = makeFour([[0, 0], [1, 0], [0, 1], [1, 1]])
    game.towers.push(...clustered)
    system.update(0.016, game)
    const clusteredTotal = sumDamage(clustered)

    // Same four towers, spread far enough apart that none interfere.
    game.towers.length = 0
    const spread = makeFour([[0, 0], [10, 0], [0, 10], [10, 10]])
    game.towers.push(...spread)
    system.update(0.016, game)
    const spreadTotal = sumDamage(spread)

    expect(spreadTotal).toBeCloseTo(4 * 20)
    expect(clusteredTotal).toBeCloseTo(4 * 20 * 0.55)
    expect(clusteredTotal).toBeLessThan(spreadTotal)
  })
})
