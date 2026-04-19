/**
 * Test helpers — minimal Game-like stub for system unit tests.
 * Systems only need eventBus, state, and entity arrays; no canvas/renderer.
 */
import { EventBus } from '@/engine/EventBus'
import { type GameState, createInitialState } from '@/engine/GameState'
import { PhaseStateMachine } from '@/engine/PhaseStateMachine'
import { GamePhase } from '@/data/constants'
import type { Game, GameEvents } from '@/engine/Game'
import type { Tower, Enemy, Projectile } from '@/entities/types'
import type { EnemyType, TowerType } from '@/data/constants'

export function createMockGame(overrides?: Partial<GameState>): Game {
  const eventBus = new EventBus<GameEvents>()
  const phase = new PhaseStateMachine()
  const state = { ...createInitialState(), ...overrides }

  // Methods reference `this` against the cast-to-Game return value; explicit `this: Game`
  // annotations let TS resolve `this.state` etc. without the body itself seeing Game's shape.
  return {
    eventBus,
    phase,
    state,
    towers: [] as Tower[],
    enemies: [] as Enemy[],
    projectiles: [] as Projectile[],
    levelContext: null,
    time: 0,
    changeGold(this: Game, amount: number) {
      this.state.gold = Math.max(0, this.state.gold + amount)
      this.eventBus.emit('goldChanged', this.state.gold)
    },
    changeHp(this: Game, amount: number) {
      this.state.hp = Math.max(0, Math.min(this.state.maxHp, this.state.hp + amount))
      this.eventBus.emit('hpChanged', this.state.hp)
      if (this.state.hp <= 0) this.setPhase(GamePhase.GAME_OVER)
    },
    addScore(this: Game, points: number) {
      this.state.score += points
      this.eventBus.emit('scoreChanged', this.state.score)
    },
    setPhase(this: Game, to: GamePhase) {
      const from = this.state.phase
      if (!this.phase.transition(to)) return
      this.state.phase = to
      this.eventBus.emit('phaseChanged', { from, to })
    },
    getSystem() { return undefined },
  } as unknown as Game
}

export function createMockEnemy(overrides?: Partial<Enemy>): Enemy {
  return {
    id: `enemy_${Math.random().toString(36).slice(2)}`,
    type: 'basicSlime' as EnemyType,
    x: 10,
    y: 5,
    hp: 100,
    maxHp: 100,
    speed: 2,
    speedMultiplier: 1,
    size: 20,
    reward: 15,
    damage: 1,
    color: '#b84040',
    active: true,
    alive: true,
    _pathX: 10,
    _targetX: 0,
    _direction: -1 as const,
    stealthRanges: [],
    isStealthed: false,
    splitDepth: 0,
    ...overrides,
  }
}

export function createMockTower(overrides?: Partial<Tower>): Tower {
  return {
    id: `tower_${Math.random().toString(36).slice(2)}`,
    type: 'functionCannon' as TowerType,
    x: 5,
    y: 5,
    params: { m: 1, b: 0 },
    cost: 50,
    active: true,
    configured: true,
    disabled: false,
    level: 1,
    effectiveDamage: 20,
    effectiveRange: 5,
    cooldown: 1.5,
    cooldownTimer: 0,
    damageBonus: 1,
    rangeBonus: 1,
    baseDamage: 20,
    baseRange: 5,
    color: '#4a82c8',
    ...overrides,
  }
}
