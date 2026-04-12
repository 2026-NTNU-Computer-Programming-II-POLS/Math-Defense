import { describe, it, expect, vi } from 'vitest'
import { CombatSystem } from '../CombatSystem'
import { GamePhase, Events, TowerType } from '@/data/constants'
import { createMockGame, createMockEnemy, createMockTower } from './helpers'

// Mock MathUtils
vi.mock('@/math/MathUtils', () => ({
  distance: (x1: number, y1: number, x2: number, y2: number) =>
    Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2),
  findIntersections: (_shotFn: unknown, _pathFn: unknown, _min: number, _max: number) => [10],
  degToRad: (deg: number) => (deg * Math.PI) / 180,
}))

// Mock WasmBridge
vi.mock('@/math/WasmBridge', () => ({
  pointInSector: () => true,
}))

// Mock EnemyFactory
vi.mock('@/entities/EnemyFactory', () => ({
  createEnemy: () => ({
    id: 'child', type: 'basicSlime', x: 10, y: 5, hp: 40, maxHp: 40,
    speed: 2, speedMultiplier: 1, size: 14, reward: 5, color: '#a070d0',
    active: true, alive: true, pathFn: (x: number) => x, _pathX: 10,
    _targetX: 0, _direction: -1, stealthRanges: [], isStealthed: false,
  }),
}))

describe('CombatSystem', () => {
  function setup() {
    const game = createMockGame({ phase: GamePhase.WAVE })
    game.phase.forceTransition(GamePhase.WAVE)
    const system = new CombatSystem()
    system.init(game)
    return { game, system }
  }

  it('applies params and marks tower configured on TOWER_PARAMS_SET', () => {
    const { game } = setup()
    const tower = createMockTower({ configured: false })
    game.towers.push(tower)
    game.eventBus.emit(Events.TOWER_PARAMS_SET, {
      towerId: tower.id,
      params: { m: 2, b: 3 },
    })
    expect(tower.configured).toBe(true)
    expect(tower.params.m).toBe(2)
    expect(tower.params.b).toBe(3)
  })

  it('resets cooldownTimers on WAVE_START', () => {
    const { game } = setup()
    const tower = createMockTower({ cooldownTimer: 5 })
    game.towers.push(tower)
    game.eventBus.emit(Events.WAVE_START, 1)
    expect(tower.cooldownTimer).toBe(0)
  })

  it('fires function cannon and creates projectile', () => {
    const { game, system } = setup()
    const tower = createMockTower({
      type: TowerType.FUNCTION_CANNON,
      cooldownTimer: 0,
      cooldown: 1.5,
    })
    game.towers.push(tower)

    system.update(0.016, game)
    expect(game.projectiles.length).toBeGreaterThan(0)
  })

  it('does not fire disabled towers', () => {
    const { game, system } = setup()
    const tower = createMockTower({ disabled: true, cooldownTimer: 0 })
    game.towers.push(tower)

    system.update(0.016, game)
    expect(game.projectiles.length).toBe(0)
  })

  it('does not fire unconfigured towers', () => {
    const { game, system } = setup()
    const tower = createMockTower({ configured: false, cooldownTimer: 0 })
    game.towers.push(tower)

    system.update(0.016, game)
    expect(game.projectiles.length).toBe(0)
  })

  it('moves projectiles and removes out-of-bounds ones', () => {
    const { game, system } = setup()
    game.projectiles.push({
      id: 'proj_1', x: 30, y: 0, vx: 10, vy: 0,
      damage: 10, color: '#fff', active: true, ownerId: 'tower_1',
    })

    system.update(0.5, game)
    expect(game.projectiles.length).toBe(0) // moved beyond GRID_MAX_X + 5
  })

  it('projectile damages enemy on collision', () => {
    const { game, system } = setup()
    const enemy = createMockEnemy({ x: 5, y: 5, hp: 100 })
    game.enemies.push(enemy)
    game.projectiles.push({
      id: 'proj_1', x: 5, y: 5, vx: 0, vy: 0,
      damage: 30, color: '#fff', active: true, ownerId: 'tower_1',
    })

    system.update(0.016, game)
    expect(enemy.hp).toBe(70)
    expect(game.projectiles.length).toBe(0) // consumed on hit
  })

  it('does not damage stealthed enemies', () => {
    const { game, system } = setup()
    const enemy = createMockEnemy({ x: 5, y: 5, hp: 100, isStealthed: true })
    game.enemies.push(enemy)
    game.projectiles.push({
      id: 'proj_1', x: 5, y: 5, vx: 0, vy: 0,
      damage: 30, color: '#fff', active: true, ownerId: 'tower_1',
    })

    system.update(0.016, game)
    expect(enemy.hp).toBe(100) // no damage
  })

  it('emits ENEMY_KILLED when enemy hp <= 0', () => {
    const { game, system } = setup()
    const enemy = createMockEnemy({ x: 5, y: 5, hp: 10 })
    game.enemies.push(enemy)
    game.projectiles.push({
      id: 'proj_1', x: 5, y: 5, vx: 0, vy: 0,
      damage: 50, color: '#fff', active: true, ownerId: 'tower_1',
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
    const tower = createMockTower({ cooldownTimer: 0 })
    game.towers.push(tower)

    system.update(0.016, game)
    expect(game.projectiles.length).toBe(0)
  })
})
