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
}

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
  hp: number
  maxHp: number
  damage: number
  attackSpeed: number
  range: number
  trait: PetTrait
  abilityMod: number
  cooldownTimer: number
  targetId: string | null
  active: boolean
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

  minionTimer: number
  minionInterval: number
  minionType: EnemyType | null

  chainRuleTriggered: boolean
  chainRuleAnsweredCorrectly: boolean | null

  slowFactor: number
  slowTimer: number
  speedBoost: number
  dotDamage: number
  dotTimer: number

  _emittedReachedOrigin?: boolean
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
