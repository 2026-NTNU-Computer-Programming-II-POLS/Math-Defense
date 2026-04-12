import { describe, it, expect, vi } from 'vitest'
import { TowerPlacementSystem } from '../TowerPlacementSystem'
import { GamePhase, Events, TowerType } from '@/data/constants'
import { createMockGame, createMockTower } from './helpers'

// Mock TowerFactory
vi.mock('@/entities/TowerFactory', () => ({
  createTower: (type: string, x: number, y: number) => ({
    id: `tower_${Date.now()}`,
    type,
    x,
    y,
    params: {},
    cost: 50,
    active: true,
    configured: false,
    disabled: false,
    level: 1,
    effectiveDamage: 20,
    effectiveRange: 5,
    cooldown: 1.5,
    cooldownTimer: 0,
    damageBonus: 1,
    rangeBonus: 1,
    baseDamage: 20,
    baseRange: 5,
    color: '#4a82c8',
  }),
}))

vi.mock('@/math/MathUtils', () => ({
  degToRad: (deg: number) => (deg * Math.PI) / 180,
}))

describe('TowerPlacementSystem', () => {
  function setup() {
    const game = createMockGame({ phase: GamePhase.BUILD, gold: 200 })
    game.phase.forceTransition(GamePhase.BUILD)
    const system = new TowerPlacementSystem()
    system.init(game)
    return { game, system }
  }

  /** Helper: set the selected tower type (simulates uiStore injection) */
  function selectType(system: TowerPlacementSystem, type: typeof TowerType[keyof typeof TowerType] | null) {
    system.getSelectedTowerType = () => type
    system.clearSelectedTowerType = () => { system.getSelectedTowerType = () => null }
  }

  it('places tower on CANVAS_CLICK when tower type is selected', () => {
    const { game, system } = setup()
    selectType(system, TowerType.FUNCTION_CANNON)

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 200, y: 200 },
      game: { x: 5, y: 5 },
    })

    expect(game.towers.length).toBe(1)
    expect(game.towers[0].type).toBe(TowerType.FUNCTION_CANNON)
    expect(game.state.gold).toBe(150) // 200 - 50
  })

  it('does not place tower without selected type', () => {
    const { game } = setup()
    // getSelectedTowerType returns null by default

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 200, y: 200 },
      game: { x: 5, y: 5 },
    })

    expect(game.towers.length).toBe(0)
  })

  it('does not place tower with insufficient gold', () => {
    const { game, system } = setup()
    game.state.gold = 10
    selectType(system, TowerType.FUNCTION_CANNON)

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 200, y: 200 },
      game: { x: 5, y: 5 },
    })

    expect(game.towers.length).toBe(0)
    expect(game.state.gold).toBe(10)
  })

  it('does not place tower on occupied cell', () => {
    const { game, system } = setup()
    game.towers.push(createMockTower({ x: 5, y: 5 }))
    selectType(system, TowerType.FUNCTION_CANNON)

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 200, y: 200 },
      game: { x: 5, y: 5 },
    })

    expect(game.towers.length).toBe(1) // still just the existing one
  })

  it('selects existing tower when clicking on it', () => {
    const { game } = setup()
    const existing = createMockTower({ x: 5, y: 5 })
    game.towers.push(existing)

    let selected: unknown = null
    game.eventBus.on(Events.TOWER_SELECTED, (t) => { selected = t })

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 200, y: 200 },
      game: { x: 5, y: 5 },
    })

    expect(selected).toBe(existing)
  })

  it('emits TOWER_PLACED on successful placement', () => {
    const { game, system } = setup()
    selectType(system, TowerType.FUNCTION_CANNON)

    let placed = false
    game.eventBus.on(Events.TOWER_PLACED, () => { placed = true })

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 200, y: 200 },
      game: { x: 5, y: 5 },
    })

    expect(placed).toBe(true)
  })

  it('clears selectedTowerType after placement', () => {
    const { game, system } = setup()
    selectType(system, TowerType.FUNCTION_CANNON)

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 200, y: 200 },
      game: { x: 5, y: 5 },
    })

    expect(system.getSelectedTowerType()).toBeNull()
  })

  it('uses free tower when freeTowerNext is true', () => {
    const { game, system } = setup()
    game.state.freeTowerNext = true
    selectType(system, TowerType.FUNCTION_CANNON)

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 200, y: 200 },
      game: { x: 5, y: 5 },
    })

    expect(game.towers.length).toBe(1)
    expect(game.state.gold).toBe(200) // no gold spent
    expect(game.state.freeTowerNext).toBe(false)
  })

  it('does not place tower outside BUILD phase', () => {
    const game = createMockGame({ phase: GamePhase.WAVE, gold: 200 })
    game.phase.forceTransition(GamePhase.WAVE)
    const system = new TowerPlacementSystem()
    system.init(game)
    selectType(system, TowerType.FUNCTION_CANNON)

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 200, y: 200 },
      game: { x: 5, y: 5 },
    })

    expect(game.towers.length).toBe(0)
  })
})
