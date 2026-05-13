/**
 * Pedagogical Backlog §25 — Boss-B chain-rule trigger HP fraction is sampled
 * uniformly per spawn from the configured triggerHpRange, using game.rng so
 * the draw is replayable. This pins:
 *   1. 100 spawns all land within [lo, hi] (no skips, no overshoot).
 *   2. Variation actually occurs across spawns (not all the same value).
 *   3. The same seed reproduces the same fraction (replay determinism).
 */
import { describe, it, expect } from 'vitest'
import { EnemyAbilitySystem } from '../EnemyAbilitySystem'
import { Events, EnemyType } from '@/data/constants'
import { ENEMY_DEFS } from '@/data/enemy-defs'
import { mulberry32 } from '@/math/MathUtils'
import { createMockGame, createMockEnemy } from './helpers'

function spawnAndCollect(seed: number, count: number): number[] {
  const game = createMockGame()
  game.rng = mulberry32(seed)

  const sys = new EnemyAbilitySystem()
  sys.init(game)

  const fractions: number[] = []
  for (let i = 0; i < count; i++) {
    const boss = createMockEnemy({ type: EnemyType.BOSS_B, hp: 600, maxHp: 600 })
    game.eventBus.emit(Events.ENEMY_SPAWNED, boss)
    fractions.push(boss.chainRuleTriggerFraction)
  }

  sys.destroy()
  return fractions
}

describe('§25 Boss-B trigger HP randomisation', () => {
  it('100 spawns all fall within the configured triggerHpRange', () => {
    const range = ENEMY_DEFS[EnemyType.BOSS_B].triggerHpRange
    expect(range).toBeDefined()
    const [lo, hi] = range!

    const fractions = spawnAndCollect(0xCAFEBABE, 100)
    for (const f of fractions) {
      expect(f).toBeGreaterThanOrEqual(lo)
      expect(f).toBeLessThanOrEqual(hi)
    }
  })

  it('produces variation across 10 spawns (not all identical)', () => {
    const fractions = spawnAndCollect(0xDEADBEEF, 10)
    const unique = new Set(fractions)
    // With a continuous uniform draw, 10 mulberry32 samples virtually never collide.
    expect(unique.size).toBeGreaterThan(1)
  })

  it('same seed reproduces the same first fraction (replay determinism)', () => {
    const a = spawnAndCollect(1234, 5)
    const b = spawnAndCollect(1234, 5)
    expect(a).toEqual(b)
  })

  it('non-Boss-B enemies do not get a trigger fraction sampled', () => {
    const game = createMockGame()
    game.rng = mulberry32(42)
    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const fast = createMockEnemy({ type: EnemyType.FAST })
    game.eventBus.emit(Events.ENEMY_SPAWNED, fast)
    expect(fast.chainRuleTriggerFraction).toBe(0)

    sys.destroy()
  })
})
