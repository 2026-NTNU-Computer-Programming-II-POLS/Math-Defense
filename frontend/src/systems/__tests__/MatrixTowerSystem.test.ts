import { describe, it, expect, beforeEach } from 'vitest'
import { MatrixTowerSystem } from '../MatrixTowerSystem'
import { Events, GamePhase, TowerType } from '@/data/constants'
import { TOWER_DEFS } from '@/data/tower-defs'
import { createMockGame, createMockTower, createMockEnemy } from './helpers'

describe('MatrixTowerSystem', () => {
  let game: ReturnType<typeof createMockGame>
  let system: MatrixTowerSystem

  beforeEach(() => {
    game = createMockGame({ phase: GamePhase.WAVE })
    system = new MatrixTowerSystem()
    system.init(game)
  })

  function placePair(ax: number, ay: number, bx: number, by: number) {
    const a = createMockTower({
      type: TowerType.MATRIX,
      x: ax, y: ay,
      configured: true,
      effectiveRange: 100,
      talentMods: {},
      upgradeExtras: {},
    })
    const b = createMockTower({
      type: TowerType.MATRIX,
      x: bx, y: by,
      configured: true,
      effectiveRange: 100,
      talentMods: {},
      upgradeExtras: {},
    })
    a.matrixPairId = b.id
    b.matrixPairId = a.id
    game.towers.push(a, b)
    return { a, b }
  }

  describe('TOWER_DEFS', () => {
    it('declares MATRIX base damage = 1 (Q9: was 0)', () => {
      expect(TOWER_DEFS[TowerType.MATRIX].damage).toBe(1)
    })

    it('MATRIX description signals that pairing is required', () => {
      const desc = TOWER_DEFS[TowerType.MATRIX].description.toLowerCase()
      expect(desc).toMatch(/pair/)
    })
  })

  describe('paired damage = 1 + dot product', () => {
    it('positive dot product pair deals (1 + dp) × dt to enemies in overlap', () => {
      // (2,3) · (1,1) = 5 → baseDamage = 6
      const { a } = placePair(2, 3, 1, 1)
      const enemy = createMockEnemy({ hp: 100, maxHp: 100, x: 2, y: 3, alive: true })
      game.enemies.push(enemy)

      const dt = 1.0  // rampMultiplier = 1 + 1.0*0.5 = 1.5 at t=1s
      system.update(dt, game)

      // baseDamage 6 * rampMul 1.5 * dt 1.0 = 9.0
      const expectedDamage = 6 * 1.5 * 1.0
      expect(enemy.hp).toBeCloseTo(100 - expectedDamage, 5)
      expect(a.matrixPairId).toBeTruthy()
    })

    it('pair at origin (dp = 0) still fires — baseDamage = 1', () => {
      // (0,0) · (0,1) = 0 → baseDamage = 1 (previously was 0/invalid)
      placePair(0, 0, 0, 1)
      const enemy = createMockEnemy({ hp: 100, maxHp: 100, x: 0, y: 0, alive: true })
      game.enemies.push(enemy)

      system.update(0.5, game)
      // baseDamage 1 * rampMul (1 + 0.5*0.5=1.25) * dt 0.5 = 0.625
      expect(enemy.hp).toBeLessThan(100)
    })

    it('strongly opposing pair (dp ≤ -1) is invalid → no damage', () => {
      // (2,0) · (-2,0) = -4 → baseDamage = -3 → invalid
      placePair(2, 0, -2, 0)
      const enemy = createMockEnemy({ hp: 100, maxHp: 100, x: 0, y: 0, alive: true })
      game.enemies.push(enemy)

      system.update(1.0, game)
      expect(enemy.hp).toBe(100)
    })

    // Phase 7 (Q14): `resonance` talent multiplies (1 + dotProduct) AFTER the
    // > 0 gate, so it never resurrects an opposite-quadrant pair and never
    // changes the "invalid laser" outcome — it only scales valid laser damage.
    it('resonance talent multiplicatively scales paired damage', () => {
      const { a } = placePair(2, 3, 1, 1)  // rawBase = 1 + (2+3) = 6
      a.talentMods = { resonance: 0.30 }   // 2 lv × 0.15 → baseDamage = 6 × 1.3 = 7.8
      const enemy = createMockEnemy({ hp: 200, maxHp: 200, x: 2, y: 3, alive: true })
      game.enemies.push(enemy)

      const dt = 1.0
      system.update(dt, game)

      // baseDamage 7.8 × rampMul 1.5 × dt 1.0 = 11.7
      expect(enemy.hp).toBeCloseTo(200 - 7.8 * 1.5, 5)
    })

    it('resonance does not resurrect an opposite-quadrant pair', () => {
      const { a } = placePair(2, 0, -2, 0)  // rawBase = -3 → invalid
      a.talentMods = { resonance: 5.0 }     // huge mod should be irrelevant
      const enemy = createMockEnemy({ hp: 100, maxHp: 100, x: 0, y: 0, alive: true })
      game.enemies.push(enemy)

      system.update(1.0, game)
      expect(enemy.hp).toBe(100)
    })

    // F1: MATRIX is in INTERFERING_TOWER_TYPES but its custom damage formula
    // used to ignore interferenceFactor, letting clustered Matrix towers escape
    // the same-type soft cap every other tower obeys. The laser now folds in
    // the average of both towers' factors.
    it('folds same-type interference (avg of both towers) into laser damage', () => {
      const { a, b } = placePair(2, 3, 1, 1)  // rawBase = 1 + 5 = 6
      a.interferenceFactor = 0.7
      b.interferenceFactor = 0.9              // avg = 0.8 → baseDamage = 6 × 0.8 = 4.8
      const enemy = createMockEnemy({ hp: 100, maxHp: 100, x: 2, y: 3, alive: true })
      game.enemies.push(enemy)

      const dt = 1.0  // rampMul = 1 + 1.0*0.5 = 1.5
      system.update(dt, game)

      // baseDamage 4.8 × rampMul 1.5 × dt 1.0 = 7.2
      expect(enemy.hp).toBeCloseTo(100 - 4.8 * 1.5, 5)
    })

    // F2: a locked target was damaged forever once acquired, even after it left
    // both towers' ranges. The lock now holds only to the overlap zone.
    it('releases a locked target that leaves the overlap zone', () => {
      const { a, b } = placePair(0, 0, 1, 0)  // dot = 0 → rawBase = 1 (valid)
      a.effectiveRange = 5
      b.effectiveRange = 5
      const enemy = createMockEnemy({ hp: 100, maxHp: 100, x: 0, y: 0, alive: true })
      game.enemies.push(enemy)

      system.update(0.5, game)
      const hpAfterLock = enemy.hp
      expect(hpAfterLock).toBeLessThan(100)  // acquired & damaged inside the zone

      // Walk the enemy far outside both towers' ranges.
      enemy.x = 100
      enemy.y = 100
      system.update(0.5, game)
      expect(enemy.hp).toBe(hpAfterLock)  // released → no further damage
    })

    // F5: when all targets leave the firing zone the laser used to keep its
    // accumulated ramp, freezing the readout at a stale value. It now resets.
    it('resets ramp to 0 when all targets leave the zone', () => {
      const { a, b } = placePair(0, 0, 1, 0)
      a.effectiveRange = 5
      b.effectiveRange = 5
      const enemy = createMockEnemy({ hp: 1e6, maxHp: 1e6, x: 0, y: 0, alive: true })
      game.enemies.push(enemy)

      system.update(1.0, game)
      system.update(1.0, game)
      expect(system.getLaserState(a.id)?.rampTime).toBeGreaterThan(0)

      // Enemy walks out of the overlap → laser idle → ramp resets.
      enemy.x = 100
      enemy.y = 100
      system.update(0.5, game)
      expect(system.getLaserState(a.id)?.rampTime).toBe(0)
    })

    // F3: MATRIX_PAIR_CHANGED must gate BOTH towers for firing, not rely on the
    // Vue panel marking only the clicked one.
    it('MATRIX_PAIR_CHANGED marks both towers configured', () => {
      const a = createMockTower({ type: TowerType.MATRIX, x: 0, y: 0, configured: false })
      const b = createMockTower({ type: TowerType.MATRIX, x: 1, y: 0, configured: false })
      a.matrixPairId = null
      b.matrixPairId = null
      game.towers.push(a, b)

      game.eventBus.emit(Events.MATRIX_PAIR_CHANGED, { towerId: a.id, pairId: b.id })

      expect(a.configured).toBe(true)
      expect(b.configured).toBe(true)
      expect(a.matrixPairId).toBe(b.id)
      expect(b.matrixPairId).toBe(a.id)
    })

    // F6: auto-pair must not bind a freshly placed tower to a disabled one.
    it('_autoPair skips a disabled candidate', () => {
      const existing = createMockTower({ type: TowerType.MATRIX, x: 1, y: 0, disabled: true, configured: false })
      existing.matrixPairId = null
      game.towers.push(existing)

      const placed = createMockTower({ type: TowerType.MATRIX, x: 0, y: 0, configured: false })
      placed.matrixPairId = null
      game.towers.push(placed)
      game.eventBus.emit(Events.TOWER_PLACED, placed)

      expect(placed.matrixPairId).toBeNull()
      expect(existing.matrixPairId).toBeNull()
    })

    it('unpaired MATRIX tower does not fire', () => {
      const lone = createMockTower({
        type: TowerType.MATRIX,
        x: 3, y: 3,
        configured: true,
        effectiveRange: 100,
        talentMods: {},
        upgradeExtras: {},
      })
      lone.matrixPairId = null
      game.towers.push(lone)
      const enemy = createMockEnemy({ hp: 100, maxHp: 100, x: 3, y: 3, alive: true })
      game.enemies.push(enemy)

      system.update(1.0, game)
      expect(enemy.hp).toBe(100)
    })
  })
})
