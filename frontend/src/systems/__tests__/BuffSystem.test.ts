import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuffSystem } from '../BuffSystem'
import { Events } from '@/data/constants'
import { createMockGame, createMockTower } from './helpers'

vi.mock('@/data/buff-defs', () => ({
  PURCHASABLE_BUFFS: [
    {
      id: 'test_atk',
      name: 'Test Atk',
      description: '+20% damage 60s',
      category: 'tower',
      target: 'allTowers',
      cost: 50,
      duration: 60,
      effectId: 'ALL_TOWERS_DAMAGE_MULTIPLY_1_2',
      revertId: 'ALL_TOWERS_DAMAGE_DIVIDE_1_2',
    },
    {
      id: 'test_heal',
      name: 'Test Heal',
      description: 'Heal 5',
      category: 'defense',
      target: 'player',
      cost: 30,
      duration: 0,
      effectId: 'HEAL_5',
    },
  ],
  BUFF_MAP: new Map(),
}))

describe('BuffSystem (V2 shop-based)', () => {
  let game: ReturnType<typeof createMockGame>
  let system: BuffSystem

  beforeEach(() => {
    game = createMockGame({ gold: 200 })
    system = new BuffSystem()
    system.init(game)
  })

  it('purchases a buff: deducts gold, applies effect, tracks active buff', () => {
    const tower = createMockTower({ damageBonus: 1, baseDamage: 20, effectiveDamage: 20 })
    game.towers.push(tower)

    game.eventBus.emit(Events.SHOP_PURCHASE, { itemId: 'test_atk', cost: 50 })

    expect(game.state.gold).toBe(150)
    expect(game.state.costTotal).toBe(50)
    expect(tower.damageBonus).toBeCloseTo(1.2)
    expect(tower.effectiveDamage).toBeCloseTo(24)
    expect(game.state.activeBuffs).toHaveLength(1)
    expect(game.state.activeBuffs[0].remainingTime).toBe(60)
  })

  it('rejects purchase when gold is insufficient', () => {
    game.state.gold = 10
    game.eventBus.emit(Events.SHOP_PURCHASE, { itemId: 'test_atk', cost: 50 })

    expect(game.state.gold).toBe(10)
    expect(game.state.activeBuffs).toHaveLength(0)
  })

  it('instant buff (duration=0) does not track in activeBuffs', () => {
    game.eventBus.emit(Events.SHOP_PURCHASE, { itemId: 'test_heal', cost: 30 })

    expect(game.state.gold).toBe(170)
    expect(game.state.activeBuffs).toHaveLength(0)
  })

  it('reverts buff when time expires via update()', () => {
    const tower = createMockTower({ damageBonus: 1, baseDamage: 20, effectiveDamage: 20 })
    game.towers.push(tower)

    game.eventBus.emit(Events.SHOP_PURCHASE, { itemId: 'test_atk', cost: 50 })
    expect(tower.damageBonus).toBeCloseTo(1.2)

    system.update(59, game)
    expect(tower.damageBonus).toBeCloseTo(1.2)
    expect(game.state.activeBuffs).toHaveLength(1)

    system.update(2, game)
    expect(tower.damageBonus).toBeCloseTo(1.0)
    expect(game.state.activeBuffs).toHaveLength(0)
  })

  it('clears all active buffs and reverts on LEVEL_START', () => {
    const tower = createMockTower({ damageBonus: 1, baseDamage: 20, effectiveDamage: 20 })
    game.towers.push(tower)

    game.eventBus.emit(Events.SHOP_PURCHASE, { itemId: 'test_atk', cost: 50 })
    expect(tower.damageBonus).toBeCloseTo(1.2)

    game.eventBus.emit(Events.LEVEL_START, 1)
    expect(tower.damageBonus).toBeCloseTo(1.0)
    expect(game.state.activeBuffs).toHaveLength(0)
  })

  it('applyExternalBuff adds a timed buff from outside the shop', () => {
    const tower = createMockTower({ damageBonus: 1, baseDamage: 20, effectiveDamage: 20 })
    game.towers.push(tower)

    system.applyExternalBuff(
      'ALL_TOWERS_DAMAGE_MULTIPLY_1_5',
      'ALL_TOWERS_DAMAGE_DIVIDE_1_5',
      10,
      'Test External',
      game,
    )

    expect(tower.damageBonus).toBeCloseTo(1.5)
    expect(game.state.activeBuffs).toHaveLength(1)

    system.update(11, game)
    expect(tower.damageBonus).toBeCloseTo(1.0)
  })
})
