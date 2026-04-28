/**
 * Test helpers — minimal Game-like stub for system unit tests.
 * Systems only need eventBus, state, and entity arrays; no canvas/renderer.
 */
import { EventBus } from '@/engine/EventBus'
import { type GameState, createInitialState } from '@/engine/GameState'
import { PhaseStateMachine } from '@/engine/PhaseStateMachine'
import { Events, GamePhase } from '@/data/constants'
import type { Game, GameEvents } from '@/engine/Game'
import type { Tower, Enemy, Projectile, Pet } from '@/entities/types'
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
    pets: [] as Pet[],
    levelContext: null,
    generatedLevel: null,
    currentWaves: null,
    time: 0,
    changeGold(this: Game, amount: number) {
      this.state.gold = Math.max(0, this.state.gold + amount)
      this.eventBus.emit(Events.GOLD_CHANGED, this.state.gold)
    },
    changeHp(this: Game, amount: number) {
      this.state.hp = Math.max(0, Math.min(this.state.maxHp, this.state.hp + amount))
      this.eventBus.emit(Events.HP_CHANGED, this.state.hp)
      if (this.state.hp <= 0) this.setPhase(GamePhase.GAME_OVER)
    },
    addScore(this: Game, points: number) {
      this.state.score += points
      this.eventBus.emit(Events.SCORE_CHANGED, this.state.score)
    },
    addCost(this: Game, amount: number) {
      this.state.costTotal += amount
      this.eventBus.emit(Events.COST_TOTAL_CHANGED, this.state.costTotal)
    },
    addKillValue(this: Game, value: number) {
      this.state.cumulativeKillValue += value
      this.eventBus.emit(Events.KILL_VALUE_CHANGED, this.state.cumulativeKillValue)
    },
    setPhase(this: Game, to: GamePhase) {
      const from = this.state.phase
      if (!this.phase.transition(to)) return
      this.state.phase = to
      this.eventBus.emit(Events.PHASE_CHANGED, { from, to })
    },
    assignEnemyPath() {},
    getSystem() { return undefined },
  } as unknown as Game
}

export function createMockEnemy(overrides?: Partial<Enemy>): Enemy {
  return {
    id: `enemy_${Math.random().toString(36).slice(2)}`,
    type: 'general' as EnemyType,
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
    killValue: 10,
    shield: 0,
    shieldMax: 0,
    splitDepth: 0,
    splitCount: 0,
    splitChildType: null,
    splitChildScale: 1,
    helperRadius: 0,
    helperHealPerSec: 0,
    helperSpeedBuff: 0,
    minionTimer: 0,
    minionInterval: 0,
    minionType: null,
    chainRuleTriggered: false,
    chainRuleAnsweredCorrectly: null,
    slowFactor: 0,
    speedBoost: 0,
    dotDamage: 0,
    dotTimer: 0,
    ...overrides,
  }
}

export function createMockTower(overrides?: Partial<Tower>): Tower {
  return {
    id: `tower_${Math.random().toString(36).slice(2)}`,
    type: 'magic' as TowerType,
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
    color: '#a855f7',
    ...overrides,
  }
}
