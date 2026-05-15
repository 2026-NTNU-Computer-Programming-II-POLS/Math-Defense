/**
 * V3 Phase 1 — de-fear the Limit tower. A wrong or degenerate limit answer
 * must never remove the tower, disable it, or heal enemies. Every outcome
 * resolves to a damage number; wrong/degenerate ones clamp to a weak chip.
 */
import { describe, it, expect } from 'vitest'
import { LimitTowerSystem } from '../LimitTowerSystem'
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

  it('deals effectiveDamage * 0.10 chip damage for zero / constant / -c / -inf', () => {
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

      // 20 * 0.10 = 2 chip damage per cooldown.
      expect(enemy.hp).toBeCloseTo(98, 5)

      sys.destroy()
    }
  })

  it('+inf still instantly kills and +c still deals scaled damage', () => {
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
    const nearScaler = createMockEnemy({ hp: 100, maxHp: 100, x: 20, y: 5 })
    game.enemies.push(nearKiller, nearScaler)

    sys.update(1, game)

    expect(nearKiller.alive).toBe(false)
    // +c value 3 → 20 * 3 = 60 damage.
    expect(nearScaler.hp).toBeCloseTo(40, 5)

    sys.destroy()
  })
})
