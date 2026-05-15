/**
 * Pedagogical Backlog §25 — Boss-B chain-rule trigger HP fraction is sampled
 * uniformly per spawn from the configured triggerHpRange, using game.rng so
 * the draw is replayable. This pins:
 *   1. 100 spawns all land within [lo, hi] (no skips, no overshoot).
 *   2. Variation actually occurs across spawns (not all the same value).
 *   3. The same seed reproduces the same fraction (replay determinism).
 *
 * V3 Phase 3 — Regenerator constant HP regen tick.
 */
import { describe, it, expect } from 'vitest'
import { EnemyAbilitySystem } from '../EnemyAbilitySystem'
import { Events, EnemyType, GamePhase } from '@/data/constants'
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

describe('V3 Phase 3 — Regenerator regen tick', () => {
  const DT = 1 / 60

  it('a Regenerator below maxHp regains regenPerSec * dt per update', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const enemy = createMockEnemy({
      type: EnemyType.REGENERATOR, hp: 40, maxHp: 80, regenPerSec: 18,
    })
    game.enemies.push(enemy)

    sys.update(DT, game)
    expect(enemy.hp).toBeCloseTo(40 + 18 * DT, 4)

    sys.destroy()
  })

  it('regen is clamped at maxHp and never overshoots', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const enemy = createMockEnemy({
      type: EnemyType.REGENERATOR, hp: 79.9, maxHp: 80, regenPerSec: 18,
    })
    game.enemies.push(enemy)

    sys.update(DT, game)
    expect(enemy.hp).toBe(80)

    sys.destroy()
  })

  it('regen still ticks on the frame after the enemy took damage (no interruption)', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const enemy = createMockEnemy({
      type: EnemyType.REGENERATOR, hp: 80, maxHp: 80, regenPerSec: 18,
    })
    game.enemies.push(enemy)

    // Simulate a hit landing this frame, then the ability tick running.
    enemy.hp = 50
    sys.update(DT, game)
    expect(enemy.hp).toBeCloseTo(50 + 18 * DT, 4)

    sys.destroy()
  })

  it('a general enemy (regenPerSec 0) never regenerates', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const enemy = createMockEnemy({ type: EnemyType.GENERAL, hp: 50, maxHp: 100 })
    game.enemies.push(enemy)

    sys.update(DT, game)
    expect(enemy.hp).toBe(50)

    sys.destroy()
  })

  it('does not regen outside the WAVE phase', () => {
    const game = createMockGame({ phase: GamePhase.BUILD })
    const sys = new EnemyAbilitySystem()
    sys.init(game)

    const enemy = createMockEnemy({
      type: EnemyType.REGENERATOR, hp: 40, maxHp: 80, regenPerSec: 18,
    })
    game.enemies.push(enemy)

    sys.update(DT, game)
    expect(enemy.hp).toBe(40)

    sys.destroy()
  })
})
