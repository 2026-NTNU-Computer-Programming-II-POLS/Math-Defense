import { describe, it, expect, vi } from 'vitest'

vi.mock('@/entities/TowerFactory', () => ({
  createTower: (type: string, x: number, y: number) => ({
    id: `tower_${Math.random().toString(36).slice(2)}`,
    type, x, y, params: {}, cost: 50,
    active: true, configured: false, disabled: false, level: 1,
    effectiveDamage: 20, effectiveRange: 5, cooldown: 1.5, cooldownTimer: 0,
    damageBonus: 1, rangeBonus: 1, baseDamage: 20, baseRange: 5,
    talentMods: {}, magicBuff: 1, interferenceFactor: 1,
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
import type { GeneratedLevelContext } from '@/engine/generated-level-context'
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

function fakeGeneratedContext(): GeneratedLevelContext {
  return {
    ...fakeLevelContext(),
    isGenerated: true,
    paths: [],
    endpoint: { x: 0, y: 0 },
    region: {} as GeneratedLevelContext['region'],
    spawns: [],
    decoyCells: [],
  } as unknown as GeneratedLevelContext
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

describe('TowerPlacementSystem — hover cursor concealment (paths hidden)', () => {
  function setupGenerated(pathsVisible: boolean) {
    const { game, system } = setup()
    game.levelContext = fakeGeneratedContext()
    game.state.pathsVisible = pathsVisible
    game.eventBus.emit(Events.LEVEL_START, 1)
    const drawPlacementCursor = vi.fn()
    const renderer = { drawPlacementCursor } as unknown as import('@/engine/Renderer').Renderer
    return { game, system, renderer, drawPlacementCursor }
  }

  function hoverAndRender(
    s: ReturnType<typeof setupGenerated>,
    gx: number,
    gy: number,
  ): void {
    s.game.eventBus.emit(Events.CANVAS_HOVER, {
      pixel: { x: 0, y: 0 },
      game: { x: gx, y: gy },
    })
    s.system.render(s.renderer, s.game)
  }

  it('draws a neutral cursor on every cell while paths are hidden', () => {
    const s = setupGenerated(false)
    hoverAndRender(s, 5, 5) // legal in the mocked LegalPositionSet
    expect(s.drawPlacementCursor).toHaveBeenLastCalledWith(5, 5, 'neutral')
    hoverAndRender(s, 3, 3) // blocked in the mocked LegalPositionSet
    expect(s.drawPlacementCursor).toHaveBeenLastCalledWith(3, 3, 'neutral')
  })

  it('keeps the legality colours when paths are visible', () => {
    const s = setupGenerated(true)
    hoverAndRender(s, 5, 5)
    expect(s.drawPlacementCursor).toHaveBeenLastCalledWith(5, 5, 'buildable')
    hoverAndRender(s, 3, 3)
    expect(s.drawPlacementCursor).toHaveBeenLastCalledWith(3, 3, 'forbidden')
  })

  it('still marks occupied cells as forbidden while paths are hidden', () => {
    const s = setupGenerated(false)
    // Hover first (no tower there yet → _hoveredTower stays null), then place
    // a tower at the same cell. The next render sees an occupied hovered cell
    // without the hovered-tower early return.
    s.game.eventBus.emit(Events.CANVAS_HOVER, {
      pixel: { x: 0, y: 0 },
      game: { x: 5, y: 5 },
    })
    s.game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 0, y: 0 },
      game: { x: 5, y: 5 },
    })
    expect(s.game.towers.length).toBe(1)
    // Placing cleared the held tower type; re-arm it so render draws a cursor.
    s.system.getSelectedTowerType = () => TowerType.MAGIC
    s.system.render(s.renderer, s.game)
    expect(s.drawPlacementCursor).toHaveBeenLastCalledWith(5, 5, 'forbidden')
  })
})
