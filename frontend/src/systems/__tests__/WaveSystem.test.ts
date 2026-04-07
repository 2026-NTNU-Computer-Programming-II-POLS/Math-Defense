import { describe, it, expect, vi } from 'vitest'
import { WaveSystem } from '../WaveSystem'
import { GamePhase, Events } from '@/data/constants'
import { createMockGame, createMockEnemy } from './helpers'

// Mock level-defs to provide deterministic wave data
vi.mock('@/data/level-defs', () => ({
  LEVELS: [
    {
      id: 1,
      waves: [
        {
          spawnInterval: 0.5,
          enemies: [
            { type: 'basicSlime' },
            { type: 'basicSlime' },
          ],
        },
        {
          spawnInterval: 0.5,
          enemies: [
            { type: 'fastSlime' },
          ],
        },
      ],
    },
  ],
}))

// Mock EnemyFactory
vi.mock('@/entities/EnemyFactory', () => ({
  createEnemy: (type: string, pathFn: (x: number) => number) => ({
    id: `enemy_${Math.random().toString(36).slice(2)}`,
    type,
    x: 20,
    y: pathFn(20),
    hp: 100,
    maxHp: 100,
    speed: 2,
    speedMultiplier: 1,
    size: 20,
    reward: 15,
    color: '#b84040',
    active: true,
    alive: true,
    pathFn,
    _pathX: 20,
    _targetX: 0,
    _direction: -1,
    stealthRanges: [],
    isStealthed: false,
  }),
}))

describe('WaveSystem', () => {
  function setup(level = 1) {
    const game = createMockGame({ phase: GamePhase.WAVE, level })
    game.phase.forceTransition(GamePhase.WAVE)
    const system = new WaveSystem()
    system.init(game)
    return { game, system }
  }

  it('spawns enemies on WAVE_START', () => {
    const { game, system } = setup()

    game.eventBus.emit(Events.WAVE_START, 1)

    // Tick enough to spawn first enemy
    system.update(0.6, game)
    expect(game.enemies.length).toBe(1)

    // Tick again for second
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

  it('transitions to BUFF_SELECT after all enemies spawned and killed', () => {
    const { game, system } = setup()
    game.state.totalWaves = 2

    game.eventBus.emit(Events.WAVE_START, 1)

    // Spawn all enemies
    system.update(0.6, game)
    system.update(0.6, game)

    // Kill all enemies
    game.enemies.length = 0

    // Next tick triggers wave end
    system.update(0.1, game)
    expect(game.state.phase).toBe(GamePhase.BUFF_SELECT)
  })

  it('transitions to LEVEL_END on final wave', () => {
    const { game, system } = setup()

    // Simulate being on last wave (wave 2 of 2)
    game.state.wave = 2
    game.state.totalWaves = 2

    game.eventBus.emit(Events.WAVE_START, 2)

    // Spawn & kill
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
