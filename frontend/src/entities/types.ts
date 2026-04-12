/**
 * Entity interface definitions — pure data objects with no render or update methods
 */
import type { TowerType, EnemyType } from '@/data/constants'

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

  // Effective values (after Buff modifiers)
  effectiveDamage: number
  effectiveRange: number
  cooldown: number
  cooldownTimer: number

  // Buff multiplier modifiers
  damageBonus: number
  rangeBonus: number

  // Raw base values (used for Buff calculations)
  baseDamage: number
  baseRange: number

  // Color (used by Renderer)
  color: string
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
  size: number      // pixel size
  reward: number
  damage: number    // HP cost to player when this enemy reaches the origin
  color: string
  active: boolean
  alive: boolean

  // Path following (internal state)
  pathFn: (x: number) => number
  _pathX: number
  _targetX: number
  _direction: 1 | -1

  // Stealth
  stealthRanges: [number, number][]
  isStealthed: boolean
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
}

// ── Param accessor ──

/**
 * Safely read a numeric param from a Tower with a fallback.
 *
 * TowerParams stores `number | string | boolean`; call sites in CombatSystem /
 * BuildPanel / TowerPlacementSystem routinely cast the bag to
 * `Record<string, number>` and rely on `?? fallback`. That works when the key
 * is absent but silently propagates `NaN` / strings if the value exists with
 * a non-number type. This helper validates at runtime: only a finite number
 * is returned; anything else (undefined, string, NaN, Infinity) yields the
 * fallback.
 */
export function getParam(tower: Tower, key: string, fallback: number): number {
  const v = tower.params[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

// ── Preview ──

export type TowerPreview =
  | { type: 'line'; fn: (x: number) => number; xMin: number; xMax: number }
  | { type: 'sector'; radius: number; startAngle: number; sweepAngle: number }
  | { type: 'integral'; fn: (x: number) => number; a: number; b: number }
  | { type: 'matrix'; radius: number }
  | { type: 'none' }
