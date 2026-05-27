import { GamePhase } from '@/data/constants'
import { INITIAL_HP, INITIAL_GOLD } from '@/data/constants'

export interface ActiveBuffEntry {
  id: string
  name: string
  effectId: string
  revertId?: string
  remainingTime: number   // seconds remaining
  totalDuration: number   // original duration in seconds
  survivesLevelStart?: boolean  // true for mid-wave rewards (e.g. Monty Hall) that must carry into the next wave
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
  timeExcludePrepare: number[]      // duration of each prep or UI-pause phase (subtracted from timeTotal for scoring)
  prepPhaseStart: number            // timestamp when current BUILD phase started (0 if not in BUILD)
  pausePhaseStart: number           // timestamp when current MONTY_HALL or CHAIN_RULE phase started (0 if not paused)
  perceivedSpeedMultiplier: number  // wall-clock pacing only; score time advances with simulation time

  // V2 Initial Answer
  initialAnswer: 0 | 1
  pathsVisible: boolean

  // V2 Monty Hall
  montyHallNextIndex: number        // index into threshold array
  montyHallPending: boolean         // true when a threshold was crossed and event should fire between waves

  // Buff flags
  shieldActive: boolean
  shieldHitsRemaining: number
  // Per-hit multiplier applied while the shield absorbs damage from
  // ENEMY_REACHED_ORIGIN. 1 = no reduction (inactive default); 0.5 halves
  // each absorbed hit. BuffSystem owns the writes (set on SHIELD_ACTIVATE,
  // reset on SHIELD_DEACTIVATE).
  shieldReductionFactor: number
  // Q15: gold-multiplier buffs stack additively. `goldMultiplierBonus` is the
  // accumulator owned by BuffSystem (each ×2 adds 1, each ×3 adds 2); consumers
  // keep reading `goldMultiplier`, which is derived as 1 + bonus. Two stacked
  // buffs (×2 + ×3) yield bonus 3 → multiplier 4 (was 6 under multiplicative).
  goldMultiplier: number
  goldMultiplierBonus: number
  freeTowerNext: boolean
  freeTowerCharges: number
  enemySpeedMultiplier: number
  enemyVulnerability: number        // damage multiplier on enemies (default 1.0)

  // Tower buff bonuses — additive accumulators (mirror goldMultiplierBonus
  // pattern). Effective multiplier = 1 + bonus. Reads happen in tower-stats
  // (damage), BuffSystem.recalcRange (range), and effectiveCooldown (speed),
  // so new towers built during an active buff pick up the current multiplier
  // and reverts can never overshoot below 1× via Math.max clamping.
  towerDamageBonus: number
  towerRangeBonus: number
  towerSpeedBonus: number

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
    pausePhaseStart: 0,
    perceivedSpeedMultiplier: 1,
    initialAnswer: 0,
    pathsVisible: false,
    montyHallNextIndex: 0,
    montyHallPending: false,
    shieldActive: false,
    shieldHitsRemaining: 0,
    shieldReductionFactor: 1,
    goldMultiplier: 1,
    goldMultiplierBonus: 0,
    freeTowerNext: false,
    freeTowerCharges: 0,
    enemySpeedMultiplier: 1,
    enemyVulnerability: 1,
    towerDamageBonus: 0,
    towerRangeBonus: 0,
    towerSpeedBonus: 0,
    activeBuffs: [],
    spellCooldowns: {},
  }
}
