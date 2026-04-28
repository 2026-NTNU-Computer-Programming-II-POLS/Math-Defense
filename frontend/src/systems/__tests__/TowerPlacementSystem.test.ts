import { describe, it, expect, vi } from 'vitest'

vi.mock('@/entities/TowerFactory', () => ({
  createTower: (type: string, x: number, y: number) => ({
    id: `tower_${Math.random().toString(36).slice(2)}`,
    type, x, y, params: {}, cost: 50,
    active: true, configured: false, disabled: false, level: 1,
    effectiveDamage: 20, effectiveRange: 5, cooldown: 1.5, cooldownTimer: 0,
    damageBonus: 1, rangeBonus: 1, baseDamage: 20, baseRange: 5,
    talentMods: {}, magicBuff: 1,
    color: '#a855f7',
  }),
}))

vi.mock('@/domain/placement/legal-positions', () => ({
  computeLegalPositions: () => ({
    has: (gx: number, gy: number) => gx === 5 && gy === 5,
    positions: [[5, 5]],
  }),
}))

import { TowerPlacementSystem } from '../TowerPlacementSystem'
import { GamePhase, Events, TowerType } from '@/data/constants'
import type { LevelContext } from '@/engine/level-context'
import type { LevelLayoutService } from '@/domain/level/level-layout-service'
import { createMockGame } from './helpers'

function fakeLevelContext(): LevelContext {
  const layout: LevelLayoutService = {
    classify: () => 'buildable',
    pathCellCount: 0,
    buildableCellCount: 0,
  }
  return {
    layout,
    path: { segments: [], startX: 0, targetX: 0, evaluateAt: () => 0, findSegmentAt: () => null },
    tracker: { update: () => {}, dispose: () => {} },
    dispose: () => {},
  }
}

function setup() {
  const game = createMockGame({ phase: GamePhase.BUILD, gold: 200 })
  game.phase.forceTransition(GamePhase.BUILD)
  game.levelContext = fakeLevelContext()
  const system = new TowerPlacementSystem()
  system.init(game)
  system.getSelectedTowerType = () => TowerType.MAGIC
  system.clearSelectedTowerType = () => { system.getSelectedTowerType = () => null }
  game.eventBus.emit(Events.LEVEL_START, 1)
  return { game, system }
}

describe('TowerPlacementSystem', () => {
  it('places tower on legal position and deducts gold', () => {
    const { game } = setup()
    let placed = false
    game.eventBus.on(Events.TOWER_PLACED, () => { placed = true })

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 0, y: 0 },
      game: { x: 5, y: 5 },
    })

    expect(placed).toBe(true)
    expect(game.towers.length).toBe(1)
    expect(game.state.gold).toBe(150)
  })

  it('rejects placement on illegal position', () => {
    const { game } = setup()
    const rejections: unknown[] = []
    game.eventBus.on(Events.PLACEMENT_REJECTED, (p) => rejections.push(p))

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 0, y: 0 },
      game: { x: 3, y: 3 },
    })

    expect(game.towers.length).toBe(0)
    expect(rejections).toEqual([{ gx: 3, gy: 3, reason: 'not-buildable' }])
  })

  it('selects existing tower when clicking occupied position', () => {
    const { game } = setup()

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 0, y: 0 },
      game: { x: 5, y: 5 },
    })
    expect(game.towers.length).toBe(1)

    let selected = false
    game.eventBus.on(Events.TOWER_SELECTED, () => { selected = true })

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 0, y: 0 },
      game: { x: 5, y: 5 },
    })

    expect(selected).toBe(true)
  })

  it('rejects placement when gold is insufficient', () => {
    const { game } = setup()
    game.state.gold = 10
    const rejections: unknown[] = []
    game.eventBus.on(Events.PLACEMENT_REJECTED, (p) => rejections.push(p))

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 0, y: 0 },
      game: { x: 5, y: 5 },
    })

    expect(rejections).toEqual([{ gx: 5, gy: 5, reason: 'insufficient-gold' }])
  })
})
