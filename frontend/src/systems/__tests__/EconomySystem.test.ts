import { describe, it, expect } from 'vitest'
import { EconomySystem } from '../EconomySystem'
import { GamePhase, Events } from '@/data/constants'
import { createMockGame, createMockEnemy } from './helpers'

describe('EconomySystem', () => {
  function setup() {
    const game = createMockGame({ phase: GamePhase.WAVE, gold: 100, hp: 20, score: 0, kills: 0 })
    const system = new EconomySystem()
    system.init(game)
    return { game }
  }

  it('decreases HP by 1 when enemy reaches origin without shield', () => {
    const { game } = setup()
    const enemy = createMockEnemy()

    game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, enemy)

    expect(game.state.hp).toBe(19)
  })

  it('does not decrease HP when shield is active', () => {
    const { game } = setup()
    game.state.shieldActive = true
    const enemy = createMockEnemy()

    game.eventBus.emit(Events.ENEMY_REACHED_ORIGIN, enemy)

    expect(game.state.hp).toBe(20)
  })

  it('grants gold on enemy killed based on reward and multiplier', () => {
    const { game } = setup()
    const enemy = createMockEnemy({ reward: 20 })

    game.eventBus.emit(Events.ENEMY_KILLED, enemy)

    expect(game.state.gold).toBe(120) // 100 + 20
  })

  it('applies gold multiplier', () => {
    const { game } = setup()
    game.state.goldMultiplier = 2
    const enemy = createMockEnemy({ reward: 15 })

    game.eventBus.emit(Events.ENEMY_KILLED, enemy)

    expect(game.state.gold).toBe(130) // 100 + 15 * 2
  })

  it('increments kills and score on enemy killed', () => {
    const { game } = setup()
    const enemy = createMockEnemy()

    game.eventBus.emit(Events.ENEMY_KILLED, enemy)

    expect(game.state.kills).toBe(1)
    expect(game.state.score).toBe(10)
  })

  it('uses default reward of 15 when enemy has no reward', () => {
    const { game } = setup()
    const enemy = createMockEnemy({ reward: 0 })

    game.eventBus.emit(Events.ENEMY_KILLED, enemy)

    expect(game.state.gold).toBe(115) // 100 + 15 (fallback)
  })
})
