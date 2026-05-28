import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GamePhase, Events, FIXED_DT } from '@/data/constants'

// Mock Renderer/InputManager so we don't need a real canvas2d context
vi.mock('./Renderer', () => ({
  Renderer: class {
    canvas: HTMLCanvasElement
    constructor(canvas: HTMLCanvasElement) { this.canvas = canvas }
    clear(): void {}
    drawGrid(): void {}
    drawOrigin(): void {}
    drawFunction(): void {}
  },
}))
vi.mock('./InputManager', () => ({
  InputManager: class {
    canvas: HTMLCanvasElement
    bus: unknown
    constructor(canvas: HTMLCanvasElement, bus: unknown) {
      this.canvas = canvas
      this.bus = bus
    }
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

describe('Game perceived speed', () => {
  let game: Game
  let nowSpy: ReturnType<typeof vi.spyOn>
  let rafSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    const canvas = document.createElement('canvas')
    game = new Game(canvas)
    nowSpy = vi.spyOn(performance, 'now')
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  })

  it('runs extra fixed simulation steps during waves while advancing scoring time by the same simulated amount', () => {
    const update = vi.fn()
    game.addSystem('probe', { update })
    game.phase.forceTransition(GamePhase.WAVE)
    game.state.phase = GamePhase.WAVE
    game.setPerceivedSpeedMultiplier(2)

    const internals = game as unknown as { _running: boolean; _lastTime: number; _loop(): void }
    internals._running = true
    internals._lastTime = 0
    nowSpy.mockReturnValue(FIXED_DT * 1000)

    internals._loop()

    expect(update).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenNthCalledWith(1, FIXED_DT, game)
    expect(update).toHaveBeenNthCalledWith(2, FIXED_DT, game)
    expect(game.time).toBeCloseTo(FIXED_DT * 2)
    expect(rafSpy).toHaveBeenCalled()
  })

  it('does not speed up build phase timing', () => {
    const update = vi.fn()
    game.addSystem('probe', { update })
    game.phase.forceTransition(GamePhase.BUILD)
    game.state.phase = GamePhase.BUILD
    game.setPerceivedSpeedMultiplier(2)

    const internals = game as unknown as { _running: boolean; _lastTime: number; _loop(): void }
    internals._running = true
    internals._lastTime = 0
    nowSpy.mockReturnValue(FIXED_DT * 1000)

    internals._loop()

    expect(update).toHaveBeenCalledTimes(1)
    expect(game.time).toBeCloseTo(FIXED_DT)
  })

  it('stops perceived-speed sub-steps the moment a sub-step ends the wave', () => {
    // The wave-ending sub-step is legitimate WAVE time; the *extra* sub-step
    // must not run, or it would advance scored time into a non-WAVE phase.
    const update = vi.fn(() => { game.state.phase = GamePhase.BUILD })
    game.addSystem('probe', { update })
    game.phase.forceTransition(GamePhase.WAVE)
    game.state.phase = GamePhase.WAVE
    game.setPerceivedSpeedMultiplier(2)

    const internals = game as unknown as { _running: boolean; _lastTime: number; _loop(): void }
    internals._running = true
    internals._lastTime = 0
    nowSpy.mockReturnValue(FIXED_DT * 1000)

    internals._loop()

    expect(update).toHaveBeenCalledTimes(1)
    expect(game.time).toBeCloseTo(FIXED_DT)
  })

  it('runs three sub-steps per real-time tick at 3×', () => {
    const update = vi.fn()
    game.addSystem('probe', { update })
    game.phase.forceTransition(GamePhase.WAVE)
    game.state.phase = GamePhase.WAVE
    game.setPerceivedSpeedMultiplier(3)

    const internals = game as unknown as { _running: boolean; _lastTime: number; _loop(): void }
    internals._running = true
    internals._lastTime = 0
    nowSpy.mockReturnValue(FIXED_DT * 1000)

    internals._loop()

    expect(update).toHaveBeenCalledTimes(3)
    expect(game.time).toBeCloseTo(FIXED_DT * 3)
  })

  it('runs one sub-step every two real-time ticks at 0.5×', () => {
    const update = vi.fn()
    game.addSystem('probe', { update })
    game.phase.forceTransition(GamePhase.WAVE)
    game.state.phase = GamePhase.WAVE
    game.setPerceivedSpeedMultiplier(0.5)

    const internals = game as unknown as {
      _running: boolean; _lastTime: number; _loop(): void
    }
    internals._running = true
    internals._lastTime = 0

    // First real-time tick → 0.5 credit, no sub-step yet.
    nowSpy.mockReturnValue(FIXED_DT * 1000)
    internals._loop()
    expect(update).toHaveBeenCalledTimes(0)
    expect(game.time).toBe(0)

    // Second real-time tick → credit reaches 1.0, exactly one sub-step.
    internals._running = true
    nowSpy.mockReturnValue(FIXED_DT * 2000)
    internals._loop()
    expect(update).toHaveBeenCalledTimes(1)
    expect(game.time).toBeCloseTo(FIXED_DT)
  })

  it('rejects unsupported multiplier values by falling back to 1×', () => {
    game.setPerceivedSpeedMultiplier(2)
    expect(game.state.perceivedSpeedMultiplier).toBe(2)

    game.setPerceivedSpeedMultiplier(4)
    expect(game.state.perceivedSpeedMultiplier).toBe(1)

    game.setPerceivedSpeedMultiplier(0.5)
    expect(game.state.perceivedSpeedMultiplier).toBe(0.5)
  })
})
