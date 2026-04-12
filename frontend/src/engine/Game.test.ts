import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GamePhase, Events } from '@/data/constants'

// Mock Renderer/InputManager so we don't need a real canvas2d context
vi.mock('./Renderer', () => ({
  Renderer: class {
    constructor(public canvas: HTMLCanvasElement) {}
    clear(): void {}
    drawGrid(): void {}
    drawOrigin(): void {}
    drawFunction(): void {}
  },
}))
vi.mock('./InputManager', () => ({
  InputManager: class {
    constructor(public canvas: HTMLCanvasElement, public bus: unknown) {}
    destroy(): void {}
  },
}))

import { Game } from './Game'

describe('Game.startLevel', () => {
  let game: Game

  beforeEach(() => {
    const canvas = document.createElement('canvas')
    game = new Game(canvas)
  })

  it('transitions GAME_OVER → BUILD on retry (bug 2.3)', () => {
    // Simulate a defeat: phase ends in GAME_OVER
    game.phase.forceTransition(GamePhase.GAME_OVER)
    game.state.phase = GamePhase.GAME_OVER

    game.startLevel(1)

    expect(game.phase.current).toBe(GamePhase.BUILD)
    expect(game.state.phase).toBe(GamePhase.BUILD)
    expect(game.state.level).toBe(1)
  })

  it('resets state and entities on startLevel', () => {
    // Pollute pre-existing state
    game.state.score = 9999
    game.state.kills = 50
    game.state.gold = 1
    game.state.hp = 1
    game.towers.push({} as never)
    game.enemies.push({} as never)
    game.projectiles.push({} as never)

    game.startLevel(2)

    expect(game.state.score).toBe(0)
    expect(game.state.kills).toBe(0)
    expect(game.towers.length).toBe(0)
    expect(game.enemies.length).toBe(0)
    expect(game.projectiles.length).toBe(0)
    expect(game.state.level).toBe(2)
  })

  it('emits LEVEL_START with the level index', () => {
    let received: number | null = null
    game.eventBus.on(Events.LEVEL_START, (lv) => { received = lv as number })

    game.startLevel(3)
    expect(received).toBe(3)
  })

  it('startLevel works from mid-WAVE (early restart)', () => {
    game.phase.forceTransition(GamePhase.WAVE)
    game.state.phase = GamePhase.WAVE

    game.startLevel(1)
    expect(game.phase.current).toBe(GamePhase.BUILD)
  })
})
