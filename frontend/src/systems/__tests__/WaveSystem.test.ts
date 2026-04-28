import { describe, it, expect, vi } from 'vitest'
import { WaveSystem } from '../WaveSystem'
import { GamePhase, Events } from '@/data/constants'
import { createMockGame } from './helpers'

// Mock EnemyFactory
vi.mock('@/entities/EnemyFactory', () => ({
  createEnemy: (type: string, path: { evaluateAt: (x: number) => number }) => ({
    id: `enemy_${Math.random().toString(36).slice(2)}`,
    type,
    x: 20,
    y: path.evaluateAt(20),
    hp: 100,
    maxHp: 100,
    speed: 2,
    speedMultiplier: 1,
    size: 20,
    reward: 15,
    color: '#b84040',
    active: true,
    alive: true,
    _pathX: 20,
    _targetX: 0,
    _direction: -1,
  }),
}))

const FAKE_WAVES = [
  {
    spawnInterval: 0.5,
    enemies: [
      { type: 'general' },
      { type: 'general' },
    ],
  },
  {
    spawnInterval: 0.5,
    enemies: [
      { type: 'fast' },
    ],
  },
]

function fakeLevelContext() {
  return {
    path: {
      segments: [],
      startX: 20,
      targetX: 0,
      evaluateAt: (_x: number) => 0,
      findSegmentAt: (_x: number) => null,
    },
    layout: { classify: () => 'forbidden' as const, pathCellCount: 0, buildableCellCount: 0 },
    tracker: { update: () => {}, dispose: () => {} },
    dispose: () => {},
  }
}

describe('WaveSystem', () => {
  function setup(level = 1) {
    const game = createMockGame({ phase: GamePhase.WAVE, level })
    game.phase.forceTransition(GamePhase.WAVE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    game.levelContext = fakeLevelContext() as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(game as any).currentWaves = FAKE_WAVES
    const system = new WaveSystem()
    system.init(game)
    return { game, system }
  }

  it('spawns enemies on WAVE_START', () => {
    const { game, system } = setup()

    game.eventBus.emit(Events.WAVE_START, 1)

    system.update(0.6, game)
    expect(game.enemies.length).toBe(1)

    system.update(0.6, game)
    expect(game.enemies.length).toBe(2)
  })

  it('emits ENEMY_SPAWNED for each spawn', () => {
    const { game, system } = setup()
    const spawned: unknown[] = []
    game.eventBus.on(Events.ENEMY_SPAWNED, (e) => spawned.push(e))

    game.eventBus.emit(Events.WAVE_START, 1)
    system.update(0.6, game)
    system.update(0.6, game)

    expect(spawned.length).toBe(2)
  })

  it('transitions to BUILD after all enemies spawned and killed', () => {
    const { game, system } = setup()
    game.state.totalWaves = 2

    game.eventBus.emit(Events.WAVE_START, 1)

    system.update(0.6, game)
    system.update(0.6, game)

    game.enemies.length = 0

    system.update(0.1, game)
    expect(game.state.phase).toBe(GamePhase.BUILD)
  })

  it('transitions to LEVEL_END on final wave', () => {
    const { game, system } = setup()

    game.state.wave = 2
    game.state.totalWaves = 2

    game.eventBus.emit(Events.WAVE_START, 2)

    system.update(0.6, game)
    game.enemies.length = 0
    system.update(0.1, game)

    expect(game.state.phase).toBe(GamePhase.LEVEL_END)
  })

  it('does not spawn outside WAVE phase', () => {
    const game = createMockGame({ phase: GamePhase.BUILD, level: 1 })
    game.phase.forceTransition(GamePhase.BUILD)
    const system = new WaveSystem()
    system.init(game)

    system.update(1.0, game)
    expect(game.enemies.length).toBe(0)
  })
})
