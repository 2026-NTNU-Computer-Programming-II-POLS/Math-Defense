/**
 * V3 Phase 3 — end-to-end counter-enemy behavior. Wires the real EnemyFactory,
 * the real applyDamage damage-source contract, and the real EnemyAbilitySystem
 * regen tick together to confirm each counter-enemy's intended weakness:
 *   - Bulwark (Balance-overhaul Phase 3 Q6): tower damage is multiplied by
 *     0.4 from every source except pets / effects.
 *   - Swarmling: reduced damage from every source except pets.
 *   - Regenerator: out-regenerates sustained sub-regen burst DPS, dies to one big hit.
 */
import { describe, it, expect } from 'vitest'
import { createEnemy } from '@/entities/EnemyFactory'
import { applyDamage } from '@/domain/combat/SplitPolicy'
import { EnemyAbilitySystem } from '../EnemyAbilitySystem'
import { createMockGame } from './helpers'
import { createSegmentedPath, type PathSegmentRuntime } from '@/domain/path/segmented-path'
import { EnemyType, GamePhase } from '@/data/constants'

function linearPath(): ReturnType<typeof createSegmentedPath> {
  const seg: PathSegmentRuntime = {
    id: 's0',
    kind: 'horizontal',
    xRange: [0, 20],
    params: { kind: 'horizontal', y: 0 },
    evaluate: () => 0,
    evaluateDerivative: () => 0,
    expr: 's0',
    label: 's0',
  }
  return createSegmentedPath([seg])
}

const DT = 1 / 60

describe('Bulwark — Q6 towerDamageMult applies to every tower source', () => {
  it('a 40-damage towerHit reduces HP by 40 × 0.4 = 16', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const enemy = createEnemy(EnemyType.BULWARK, linearPath())
    const before = enemy.hp
    applyDamage(enemy, 40, game, 'towerHit')
    expect(before - enemy.hp).toBeCloseTo(16, 5)
  })

  it('a 40-damage towerTick (Matrix laser) is also scaled to 16', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const enemy = createEnemy(EnemyType.BULWARK, linearPath())
    const before = enemy.hp
    applyDamage(enemy, 40, game, 'towerTick')
    expect(before - enemy.hp).toBeCloseTo(16, 5)
  })

  it('pet and effect damage bypass towerDamageMult — full 40 lands', () => {
    for (const source of ['pet', 'effect'] as const) {
      const game = createMockGame({ phase: GamePhase.WAVE })
      const enemy = createEnemy(EnemyType.BULWARK, linearPath())
      const before = enemy.hp
      applyDamage(enemy, 40, game, source)
      expect(before - enemy.hp).toBe(40)
    }
  })
})

describe('Swarmling — evasion applies to everything except pets', () => {
  it('a 10-damage towerHit reduces HP by 3.5 (towerDamageMult 0.35)', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const enemy = createEnemy(EnemyType.SWARMLING, linearPath())
    const before = enemy.hp
    applyDamage(enemy, 10, game, 'towerHit')
    expect(before - enemy.hp).toBeCloseTo(3.5, 5)
  })

  it('a 10-damage pet hit reduces HP by the full 10', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const enemy = createEnemy(EnemyType.SWARMLING, linearPath())
    const before = enemy.hp
    applyDamage(enemy, 10, game, 'pet')
    expect(before - enemy.hp).toBe(10)
  })
})

describe('Regenerator — out-heals sub-regen burst DPS, dies to one big hit', () => {
  it('sustained Radar-C-shape towerHit bursts below regenPerSec never bring HP to 0', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const enemy = createEnemy(EnemyType.REGENERATOR, linearPath())
    game.enemies.push(enemy)

    // Radar C shape: a discrete 40-damage towerHit every 2.5 s = 16 effective
    // DPS, below the 18/s regen. The discrete burst drops HP sharply, but the
    // regen out-paces it over each cooldown cycle, so HP never reaches 0.
    const RADAR_C_DAMAGE = 40
    const RADAR_C_CD_FRAMES = Math.round(2.5 / DT)
    for (let i = 0; i < 1200; i++) {
      if (i % RADAR_C_CD_FRAMES === 0) {
        applyDamage(enemy, RADAR_C_DAMAGE, game, 'towerHit')
      }
      sys.update(DT, game)
      expect(enemy.hp).toBeGreaterThan(0)
      expect(enemy.alive).toBe(true)
    }

    sys.destroy()
  })

  it('a single towerHit of enemy.hp magnitude kills it despite regen', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const enemy = createEnemy(EnemyType.REGENERATOR, linearPath())
    game.enemies.push(enemy)

    applyDamage(enemy, enemy.hp, game, 'towerHit')
    expect(enemy.hp).toBeLessThanOrEqual(0)
    expect(enemy.alive).toBe(false)
  })
})
