import { describe, it, expect, beforeEach } from 'vitest'
import { MatrixTowerSystem } from '../MatrixTowerSystem'
import { GamePhase, TowerType } from '@/data/constants'
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
