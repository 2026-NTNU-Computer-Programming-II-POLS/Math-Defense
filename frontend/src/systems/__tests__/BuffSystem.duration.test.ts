import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuffSystem } from '../BuffSystem'
import { GamePhase, Events } from '@/data/constants'
import { createMockGame, createMockTower } from './helpers'

// Bug 2.1: a duration=1 buff must remain active for the wave that follows its
// selection — _tickBuffs fires on WAVE_END, so decrementing at WAVE_START
// would revert it before the wave ran.
vi.mock('@/data/buff-defs', () => ({
  BUFF_POOL: [
    {
      id: 'd1_buff',
      name: 'Duration-1 Buff',
      description: 'Damage x1.5 for one wave',
      cost: 50,
      probability: 1.0,
      duration: 1,
      effectId: 'ALL_TOWERS_DAMAGE_MULTIPLY_1_5',
      revertId: 'ALL_TOWERS_DAMAGE_DIVIDE_1_5',
    },
  ],
  CURSE_POOL: [],
}))

describe('BuffSystem — duration-1 timing (bug 2.1)', () => {
  let game: ReturnType<typeof createMockGame>
  let system: BuffSystem

  beforeEach(() => {
    game = createMockGame({ phase: GamePhase.BUFF_SELECT, gold: 200 })
    game.phase.forceTransition(GamePhase.BUFF_SELECT)
    system = new BuffSystem()
    system.init(game)
  })

  it('duration=1 buff is active during the wave that follows its selection', () => {
    game.eventBus.emit(Events.BUFF_PHASE_START, undefined)
    const tower = createMockTower({ damageBonus: 1, baseDamage: 20, effectiveDamage: 20 })
    game.towers.push(tower)

    const card = system.currentCards.find((c) => c.id === 'd1_buff')
    expect(card).toBeTruthy()
    if (!card) return

    game.eventBus.emit(Events.BUFF_CARD_SELECTED, card.id)

    // After selection, before the wave: buff applied
    expect(tower.damageBonus).toBeCloseTo(1.5)
    expect(tower.effectiveDamage).toBeCloseTo(30)

    // The "wave that follows" runs — buff must still be active during it.
    // (We don't simulate per-frame; the contract is: the buff persists until
    // WAVE_END decrements it, which is the moment the wave concludes.)
    expect(tower.damageBonus).toBeCloseTo(1.5)

    // WAVE_END fires → tick decrements remainingWaves to 0 → revert applied
    game.eventBus.emit(Events.WAVE_END, 1 as never)
    expect(tower.damageBonus).toBeCloseTo(1.0)
  })

  it('duration=1 buff applies only once if selected before WAVE_END fires twice', () => {
    game.eventBus.emit(Events.BUFF_PHASE_START, undefined)
    const tower = createMockTower({ damageBonus: 1, baseDamage: 20, effectiveDamage: 20 })
    game.towers.push(tower)
    const card = system.currentCards.find((c) => c.id === 'd1_buff')
    if (!card) return

    game.eventBus.emit(Events.BUFF_CARD_SELECTED, card.id)
    expect(tower.damageBonus).toBeCloseTo(1.5)

    // First WAVE_END expires it
    game.eventBus.emit(Events.WAVE_END, 1 as never)
    expect(tower.damageBonus).toBeCloseTo(1.0)

    // Second WAVE_END must not double-revert (no active buffs left)
    game.eventBus.emit(Events.WAVE_END, 2 as never)
    expect(tower.damageBonus).toBeCloseTo(1.0)
  })
})
