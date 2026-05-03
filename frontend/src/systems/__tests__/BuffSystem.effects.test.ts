import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuffSystem } from '../BuffSystem'
import { Events } from '@/data/constants'
import { createMockGame, createMockTower } from './helpers'

vi.mock('@/data/buff-defs', () => ({
  PURCHASABLE_BUFFS: [
    {
      id: 'refund_last',
      name: 'Refund Last Tower',
      description: 'Returns the gold cost of the last placed tower',
      category: 'tower',
      target: 'player',
      cost: 50,
      duration: 0,
      effectId: 'REFUND_LAST_TOWER',
    },
  ],
  BUFF_MAP: new Map(),
}))

describe('BuffSystem — REFUND_LAST_TOWER effect (H4 fix)', () => {
  let game: ReturnType<typeof createMockGame>
  let system: BuffSystem

  beforeEach(() => {
    game = createMockGame({ gold: 300 })
    system = new BuffSystem()
    system.init(game)
  })

  it('returns tower placement cost as gold and removes it from costTotal', () => {
    const tower = createMockTower({ cost: 100 })
    game.towers.push(tower)
    game.state.costTotal = 150 // placement (100) + something else (50)

    game.eventBus.emit(Events.SHOP_PURCHASE, { itemId: 'refund_last', cost: 50 })

    // gold:     300 - 50 (buff) + 100 (tower refund) = 350
    // costTotal: 150 + 50 (buff) - 100 (tower refund) = 100
    expect(game.state.gold).toBe(350)
    expect(game.state.costTotal).toBe(100)
  })

  it('keeps the tower in game.towers after the refund', () => {
    const tower = createMockTower({ cost: 100 })
    game.towers.push(tower)

    game.eventBus.emit(Events.SHOP_PURCHASE, { itemId: 'refund_last', cost: 50 })

    expect(game.towers).toHaveLength(1)
    expect(game.towers[0].id).toBe(tower.id)
  })

  it('targets the last tower in the array', () => {
    const first = createMockTower({ cost: 80 })
    const last = createMockTower({ cost: 120 })
    game.towers.push(first, last)
    game.state.costTotal = 200

    game.eventBus.emit(Events.SHOP_PURCHASE, { itemId: 'refund_last', cost: 50 })

    // Only last.cost (120) is refunded, not first.cost (80)
    expect(game.state.gold).toBe(300 - 50 + 120)
    expect(game.state.costTotal).toBe(200 + 50 - 120)
  })

  it('is a no-op on costTotal and gold (beyond buff cost) when towers array is empty', () => {
    game.state.costTotal = 0
    expect(game.towers).toHaveLength(0)

    game.eventBus.emit(Events.SHOP_PURCHASE, { itemId: 'refund_last', cost: 50 })

    // Only the buff purchase cost is deducted; no tower to refund
    expect(game.state.gold).toBe(250)
    expect(game.state.costTotal).toBe(50)
  })
})
