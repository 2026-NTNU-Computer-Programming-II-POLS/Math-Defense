/**
 * V3 Phase 1 — de-fear the Limit tower. A wrong or degenerate limit answer
 * must never remove the tower, disable it, or heal enemies. Every outcome
 * resolves to a damage number; wrong/degenerate ones clamp to a weak chip.
 */
import { describe, it, expect } from 'vitest'
import { LimitTowerSystem, BURST_MULTIPLIER } from '../LimitTowerSystem'
import { Events, GamePhase, TowerType } from '@/data/constants'
import type { LimitOutcome, LimitResult } from '@/entities/types'
import { createMockGame, createMockTower, createMockEnemy } from './helpers'

const ALL_OUTCOMES: LimitOutcome[] = ['+inf', '+c', 'zero', 'constant', '-c', '-inf']

function resultFor(outcome: LimitOutcome): LimitResult {
  switch (outcome) {
    case '+inf': return { outcome, value: Infinity }
    case '-inf': return { outcome, value: -Infinity }
    case 'zero': return { outcome, value: 0 }
    case '+c': return { outcome, value: 3 }
    case '-c': return { outcome, value: -3 }
    case 'constant': return { outcome, value: 4 }
  }
}

describe('LimitTowerSystem — V3 de-fear', () => {
  it('keeps the tower alive and enabled for every outcome', () => {
    for (const outcome of ALL_OUTCOMES) {
      const game = createMockGame()
      const sys = new LimitTowerSystem()
      sys.init(game)

      const tower = createMockTower({ type: TowerType.LIMIT })
      game.towers.push(tower)

      game.eventBus.emit(Events.LIMIT_ANSWER, { towerId: tower.id, answer: resultFor(outcome) })

      expect(game.towers).toContain(tower)
      expect(tower.disabled).toBe(false)
      expect(tower.configured).toBe(true)
      expect(tower.limitResult).toEqual(resultFor(outcome))

      sys.destroy()
    }
  })

  it('never heals an enemy for -c or -inf answers', () => {
    for (const outcome of ['-c', '-inf'] as LimitOutcome[]) {
      const game = createMockGame({ phase: GamePhase.WAVE })
      const sys = new LimitTowerSystem()
      sys.init(game)

      const tower = createMockTower({ type: TowerType.LIMIT, limitResult: resultFor(outcome) })
      game.towers.push(tower)
      const enemy = createMockEnemy({ hp: 50, maxHp: 100 })
      game.enemies.push(enemy)

      sys.update(1, game)

      expect(enemy.hp).toBeLessThanOrEqual(50)

      sys.destroy()
    }
  })

  // Phase 6 Q8: every burst hit is multiplied by BURST_MULTIPLIER (1.5×).
  // The chip path is `effectiveDamage * 0.35 * 1.5 = 0.525 × effectiveDamage`
  // (chip floor raised 0.10 → 0.35).
  it('chip damage applies the burst multiplier (zero / constant / -c / -inf)', () => {
    for (const outcome of ['zero', 'constant', '-c', '-inf'] as LimitOutcome[]) {
      const game = createMockGame({ phase: GamePhase.WAVE })
      const sys = new LimitTowerSystem()
      sys.init(game)

      const tower = createMockTower({
        type: TowerType.LIMIT,
        limitResult: resultFor(outcome),
        effectiveDamage: 20,
      })
      game.towers.push(tower)
      const enemy = createMockEnemy({ hp: 100, maxHp: 100 })
      game.enemies.push(enemy)

      sys.update(1, game)

      // 20 * 0.35 * 1.5 = 10.5 chip damage per cooldown.
      expect(enemy.hp).toBeCloseTo(100 - 20 * 0.35 * BURST_MULTIPLIER, 5)

      sys.destroy()
    }
  })

  it('+inf still instantly kills and +c deals scaled × burst damage', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const sys = new LimitTowerSystem()
    sys.init(game)

    const killer = createMockTower({
      type: TowerType.LIMIT,
      limitResult: resultFor('+inf'),
      effectiveDamage: 20,
      x: 5, y: 5,
    })
    const scaler = createMockTower({
      type: TowerType.LIMIT,
      limitResult: resultFor('+c'),
      effectiveDamage: 20,
      x: 20, y: 5,
    })
    game.towers.push(killer, scaler)

    const nearKiller = createMockEnemy({ hp: 100, maxHp: 100, x: 5, y: 5 })
    const nearScaler = createMockEnemy({ hp: 200, maxHp: 200, x: 20, y: 5 })
    game.enemies.push(nearKiller, nearScaler)

    sys.update(1, game)

    expect(nearKiller.alive).toBe(false)
    // +c value 3 → base 20 * 3 = 60 damage; burst → 60 * 1.5 = 90.
    expect(nearScaler.hp).toBeCloseTo(200 - 60 * BURST_MULTIPLIER, 5)

    sys.destroy()
  })

  // Phase 6 Q8: pin the burst constant so anyone editing it has to update
  // this assertion deliberately. Also documents the multiplier intent.
  it('BURST_MULTIPLIER is the documented 1.5×', () => {
    expect(BURST_MULTIPLIER).toBe(1.5)
  })

  // Phase 7 (Q14) — `burst_bonus` talent additively raises the burst
  // multiplier (1.5 → up to 2.0 at lv 2). +inf instakills must still bypass.
  it('burst_bonus talent additively raises the burst multiplier', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const sys = new LimitTowerSystem()
    sys.init(game)

    const tower = createMockTower({
      type: TowerType.LIMIT,
      limitResult: resultFor('+c'),  // value=3
      effectiveDamage: 20,
      x: 0, y: 0,
      talentMods: { burst_bonus: 0.50 },  // 2 lv × 0.25 → mult = 2.0
    })
    game.towers.push(tower)
    const enemy = createMockEnemy({ hp: 200, maxHp: 200, x: 0, y: 0 })
    game.enemies.push(enemy)

    sys.update(1, game)

    // 20 (eff) × 3 (value) × 2.0 (burst+bonus) = 120 damage.
    expect(enemy.hp).toBeCloseTo(200 - 60 * 2.0, 5)
    sys.destroy()
  })

  it('burst_bonus does not leak into +inf instakill path', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const sys = new LimitTowerSystem()
    sys.init(game)

    const tower = createMockTower({
      type: TowerType.LIMIT,
      limitResult: resultFor('+inf'),
      effectiveDamage: 1,
      x: 0, y: 0,
      talentMods: { burst_bonus: 999 },  // absurd — instakill must still bypass
    })
    game.towers.push(tower)
    const enemy = createMockEnemy({ hp: 9999, maxHp: 9999, x: 0, y: 0 })
    game.enemies.push(enemy)

    sys.update(1, game)
    expect(enemy.alive).toBe(false)
    sys.destroy()
  })

  // Phase 6 Q8: +inf bypasses the multiplier path (it's an instakill via
  // killEnemy, not applyDamage), so the multiplier change must not leak in.
  it('+inf kills bypass damage scaling entirely', () => {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const sys = new LimitTowerSystem()
    sys.init(game)

    const tower = createMockTower({
      type: TowerType.LIMIT,
      limitResult: resultFor('+inf'),
      effectiveDamage: 1,  // intentionally trivial; multiplier must not matter
      x: 0, y: 0,
    })
    game.towers.push(tower)

    // High-HP enemy with full defensive mods — +inf must still drop it.
    const enemy = createMockEnemy({
      hp: 9999, maxHp: 9999, x: 0, y: 0,
      towerDamageMult: 0.01, damageCapPerHit: 1,
    })
    game.enemies.push(enemy)

    sys.update(1, game)

    expect(enemy.alive).toBe(false)
    sys.destroy()
  })
})
