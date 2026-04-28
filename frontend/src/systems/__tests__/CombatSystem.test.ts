import { describe, it, expect, vi } from 'vitest'
import { CombatSystem } from '../CombatSystem'
import { GamePhase, Events } from '@/data/constants'
import { createMockGame, createMockEnemy } from './helpers'

vi.mock('@/math/MathUtils', () => ({
  distance: (x1: number, y1: number, x2: number, y2: number) =>
    Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2),
}))

describe('CombatSystem', () => {
  function setup() {
    const game = createMockGame({ phase: GamePhase.WAVE })
    game.phase.forceTransition(GamePhase.WAVE)
    const system = new CombatSystem()
    system.init(game)
    return { game, system }
  }

  it('moves projectiles and removes out-of-bounds ones', () => {
    const { game, system } = setup()
    game.projectiles.push({
      id: 'proj_1', x: 30, y: 0, vx: 10, vy: 0,
      damage: 10, color: '#fff', active: true, ownerId: 'tower_1', age: 0,
    })

    system.update(0.5, game)
    expect(game.projectiles.length).toBe(0)
  })

  it('projectile damages enemy on collision', () => {
    const { game, system } = setup()
    const enemy = createMockEnemy({ x: 5, y: 5, hp: 100 })
    game.enemies.push(enemy)
    game.projectiles.push({
      id: 'proj_1', x: 5, y: 5, vx: 0, vy: 0,
      damage: 30, color: '#fff', active: true, ownerId: 'tower_1', age: 0,
    })

    system.update(0.016, game)
    expect(enemy.hp).toBe(70)
    expect(game.projectiles.length).toBe(0)
  })

  it('shield absorbs damage before HP', () => {
    const { game, system } = setup()
    const enemy = createMockEnemy({ x: 5, y: 5, hp: 100, shield: 50, shieldMax: 50 })
    game.enemies.push(enemy)
    game.projectiles.push({
      id: 'proj_1', x: 5, y: 5, vx: 0, vy: 0,
      damage: 30, color: '#fff', active: true, ownerId: 'tower_1', age: 0,
    })

    system.update(0.016, game)
    expect(enemy.shield).toBe(20)
    expect(enemy.hp).toBe(100)
  })

  it('emits ENEMY_KILLED when enemy hp <= 0', () => {
    const { game, system } = setup()
    const enemy = createMockEnemy({ x: 5, y: 5, hp: 10 })
    game.enemies.push(enemy)
    game.projectiles.push({
      id: 'proj_1', x: 5, y: 5, vx: 0, vy: 0,
      damage: 50, color: '#fff', active: true, ownerId: 'tower_1', age: 0,
    })

    let killed = false
    game.eventBus.on(Events.ENEMY_KILLED, () => { killed = true })

    system.update(0.016, game)
    expect(killed).toBe(true)
    expect(enemy.alive).toBe(false)
  })

  it('does not update outside WAVE phase', () => {
    const game = createMockGame({ phase: GamePhase.BUILD })
    game.phase.forceTransition(GamePhase.BUILD)
    const system = new CombatSystem()
    system.init(game)

    game.projectiles.push({
      id: 'proj_1', x: 5, y: 5, vx: 1, vy: 0,
      damage: 10, color: '#fff', active: true, ownerId: 'tower_1', age: 0,
    })

    system.update(0.016, game)
    expect(game.projectiles.length).toBe(1)
  })

  it('ticks DoT damage on enemies', () => {
    const { game, system } = setup()
    const enemy = createMockEnemy({ x: 5, y: 5, hp: 100 })
    enemy.dotDamage = 10
    enemy.dotTimer = 1.0
    game.enemies.push(enemy)

    system.update(0.5, game)
    expect(enemy.hp).toBeLessThan(100)
  })
})
