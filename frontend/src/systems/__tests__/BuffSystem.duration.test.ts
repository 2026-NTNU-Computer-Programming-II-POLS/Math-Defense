import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuffSystem } from '../BuffSystem'
import { Events, GamePhase } from '@/data/constants'
import { createMockGame, createMockTower } from './helpers'

vi.mock('@/data/buff-defs', () => ({
  PURCHASABLE_BUFFS: [
    {
      id: 'short_buff',
      name: 'Short Buff',
      description: 'Damage x1.5 for 2s',
      category: 'tower',
      target: 'allTowers',
      cost: 50,
      duration: 2,
      effectId: 'ALL_TOWERS_DAMAGE_MULTIPLY_1_5',
      revertId: 'ALL_TOWERS_DAMAGE_DIVIDE_1_5',
    },
  ],
  BUFF_MAP: new Map(),
}))

describe('BuffSystem — time-based duration', () => {
  let game: ReturnType<typeof createMockGame>
  let system: BuffSystem

  beforeEach(() => {
    // Bug #5: BuffSystem.update only ticks during WAVE.
    game = createMockGame({ gold: 200, phase: GamePhase.WAVE })
    system = new BuffSystem()
    system.init(game)
  })

  it('buff persists until remainingTime reaches 0', () => {
    const tower = createMockTower({ damageBonus: 1, baseDamage: 20, effectiveDamage: 20 })
    game.towers.push(tower)

    game.eventBus.emit(Events.SHOP_PURCHASE, { itemId: 'short_buff', cost: 50 })
    expect(game.state.towerDamageBonus).toBeCloseTo(0.5)
    expect(tower.effectiveDamage).toBeCloseTo(30)

    system.update(1.5, game)
    expect(game.state.towerDamageBonus).toBeCloseTo(0.5)
    expect(game.state.activeBuffs).toHaveLength(1)
    expect(game.state.activeBuffs[0].remainingTime).toBeCloseTo(0.5)

    system.update(0.6, game)
    expect(game.state.towerDamageBonus).toBeCloseTo(0)
    expect(tower.effectiveDamage).toBeCloseTo(20)
    expect(game.state.activeBuffs).toHaveLength(0)
  })

  it('multiple update() calls do not double-revert after expiry', () => {
    const tower = createMockTower({ damageBonus: 1, baseDamage: 20, effectiveDamage: 20 })
    game.towers.push(tower)

    game.eventBus.emit(Events.SHOP_PURCHASE, { itemId: 'short_buff', cost: 50 })
    system.update(3, game) // expire
    expect(game.state.towerDamageBonus).toBeCloseTo(0)
    expect(tower.effectiveDamage).toBeCloseTo(20)

    system.update(1, game) // no buff to revert
    expect(game.state.towerDamageBonus).toBeCloseTo(0)
    expect(tower.effectiveDamage).toBeCloseTo(20)
  })

  it('emits ACTIVE_BUFFS_CHANGED when a buff expires', () => {
    const emitted: unknown[][] = []
    game.eventBus.on(Events.ACTIVE_BUFFS_CHANGED, (buffs) => { emitted.push(buffs as unknown[]) })

    game.eventBus.emit(Events.SHOP_PURCHASE, { itemId: 'short_buff', cost: 50 })
    expect(emitted).toHaveLength(1) // from purchase
    expect(emitted[0]).toHaveLength(1)

    system.update(3, game) // expire
    expect(emitted).toHaveLength(2) // from expiry
    expect(emitted[1]).toHaveLength(0)
  })

  it('emits BUFF_EXPIRED with the buff identity when the countdown hits zero', () => {
    const expired: { id: string; name: string; effectId: string }[] = []
    game.eventBus.on(Events.BUFF_EXPIRED, (p) => { expired.push(p) })

    game.eventBus.emit(Events.SHOP_PURCHASE, { itemId: 'short_buff', cost: 50 })
    system.update(1, game) // still active — no event yet
    expect(expired).toHaveLength(0)

    system.update(2, game) // crosses zero
    expect(expired).toHaveLength(1)
    expect(expired[0].name).toBe('Short Buff')
    expect(expired[0].effectId).toBe('ALL_TOWERS_DAMAGE_MULTIPLY_1_5')
  })
})
