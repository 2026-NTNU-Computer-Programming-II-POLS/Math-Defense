/**
 * EndpointFXSystem tests — verify the hit-FX lifecycle wired to
 * Events.ENEMY_REACHED_ORIGIN and the per-style resolution including the
 * `'random'` branch (must use game.rng for replay determinism).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { EndpointFXSystem } from '../EndpointFXSystem'
import { Events } from '@/data/constants'
import { createMockGame, createMockEnemy } from './helpers'
import type { Game } from '@/engine/Game'

// Minimal stub the system reads via isGeneratedLevelContext (it checks for
// a non-null `endpoint`). Matches the structural shape used at Game.ts:653.
function attachGeneratedContext(game: Game, endpoint = { x: 1, y: 2 }): void {
  ;(game as unknown as { levelContext: unknown }).levelContext = {
    isGenerated: true,
    path: { segments: [] },
    paths: [],
    endpoint,
    tracker: {},
    dispose: () => {},
  }
}

function setupSystem(game: Game): EndpointFXSystem {
  // pathsVisible defaults to false; the system suppresses FX when paths are
  // hidden so tests must opt in.
  game.state.pathsVisible = true
  attachGeneratedContext(game)
  // The mock game omits endpointFx/endpointMarker; install the engine defaults.
  ;(game as unknown as { endpointFx: { style: string } }).endpointFx = { style: 'fragments' }
  ;(game as unknown as { endpointMarker: unknown }).endpointMarker = {
    style: 'star', customImage: null,
  }
  const system = new EndpointFXSystem()
  system.init(game)
  return system
}

function effectsOf(system: EndpointFXSystem): ReadonlyArray<{ kind: string; age: number; maxAge: number }> {
  return (system as unknown as {
    effects: ReadonlyArray<{ kind: string; age: number; maxAge: number }>
  }).effects
}

describe('EndpointFXSystem', () => {
  let game: ReturnType<typeof createMockGame>

  beforeEach(() => {
    game = createMockGame()
  })

  it('spawns a hit FX when an enemy reaches the origin', () => {
    const system = setupSystem(game)
    expect(effectsOf(system).length).toBe(0)

    game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, createMockEnemy())

    expect(effectsOf(system).length).toBe(1)
    expect(effectsOf(system)[0].kind).toBe('fragments')
  })

  it('suppresses FX when the marker is hidden (paths invisible)', () => {
    const system = setupSystem(game)
    game.state.pathsVisible = false

    game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, createMockEnemy())

    expect(effectsOf(system).length).toBe(0)
  })

  it('does nothing when the level context is not a generated level', () => {
    const system = setupSystem(game)
    ;(game as unknown as { levelContext: unknown }).levelContext = null

    game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, createMockEnemy())

    expect(effectsOf(system).length).toBe(0)
  })

  it('drops effects after their lifetime via update(dt)', () => {
    const system = setupSystem(game)
    game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, createMockEnemy())
    expect(effectsOf(system).length).toBe(1)

    // 0.55s maxAge — one tick past it should drop the entry.
    system.update(0.6, game)

    expect(effectsOf(system).length).toBe(0)
  })

  it('clears in-flight effects on LEVEL_START', () => {
    const system = setupSystem(game)
    game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, createMockEnemy())
    expect(effectsOf(system).length).toBe(1)

    game.eventBus.emit(Events.LEVEL_START, 1)

    expect(effectsOf(system).length).toBe(0)
  })

  it("resolves 'random' to one of fragments / crying / angry via game.rng", () => {
    const system = setupSystem(game)
    ;(game as unknown as { endpointFx: { style: string } }).endpointFx = { style: 'random' }

    // game.rng controls the index — 0 → fragments, 0.5 → crying, 0.99 → angry.
    const cases: ReadonlyArray<{ rng: number; expected: string }> = [
      { rng: 0.0, expected: 'fragments' },
      { rng: 0.5, expected: 'crying' },
      { rng: 0.99, expected: 'angry' },
    ]
    for (const { rng, expected } of cases) {
      game.rng = () => rng
      game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, createMockEnemy())
      const last = effectsOf(system)[effectsOf(system).length - 1]
      expect(last.kind).toBe(expected)
    }
  })

  it("passes through a concrete style unchanged ('angry' stays 'angry')", () => {
    const system = setupSystem(game)
    ;(game as unknown as { endpointFx: { style: string } }).endpointFx = { style: 'angry' }

    game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, createMockEnemy())

    expect(effectsOf(system)[0].kind).toBe('angry')
  })
})
