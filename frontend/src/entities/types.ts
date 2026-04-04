/**
 * Entity 介面定義 — 純資料物件，不含 render 或 update 方法
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

  // 有效數值（Buff 修正後）
  effectiveDamage: number
  effectiveRange: number
  cooldown: number
  cooldownTimer: number

  // Buff 加成修正器
  damageBonus: number
  rangeBonus: number

  // 原始基礎值（供 Buff 計算用）
  baseDamage: number
  baseRange: number

  // 顏色（供 Renderer 用）
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
  size: number      // 像素大小
  reward: number
  color: string
  active: boolean
  alive: boolean

  // 路徑跟隨（內部狀態）
  pathFn: (x: number) => number
  _pathX: number
  _targetX: number
  _direction: 1 | -1

  // 隱身
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

// ── Preview ──

export type TowerPreview =
  | { type: 'line'; fn: (x: number) => number; xMin: number; xMax: number }
  | { type: 'sector'; radius: number; startAngle: number; sweepAngle: number }
  | { type: 'integral'; fn: (x: number) => number; a: number; b: number }
  | { type: 'matrix'; radius: number }
  | { type: 'none' }
