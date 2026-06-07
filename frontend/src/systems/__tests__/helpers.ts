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

  // F-ARCH-7: gold/hp/score/cost mutations live on EconomySystem (reached via
  // `game.economy.*` on the real Game). The mock exposes the same surface
  // inline so system tests don't have to register a real EconomySystem.
  const game = {
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
    // Backlog §24: tests default to Math.random for the rng so existing
    // suites pass unchanged. Determinism-specific tests overwrite this with
    // a seeded mulberry32 stream.
    rng: Math.random,
    seed: null,
    setSeed(this: Game, seed: number) {
      this.seed = seed >>> 0
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
    getEnemyPath() { return null },
    getSystem() { return undefined },
    // ShakeController stub — the real Game owns one; systems may call
    // shake() from their listeners (Visual Redesign Phase 1+) and the mock
    // must not throw.
    shake: {
      shake() {},
      update() {},
      getOffset() { return { dx: 0, dy: 0 } },
      cancel() {},
    },
  } as unknown as Game

  // Inline economy stub — same shape as EconomySystem's resource API.
  Object.defineProperty(game, 'economy', {
    value: {
      changeGold(amount: number) {
        game.state.gold = Math.max(0, game.state.gold + amount)
        eventBus.emit(Events.GOLD_CHANGED, game.state.gold)
      },
      changeHp(amount: number) {
        game.state.hp = Math.max(0, Math.min(game.state.maxHp, game.state.hp + amount))
        eventBus.emit(Events.HP_CHANGED, game.state.hp)
        if (game.state.hp <= 0) game.setPhase(GamePhase.GAME_OVER)
      },
      addScore(points: number) {
        game.state.score += points
        eventBus.emit(Events.SCORE_CHANGED, game.state.score)
      },
      addCost(amount: number) {
        game.state.costTotal += amount
        eventBus.emit(Events.COST_TOTAL_CHANGED, game.state.costTotal)
      },
    },
    enumerable: true,
  })

  return game
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
    vx: 0,
    vy: 0,
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
    regenPerSec: 0,
    damageCapPerHit: 0,
    towerDamageMult: 1,
    minionTimer: 0,
    minionInterval: 0,
    minionType: null,
    chainRuleTriggered: false,
    chainRuleAnsweredCorrectly: null,
    chainRuleTriggerFraction: 0,
    slowFactor: 0,
    slowTimer: 0,
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
    talentMods: {},
    // Matches createTower's default — recomputeEffectiveDamage multiplies by
    // magicBuff, so the neutral value is 1, not 0.
    magicBuff: 1,
    interferenceFactor: 1,
    color: '#a855f7',
    ...overrides,
  }
}
