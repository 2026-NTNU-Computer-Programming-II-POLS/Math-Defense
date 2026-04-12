/**
 * GameState — strongly-typed game state
 * All buff flags and game values are explicitly declared here.
 * No more dynamic properties like game._shieldActive.
 */
import { GamePhase } from '@/data/constants'
import { INITIAL_HP, INITIAL_GOLD } from '@/data/constants'

export interface GameState {
  // Flow
  phase: GamePhase
  level: number
  wave: number
  totalWaves: number

  // Resources
  gold: number
  hp: number
  maxHp: number
  score: number
  kills: number

  // Buff flags (explicitly declared; no longer dynamically injected)
  shieldActive: boolean
  goldMultiplier: number
  freeTowerNext: boolean
  enemySpeedMultiplier: number     // Curse: enemy speed multiplier (default 1.0)

  // Boss Shield state (centrally managed; not scattered in CombatSystem)
  bossShieldTriggered: boolean
  bossShieldTimer: number
  // Target waveform the player must match with the Fourier Shield slider UI.
  // Populated when BOSS_SHIELD_START fires so the FourierPanel can compare against it.
  bossShieldTarget: { freqs: number[]; amps: number[] } | null

  // Path
  pathExpression: string
}

export function createInitialState(): GameState {
  return {
    phase: GamePhase.MENU,
    level: 1,
    wave: 0,
    totalWaves: 0,
    gold: INITIAL_GOLD,
    hp: INITIAL_HP,
    maxHp: INITIAL_HP,
    score: 0,
    kills: 0,
    shieldActive: false,
    goldMultiplier: 1,
    freeTowerNext: false,
    enemySpeedMultiplier: 1,
    bossShieldTriggered: false,
    bossShieldTimer: 0,
    bossShieldTarget: null,
    pathExpression: '',
  }
}
