/**
 * MovementSystem tests — covers the segmented-path pipeline that replaced
 * the legacy arc-length branch in Phase 7.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { GamePhase } from '@/data/constants'

import { MovementSystem } from '../MovementSystem'
import {
  registerStrategy,
  resetStrategyRegistry,
} from '@/domain/movement/movement-strategy-registry'
import type { MovementStrategy } from '@/domain/movement/movement-strategy'
import { createSegmentedPath, type PathSegmentRuntime } from '@/domain/path/segmented-path'
import { createPathProgressTracker } from '@/domain/path/path-progress-tracker'
import type { PathSegmentKind } from '@/data/path-segment-types'
import { createMockGame, createMockEnemy } from './helpers'

function makeSegment(
  id: string,
  kind: PathSegmentKind,
  xRange: [number, number],
  evaluate: (x: number) => number = () => 0,
): PathSegmentRuntime {
  const params =
    kind === 'horizontal'
      ? { kind: 'horizontal' as const, y: 0 }
      : kind === 'linear'
      ? { kind: 'linear' as const, slope: 0, intercept: 0 }
      : kind === 'quadratic'
      ? { kind: 'quadratic' as const, a: 0, b: 0, c: 0 }
      : kind === 'trigonometric'
      ? { kind: 'trigonometric' as const, amplitude: 0, frequency: 0, phase: 0, offset: 0 }
      : { kind: 'vertical' as const, x: xRange[0], yStart: 0, yEnd: 0, durationSec: 1 }
  return { id, kind, xRange, params, evaluate, expr: id, label: id }
}

function sceneWithTwoSegments() {
  const path = createSegmentedPath([
    makeSegment('left', 'linear', [0, 5], (x) => x),
    makeSegment('right', 'horizontal', [5, 10], () => 7),
  ])
  const events: Array<{ fromId: string | null; toId: string | null }> = []
  const tracker = createPathProgressTracker(path, (e) => events.push(e))
  const game = createMockGame({ phase: GamePhase.WAVE })
  game.phase.forceTransition(GamePhase.WAVE)
  game.levelContext = {
    path,
    tracker,
    layout: { classify: () => 'forbidden', pathCellCount: 0, buildableCellCount: 0 },
    dispose: () => {},
  }
  return { game, path, tracker, events }
}

describe('MovementSystem (segmented pipeline)', () => {
  afterEach(() => {
    resetStrategyRegistry()
  })

  it('dispatches advance to the strategy keyed by the current segment kind', () => {
    const calls: Array<{ kind: PathSegmentKind; dt: number; x: number }> = []
    const fakeFactory = (kind: PathSegmentKind): MovementStrategy => ({
      advance: (state, segment, dt) => {
        calls.push({ kind, dt, x: state.x })
        return { x: state.x - 1, y: segment.evaluate(state.x - 1), t: 0 }
      },
    })
    registerStrategy('linear', fakeFactory('linear'))
    registerStrategy('horizontal', fakeFactory('horizontal'))

    const { game } = sceneWithTwoSegments()
    const enemy = createMockEnemy({ _pathX: 8, x: 8, y: 7, _direction: -1, speed: 1 })
    game.enemies.push(enemy)

    const system = new MovementSystem()
    system.init(game)
    system.update(0.5, game)

    // First tick: enemy was at x=8 in the 'right' (horizontal) segment.
    expect(calls[0]?.kind).toBe('horizontal')
    expect(enemy.x).toBe(7)
    expect(enemy.y).toBe(7)
    expect(enemy._pathX).toBe(7)
  })

  it('writes x and y back to the enemy from the strategy result', () => {
    const advance = vi.fn(() => ({ x: 4, y: 2, t: 0 }))
    registerStrategy('linear', { advance })
    registerStrategy('horizontal', { advance })

    const { game } = sceneWithTwoSegments()
    const enemy = createMockEnemy({ _pathX: 8, x: 8, y: 7, _direction: -1 })
    game.enemies.push(enemy)

    const system = new MovementSystem()
    system.init(game)
    system.update(0.016, game)

    expect(enemy.x).toBe(4)
    expect(enemy.y).toBe(2)
    expect(advance).toHaveBeenCalledOnce()
  })

  it('feeds the lead-enemy x (minimum x) to the tracker after each tick', () => {
    // Fake strategy: no-op; positions are set directly.
    registerStrategy('linear', { advance: (s) => ({ ...s }) })
    registerStrategy('horizontal', { advance: (s) => ({ ...s }) })

    const { game, events } = sceneWithTwoSegments()
    const e1 = createMockEnemy({ _pathX: 8, x: 8, y: 7 })
    const e2 = createMockEnemy({ _pathX: 3, x: 3, y: 3 })
    game.enemies.push(e1, e2)

    const system = new MovementSystem()
    system.init(game)
    system.update(0.016, game)

    // Tracker saw the minimum x (3) → resolved to 'left' segment.
    expect(events).toEqual([{ fromId: null, toId: 'left' }])
  })

  it('emits one segment change per boundary crossed when a single enemy advances into a new segment', () => {
    // Use the real registry so segment/kind dispatch is realistic.
    registerStrategy('linear', {
      advance: (state, _seg, dt, ctx) => ({
        x: state.x + ctx.direction * ctx.speed * dt,
        y: 0,
        t: 0,
      }),
    })
    registerStrategy('horizontal', {
      advance: (state, _seg, dt, ctx) => ({
        x: state.x + ctx.direction * ctx.speed * dt,
        y: 0,
        t: 0,
      }),
    })

    const { game, events } = sceneWithTwoSegments()
    const enemy = createMockEnemy({
      _pathX: 6, x: 6, y: 7, speed: 4, _direction: -1,
    })
    game.enemies.push(enemy)

    const system = new MovementSystem()
    system.init(game)

    system.update(0.25, game) // x: 6 -> 5 (right -> left boundary)
    system.update(0.25, game) // x: 5 -> 4 (still inside left)

    expect(events).toEqual([
      { fromId: null, toId: 'right' },
      { fromId: 'right', toId: 'left' },
    ])
  })

  it('does not call advance or tracker.update outside the WAVE phase', () => {
    const advance = vi.fn((s) => s)
    registerStrategy('linear', { advance })
    registerStrategy('horizontal', { advance })

    const { game, events } = sceneWithTwoSegments()
    game.phase.forceTransition(GamePhase.BUILD)
    game.state.phase = GamePhase.BUILD
    const enemy = createMockEnemy({ _pathX: 3, x: 3, y: 3 })
    game.enemies.push(enemy)

    const system = new MovementSystem()
    system.init(game)
    system.update(0.016, game)

    expect(advance).not.toHaveBeenCalled()
    expect(events).toHaveLength(0)
  })

  it('is a no-op when levelContext is absent', () => {
    const advance = vi.fn((s) => s)
    registerStrategy('linear', { advance })
    registerStrategy('horizontal', { advance })

    const game = createMockGame({ phase: GamePhase.WAVE })
    game.phase.forceTransition(GamePhase.WAVE)
    game.levelContext = null
    const enemy = createMockEnemy({ _pathX: 6, x: 6, y: 0, speed: 2, _direction: -1 })
    game.enemies.push(enemy)

    const system = new MovementSystem()
    system.init(game)
    system.update(0.5, game)

    expect(advance).not.toHaveBeenCalled()
    expect(enemy._pathX).toBe(6)
  })
})
