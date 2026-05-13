import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TowerUpgradeSystem } from '../TowerUpgradeSystem'
import { Events, TowerType } from '@/data/constants'
import { createMockGame, createMockTower } from './helpers'

vi.mock('@/data/tower-defs', () => ({
  TOWER_DEFS: {
    magic: {
      type: 'magic',
      cost: 100,
      cooldown: 1.5,
      upgrades: [
        { costPercent: 0.6, damageBonus: 0.25, rangeBonus: 0.1, speedBonus: 0 },
        { costPercent: 1.0, damageBonus: 0.5, rangeBonus: 0.2, speedBonus: 0.15 },
      ],
    },
  },
}))

describe('TowerUpgradeSystem', () => {
  let game: ReturnType<typeof createMockGame>
  let system: TowerUpgradeSystem

  beforeEach(() => {
    game = createMockGame({ gold: 300 })
    system = new TowerUpgradeSystem()
    system.init(game)
  })

  // ── _upgrade (H3: addCost was missing) ──────────────────────────────────────

  describe('_upgrade', () => {
    it('adds upgrade cost to costTotal alongside deducting gold', () => {
      const tower = createMockTower({ type: TowerType.MAGIC, cost: 100, level: 1 })
      game.towers.push(tower)
      game.state.costTotal = 100 // placement already tracked

      game.eventBus.emit(Events.TOWER_UPGRADE, { towerId: tower.id })

      // tier 1 cost = round(100 * 0.6) = 60
      expect(game.state.gold).toBe(240)
      expect(game.state.costTotal).toBe(160)
    })

    it('accumulates upgradeSpend across consecutive upgrades', () => {
      const tower = createMockTower({ type: TowerType.MAGIC, cost: 100, level: 1 })
      game.towers.push(tower)

      // tier 1: cost = 60
      game.eventBus.emit(Events.TOWER_UPGRADE, { towerId: tower.id })
      // tier 2: cost = round(100 * 1.0) = 100
      game.eventBus.emit(Events.TOWER_UPGRADE, { towerId: tower.id })

      expect(tower.upgradeSpend).toBe(160) // 60 + 100
      expect(game.state.costTotal).toBe(160)
      expect(game.state.gold).toBe(140) // 300 - 60 - 100
    })

    it('emits TOWER_UPGRADED after a successful upgrade', () => {
      const tower = createMockTower({ type: TowerType.MAGIC, cost: 100, level: 1 })
      game.towers.push(tower)

      const events: string[] = []
      game.eventBus.on(Events.TOWER_UPGRADED, () => events.push('upgraded'))

      game.eventBus.emit(Events.TOWER_UPGRADE, { towerId: tower.id })

      expect(events).toHaveLength(1)
    })

    it('does nothing when gold is insufficient', () => {
      game.state.gold = 10
      const tower = createMockTower({ type: TowerType.MAGIC, cost: 100, level: 1 })
      game.towers.push(tower)

      game.eventBus.emit(Events.TOWER_UPGRADE, { towerId: tower.id })

      expect(game.state.gold).toBe(10)
      expect(game.state.costTotal).toBe(0)
      expect(tower.level).toBe(1)
    })

    it('does nothing when tower is already at max tier', () => {
      // Level 3 means both tiers already used (upgrades array has 2 entries)
      const tower = createMockTower({ type: TowerType.MAGIC, cost: 100, level: 3 })
      game.towers.push(tower)

      game.eventBus.emit(Events.TOWER_UPGRADE, { towerId: tower.id })

      expect(game.state.gold).toBe(300)
      expect(game.state.costTotal).toBe(0)
    })
  })

  // ── _refund (H2: addCost(-refund) was missing) ───────────────────────────────

  describe('_refund', () => {
    it('deducts refund amount from costTotal for a plain un-upgraded tower', () => {
      const tower = createMockTower({ type: TowerType.MAGIC, cost: 100, level: 1 })
      game.towers.push(tower)
      game.state.costTotal = 100

      game.eventBus.emit(Events.TOWER_REFUND, { towerId: tower.id })

      // refund = floor(100/2) + floor(0/2) = 50; goldMultiplier = 1
      expect(game.state.gold).toBe(350)
      expect(game.state.costTotal).toBe(50)
    })

    it('includes upgradeSpend in the refund formula and reduces costTotal accordingly', () => {
      const tower = createMockTower({ type: TowerType.MAGIC, cost: 100, level: 2, upgradeSpend: 60 })
      game.towers.push(tower)
      game.state.costTotal = 160 // 100 placement + 60 upgrade

      game.eventBus.emit(Events.TOWER_REFUND, { towerId: tower.id })

      // refund = floor(100/2) + floor(60/2) = 50 + 30 = 80
      expect(game.state.gold).toBe(380)
      expect(game.state.costTotal).toBe(80)
    })

    it('removes the tower from game.towers', () => {
      const tower = createMockTower({ type: TowerType.MAGIC, cost: 100, level: 1 })
      game.towers.push(tower)

      game.eventBus.emit(Events.TOWER_REFUND, { towerId: tower.id })

      expect(game.towers).toHaveLength(0)
    })

    it('applies goldMultiplier to the refund amount', () => {
      game.state.goldMultiplier = 2
      const tower = createMockTower({ type: TowerType.MAGIC, cost: 100, level: 1 })
      game.towers.push(tower)
      game.state.costTotal = 100

      game.eventBus.emit(Events.TOWER_REFUND, { towerId: tower.id })

      // base = 50, refund = round(50 * 2) = 100
      expect(game.state.gold).toBe(400)
      expect(game.state.costTotal).toBe(0) // 100 - 100
    })

    it('emits TOWER_REFUND_RESULT success when tower exists', () => {
      const tower = createMockTower({ type: TowerType.MAGIC, cost: 100, level: 1 })
      game.towers.push(tower)

      const results: unknown[] = []
      game.eventBus.on(Events.TOWER_REFUND_RESULT, (p) => results.push(p))

      game.eventBus.emit(Events.TOWER_REFUND, { towerId: tower.id })

      expect(results).toEqual([{ success: true, towerId: tower.id }])
    })

    it('emits TOWER_REFUND_RESULT failure and leaves state untouched when tower not found', () => {
      game.state.costTotal = 50

      const results: unknown[] = []
      game.eventBus.on(Events.TOWER_REFUND_RESULT, (p) => results.push(p))

      game.eventBus.emit(Events.TOWER_REFUND, { towerId: 'ghost-id' })

      expect(results).toEqual([{ success: false }])
      expect(game.state.gold).toBe(300)
      expect(game.state.costTotal).toBe(50)
    })
  })

  // ── upgrade → refund net accounting ─────────────────────────────────────────

  describe('upgrade then refund', () => {
    it('costTotal reflects net spend: placement + upgrade costs minus refund', () => {
      const tower = createMockTower({ type: TowerType.MAGIC, cost: 100, level: 1 })
      game.towers.push(tower)
      game.state.costTotal = 100 // placement tracked externally

      game.eventBus.emit(Events.TOWER_UPGRADE, { towerId: tower.id }) // +60 cost
      expect(game.state.costTotal).toBe(160)

      game.eventBus.emit(Events.TOWER_REFUND, { towerId: tower.id })
      // refund = floor(100/2) + floor(60/2) = 80; net gold: 300 - 60 + 80 = 320
      expect(game.state.costTotal).toBe(80)
      expect(game.state.gold).toBe(320)
    })
  })
})
