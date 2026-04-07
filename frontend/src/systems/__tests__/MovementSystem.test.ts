import { describe, it, expect } from 'vitest'
import { MovementSystem } from '../MovementSystem'
import { GamePhase, Events } from '@/data/constants'
import { createMockGame, createMockEnemy } from './helpers'

describe('MovementSystem', () => {
  function setup() {
    const game = createMockGame({ phase: GamePhase.WAVE })
    game.phase.forceTransition(GamePhase.WAVE)
    const system = new MovementSystem()
    system.init(game)
    return { game, system }
  }

  it('moves enemy along path (negative direction)', () => {
    const { game, system } = setup()
    const enemy = createMockEnemy({ _pathX: 10, _direction: -1, speed: 2 })
    game.enemies.push(enemy)

    system.update(0.5, game)

    expect(enemy._pathX).toBeLessThan(10)
    expect(enemy.x).toBe(enemy._pathX)
  })

  it('does not update enemies outside WAVE phase', () => {
    const game = createMockGame({ phase: GamePhase.BUILD })
    game.phase.forceTransition(GamePhase.BUILD)
    const system = new MovementSystem()
    system.init(game)

    const enemy = createMockEnemy({ _pathX: 10 })
    game.enemies.push(enemy)

    system.update(0.5, game)
    expect(enemy._pathX).toBe(10)
  })

  it('removes dead enemies from array', () => {
    const { game, system } = setup()
    const enemy = createMockEnemy({ alive: false })
    game.enemies.push(enemy)

    system.update(0.016, game)
    expect(game.enemies.length).toBe(0)
  })

  it('emits ENEMY_REACHED_ORIGIN when enemy reaches target', () => {
    const { game, system } = setup()
    const enemy = createMockEnemy({
      _pathX: 0.1,
      _targetX: 0,
      _direction: -1,
      speed: 10,
      pathFn: () => 0,
    })
    game.enemies.push(enemy)

    let reached = false
    game.eventBus.on(Events.ENEMY_REACHED_ORIGIN, () => { reached = true })

    system.update(0.5, game)
    expect(reached).toBe(true)
  })

  it('respects enemySpeedMultiplier from game state', () => {
    const { game, system } = setup()
    const enemy1 = createMockEnemy({ _pathX: 10, speed: 2 })
    game.enemies.push(enemy1)

    system.update(1.0, game)
    const pos1 = enemy1._pathX

    // Reset and test with 2x speed
    const game2 = createMockGame({ phase: GamePhase.WAVE, enemySpeedMultiplier: 2 })
    game2.phase.forceTransition(GamePhase.WAVE)
    const system2 = new MovementSystem()
    system2.init(game2)
    const enemy2 = createMockEnemy({ _pathX: 10, speed: 2 })
    game2.enemies.push(enemy2)

    system2.update(1.0, game2)

    // enemy2 should have moved further
    expect(enemy2._pathX).toBeLessThan(pos1)
  })

  it('updates stealth status based on stealthRanges', () => {
    const { game, system } = setup()
    const enemy = createMockEnemy({
      _pathX: 5,
      stealthRanges: [[4, 6]],
      isStealthed: false,
      speed: 0.01,
    })
    game.enemies.push(enemy)

    system.update(0.016, game)
    expect(enemy.isStealthed).toBe(true)
  })
})
