import { GamePhase } from '@/data/constants'
import { INITIAL_HP, INITIAL_GOLD } from '@/data/constants'

export interface ActiveBuffEntry {
  id: string
  name: string
  effectId: string
  revertId?: string
  remainingTime: number   // seconds remaining
  totalDuration: number   // original duration in seconds
}

export interface GameState {
  // Flow
  phase: GamePhase
  level: number
  starRating: number
  wave: number
  totalWaves: number

  // Resources
  gold: number
  hp: number
  maxHp: number
  score: number
  kills: number
  cumulativeKillValue: number

  // V2 Economy tracking
  costTotal: number
  healthOrigin: number

  // V2 Timing
  timeTotal: number                 // seconds since level start
  timeExcludePrepare: number[]      // duration of each preparation phase
  prepPhaseStart: number            // timestamp when current prep phase started (0 if not in prep)

  // V2 Initial Answer
  initialAnswer: 0 | 1
  pathsVisible: boolean

  // V2 Monty Hall
  montyHallNextIndex: number        // index into threshold array
  montyHallPending: boolean         // true when a threshold was crossed and event should fire between waves

  // Buff flags
  shieldActive: boolean
  shieldHitsRemaining: number
  goldMultiplier: number
  freeTowerNext: boolean
  freeTowerCharges: number
  enemySpeedMultiplier: number
  enemyVulnerability: number        // damage multiplier on enemies (default 1.0)

  // Active buffs (time-based)
  activeBuffs: ActiveBuffEntry[]

  // Spell cooldowns
  spellCooldowns: Record<string, number>  // spellId → remaining cooldown seconds

}

export function isShielded(state: GameState): boolean {
  return state.shieldActive
}

export function createInitialState(): GameState {
  return {
    phase: GamePhase.MENU,
    level: 1,
    starRating: 1,
    wave: 0,
    totalWaves: 0,
    gold: INITIAL_GOLD,
    hp: INITIAL_HP,
    maxHp: INITIAL_HP,
    score: 0,
    kills: 0,
    cumulativeKillValue: 0,
    costTotal: 0,
    healthOrigin: INITIAL_HP,
    timeTotal: 0,
    timeExcludePrepare: [],
    prepPhaseStart: 0,
    initialAnswer: 0,
    pathsVisible: false,
    montyHallNextIndex: 0,
    montyHallPending: false,
    shieldActive: false,
    shieldHitsRemaining: 0,
    goldMultiplier: 1,
    freeTowerNext: false,
    freeTowerCharges: 0,
    enemySpeedMultiplier: 1,
    enemyVulnerability: 1,
    activeBuffs: [],
    spellCooldowns: {},
  }
}
