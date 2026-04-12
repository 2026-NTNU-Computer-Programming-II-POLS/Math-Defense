import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuffSystem } from '../BuffSystem'
import { GamePhase, Events } from '@/data/constants'
import { createMockGame, createMockTower } from './helpers'

// Mock buff-defs with deterministic pools
vi.mock('@/data/buff-defs', () => ({
  BUFF_POOL: [
    {
      id: 'test_buff',
      name: 'Test Buff',
      description: 'Damage x1.5',
      cost: 50,
      probability: 1.0,
      duration: 2,
      effectId: 'ALL_TOWERS_DAMAGE_MULTIPLY_1_5',
      revertId: 'ALL_TOWERS_DAMAGE_DIVIDE_1_5',
    },
  ],
  CURSE_POOL: [
    {
      id: 'test_curse',
      name: 'Test Curse',
      description: 'Enemy speed x1.5',
      goldReward: 30,
      cost: 0,
      probability: 1.0,
      duration: 1,
      effectId: 'ENEMY_SPEED_MULTIPLIER_1_5',
      revertId: 'ENEMY_SPEED_MULTIPLIER_RESET',
    },
  ],
}))

describe('BuffSystem', () => {
  let game: ReturnType<typeof createMockGame>
  let system: BuffSystem

  beforeEach(() => {
    game = createMockGame({ phase: GamePhase.BUFF_SELECT, gold: 200 })
    game.phase.forceTransition(GamePhase.BUFF_SELECT)
    system = new BuffSystem()
    system.init(game)
  })

  it('draws 3 cards on BUFF_PHASE_START', () => {
    game.eventBus.emit(Events.BUFF_PHASE_START, undefined)
    expect(system.currentCards.length).toBe(3)
  })

  it('applies buff and deducts gold on card selection', () => {
    game.eventBus.emit(Events.BUFF_PHASE_START, undefined)

    const tower = createMockTower({ damageBonus: 1, baseDamage: 20, effectiveDamage: 20 })
    game.towers.push(tower)

    // Find the test_buff card
    const buffCard = system.currentCards.find((c) => c.id === 'test_buff')
    if (buffCard) {
      game.eventBus.emit(Events.BUFF_CARD_SELECTED, buffCard.id)
      expect(tower.damageBonus).toBeCloseTo(1.5)
      expect(tower.effectiveDamage).toBeCloseTo(30)
      expect(game.state.gold).toBe(150) // 200 - 50
    }
  })

  it('transitions to BUILD after card selection', () => {
    game.eventBus.emit(Events.BUFF_PHASE_START, undefined)
    const card = system.currentCards[0]
    game.eventBus.emit(Events.BUFF_CARD_SELECTED, card.id)
    expect(game.state.phase).toBe(GamePhase.BUILD)
  })

  it('skipping (invalid index) transitions to BUILD without applying', () => {
    game.eventBus.emit(Events.BUFF_PHASE_START, undefined)
    game.eventBus.emit(Events.BUFF_CARD_SELECTED, 'nonexistent_id')
    expect(game.state.phase).toBe(GamePhase.BUILD)
  })

  it('reverts buff after duration expires', () => {
    game.eventBus.emit(Events.BUFF_PHASE_START, undefined)

    const tower = createMockTower({ damageBonus: 1, baseDamage: 20, effectiveDamage: 20 })
    game.towers.push(tower)

    const buffCard = system.currentCards.find((c) => c.id === 'test_buff')
    if (buffCard) {
      game.eventBus.emit(Events.BUFF_CARD_SELECTED, buffCard.id)
      expect(tower.damageBonus).toBeCloseTo(1.5)

      // Tick 2 waves to expire the buff (duration = 2). Tick fires on WAVE_END so a
      // duration=1 buff lasts the wave it was selected for.
      game.eventBus.emit(Events.WAVE_END, 1 as never)
      expect(tower.damageBonus).toBeCloseTo(1.5) // still active after 1 wave

      game.eventBus.emit(Events.WAVE_END, 2 as never)
      expect(tower.damageBonus).toBeCloseTo(1.0) // reverted after 2 waves
    }
  })

  it('rejects buff when gold is insufficient', () => {
    game.state.gold = 10
    game.eventBus.emit(Events.BUFF_PHASE_START, undefined)

    // Wrap so closure mutation is visible to TS flow analysis
    const captured: { result: { success: boolean } | null } = { result: null }
    game.eventBus.on(Events.BUFF_RESULT, (r) => { captured.result = r as { success: boolean } })

    const buffCard = system.currentCards.find((c) => c.id === 'test_buff')
    if (buffCard) {
      game.eventBus.emit(Events.BUFF_CARD_SELECTED, buffCard.id)
      expect(captured.result?.success).toBe(false)
      expect(game.state.gold).toBe(10) // unchanged
    }
  })

  it('clears active buffs on LEVEL_START', () => {
    game.eventBus.emit(Events.BUFF_PHASE_START, undefined)
    const buffCard = system.currentCards.find((c) => c.id === 'test_buff')
    if (buffCard) {
      const tower = createMockTower({ damageBonus: 1, baseDamage: 20, effectiveDamage: 20 })
      game.towers.push(tower)
      game.eventBus.emit(Events.BUFF_CARD_SELECTED, buffCard.id)
      expect(tower.damageBonus).toBeCloseTo(1.5)

      game.eventBus.emit(Events.LEVEL_START, 1)
      expect(tower.damageBonus).toBeCloseTo(1.0) // reverted
    }
  })
})
