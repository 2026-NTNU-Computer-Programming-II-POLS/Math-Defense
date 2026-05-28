import { EnemyType, Colors } from './constants'
import enemyStats from '@shared/enemy-defs.json'

export interface SplitConfig {
  count: number
  childType: EnemyType
  childScale: number
}

export interface HelperConfig {
  radius: number
  healPerSec: number
  speedBuff: number
}

export interface MinionConfig {
  interval: number
  type: EnemyType
}

export interface EnemyDef {
  type: EnemyType
  name: string
  color: string
  maxHp: number
  speed: number
  size: number
  reward: number
  damage: number
  killValue: number
  shieldHp?: number
  split?: SplitConfig
  helper?: HelperConfig
  minion?: MinionConfig
  // Backlog §25: HP-fraction window in which an HP-gated boss ability fires.
  // Sampled uniformly per spawn so timing varies but the ability never gets
  // skipped. Bounds must be inside (0, 1). Currently only Boss-B uses this.
  triggerHpRange?: [number, number]
  // V3 counter-enemy defensive traits. Optional so the existing seven defs
  // need no change; EnemyFactory fills inert defaults (0 / 0 / 1).
  /** Constant HP regenerated per second. Never interrupted by taking damage. */
  regenPerSec?: number
  /** Max damage a single discrete hit can deal. 0 / undefined = no cap. */
  damageCapPerHit?: number
  /** Multiplier applied to non-pet damage. 1 / undefined = no reduction. */
  towerDamageMult?: number
}

// Visual / presentation fields. Kept in TS so the (future) server-side sim
// reading shared/enemy-defs.json doesn't need to know about colour palettes
// or display names. Stats — anything that drives combat, scoring, or
// spawn-chain behaviour — live in the shared JSON.
const ENEMY_VISUALS: Record<EnemyType, { name: string; color: string }> = {
  [EnemyType.GENERAL]: { name: 'General',     color: '#40b848' },
  [EnemyType.FAST]:    { name: 'Fast',        color: '#4888cc' },
  [EnemyType.STRONG]:  { name: 'Strong',      color: Colors.ENEMY },
  [EnemyType.SPLIT]:   { name: 'Split',       color: '#9060c0' },
  [EnemyType.HELPER]:  { name: 'Helper',      color: '#48c878' },
  [EnemyType.BOSS_A]:  { name: 'Boss Type-A', color: '#cc2020' },
  [EnemyType.BOSS_B]:  { name: 'Boss Type-B', color: '#dd3080' },
  [EnemyType.REGENERATOR]: { name: 'Regenerator', color: Colors.REGENERATOR },
  [EnemyType.BULWARK]:     { name: 'Bulwark',     color: Colors.BULWARK },
  [EnemyType.SWARMLING]:   { name: 'Swarmling',   color: Colors.SWARMLING },
}

// Pull the JSON stats keyed by EnemyType value. The cast is safe because
// the JSON keys are a 1:1 match with EnemyType values; a missing key
// surfaces as ``undefined`` on dictionary lookup and would crash
// build() below, which is the desired loud failure mode.
type EnemyStatsEntry = Omit<EnemyDef, 'type' | 'name' | 'color'>
const STATS = enemyStats as unknown as Record<EnemyType, EnemyStatsEntry>

function build(type: EnemyType): EnemyDef {
  const visual = ENEMY_VISUALS[type]
  const stats = STATS[type]
  if (!visual || !stats) {
    throw new Error(`enemy-defs: missing entry for type=${type}`)
  }
  return { type, ...visual, ...stats }
}

export const ENEMY_DEFS: Record<EnemyType, EnemyDef> = {
  [EnemyType.GENERAL]:     build(EnemyType.GENERAL),
  [EnemyType.FAST]:        build(EnemyType.FAST),
  [EnemyType.STRONG]:      build(EnemyType.STRONG),
  [EnemyType.SPLIT]:       build(EnemyType.SPLIT),
  [EnemyType.HELPER]:      build(EnemyType.HELPER),
  [EnemyType.BOSS_A]:      build(EnemyType.BOSS_A),
  [EnemyType.BOSS_B]:      build(EnemyType.BOSS_B),
  [EnemyType.REGENERATOR]: build(EnemyType.REGENERATOR),
  [EnemyType.BULWARK]:     build(EnemyType.BULWARK),
  [EnemyType.SWARMLING]:   build(EnemyType.SWARMLING),
}
