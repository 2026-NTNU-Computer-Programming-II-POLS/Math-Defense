import type { TowerType, EnemyType } from '@/data/constants'
import type { MagicMode } from '@/data/tower-defs'

// ── Tower ──

export interface TowerParams {
  [key: string]: number | string | boolean
}

export interface Tower {
  id: string
  type: TowerType
  x: number
  y: number
  params: TowerParams
  cost: number
  active: boolean
  configured: boolean
  disabled: boolean
  level: number

  effectiveDamage: number
  effectiveRange: number
  cooldown: number
  cooldownTimer: number

  damageBonus: number
  rangeBonus: number

  baseDamage: number
  baseRange: number

  talentMods: Record<string, number>
  magicBuff: number
  // Same-type tower interference factor (Phase 7). 1 = no interference;
  // drops toward INTERFERENCE_FLOOR as same-type towers cluster nearby.
  // Owned per-frame by TowerInterferenceSystem.
  interferenceFactor: number

  color: string

  // V2 fields
  magicMode?: MagicMode
  magicExpression?: string
  arcStart?: number
  arcEnd?: number
  arcRestrict?: boolean
  matrixPairId?: string | null
  limitResult?: LimitResult | null
  calculusState?: CalculusState | null
  upgradeExtras?: Record<string, number>
  upgradeSpend?: number
  // Targeting preference for towers that pick a finite N targets per attack
  // (currently RADAR_B / RADAR_C). Other types (sweep, zone, AoE) ignore it.
  targetingMode?: TargetingMode

  // Visual Redesign Phase 1: muzzle-flash age in seconds. Reset to 0 by the
  // firing system on TOWER_FIRED; aged each tick. The TowerRenderer paints
  // an outward ring + core flash while < ANIM.TOWER_FIRE_FLASH.
  firingFlashAge?: number

  // Current sweep-needle angle (radians) for RADAR_A. Written each tick by
  // RadarTowerSystem._updateSweep so the renderer can paint the rotating
  // needle and the half-aoeWidth detection band; undefined for other types
  // and for unconfigured RADAR_A towers.
  sweepAngle?: number
}

export type TargetingMode = 'first' | 'last' | 'closest' | 'strongest'

export type LimitOutcome = '+inf' | '+c' | 'zero' | 'constant' | '-c' | '-inf'

export interface LimitResult {
  outcome: LimitOutcome
  value: number
}

export interface CalculusState {
  coefficient: number
  exponent: number
  currentExpr: string
  opApplied: boolean
}

// ── Pet ──

export type PetTrait = 'slow' | 'fast' | 'heavy' | 'basic'

export interface Pet {
  id: string
  ownerId: string
  x: number
  y: number
  // Orbit anchor (spawn position). The pet leashes its targeting to this point
  // and drifts back to it when idle, so it stays a tower-guarding satellite.
  homeX: number
  homeY: number
  damage: number
  speed: number
  attackSpeed: number
  range: number
  trait: PetTrait
  abilityMod: number
  cooldownTimer: number
  targetId: string | null
  active: boolean
  // Phase 7 (Q14): per-pet crit chance baked at spawn from the owner tower's
  // `pet_crit` talent mod. 0 = no crit (default for non-Calculus or
  // unallocated). Crit multiplier is fixed at 2× in PetCombatSystem.
  critChance: number
}

// ── Enemy ──

export interface Enemy {
  id: string
  type: EnemyType
  x: number
  y: number
  hp: number
  maxHp: number
  speed: number
  speedMultiplier: number
  size: number
  reward: number
  damage: number
  color: string
  active: boolean
  alive: boolean

  _pathX: number
  _targetX: number
  _direction: 1 | -1

  // Measured per-tick velocity in game units / sec. Written by MovementSystem
  // after each advance from `(next - prev) / dt`, so it reflects the *actual*
  // displacement (auto-handles vertical segments, slow debuffs, segment
  // crossings). Read by RadarTargeting.interceptPoint for lead aim.
  vx: number
  vy: number

  killValue: number

  shield: number
  shieldMax: number

  splitDepth: number
  splitCount: number
  splitChildType: EnemyType | null
  splitChildScale: number

  helperRadius: number
  helperHealPerSec: number
  helperSpeedBuff: number

  // V3 counter-enemy defensive traits. Inert defaults (0 / 0 / 1) leave the
  // pre-V3 enemies byte-identical.
  regenPerSec: number
  damageCapPerHit: number
  towerDamageMult: number

  minionTimer: number
  minionInterval: number
  minionType: EnemyType | null

  chainRuleTriggered: boolean
  chainRuleAnsweredCorrectly: boolean | null
  // Backlog §25: per-spawn HP fraction at which the chain-rule ability fires.
  // 0 means "no HP-gated ability"; populated for Boss-B from triggerHpRange.
  chainRuleTriggerFraction: number

  slowFactor: number
  slowTimer: number
  speedBoost: number
  dotDamage: number
  dotTimer: number

  _emittedReachedOrigin?: boolean

  // Render-only lifecycle fields (Visual Redesign Phase 0).
  // `dying` is set the instant `alive` flips false from a combat kill. The
  // enemy is then kept around in the entity list for `deathMaxTime` seconds
  // so the death-particle / corpse renderer can play its animation; it does
  // NOT move and is treated as dead by every combat read (`alive === false`).
  dying?: boolean
  dyingTimer?: number
  deathMaxTime?: number
  // Per-hit flash. Set to 0 by the damage path (Phase 1) and aged by
  // MovementSystem; the EnemyRenderer overlays a screen-blend flash while > 0.
  hitFlashAge?: number
}

// ── Projectile ──

export interface Projectile {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  damage: number
  color: string
  active: boolean
  ownerId: string
  age: number
  // Visual Redesign Phase 1: ring buffer of recent positions used by
  // ProjectileRenderer to paint a fading trail. Populated each tick by
  // CombatSystem._tickProjectiles; trimmed once length exceeds the cap
  // implied by ANIM.PROJECTILE_TRAIL at the expected frame rate.
  history: { x: number; y: number }[]
}

// ── Param accessor ──

export function getParam(tower: Tower, key: string, fallback: number): number {
  const v = tower.params[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

// ── Preview ──

export type TowerPreview =
  | { type: 'curve'; fn: (x: number) => number; xMin: number; xMax: number }
  | { type: 'circle'; radius: number; arcStart?: number; arcEnd?: number }
  | { type: 'laser'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'none' }
