import { TOWER_DEFS } from '@/data/tower-defs'
import { TOWER_PARAM_FIELDS } from '@/data/ui-defs'
import { TowerType } from '@/data/constants'
import { recomputeEffectiveDamage } from './tower-stats'
import type { Tower, TowerParams } from './types'

let _nextId = 0

export function createTower(
  type: TowerType,
  x: number,
  y: number,
  modifiers?: Record<string, number>,
  buffState?: { towerDamageBonus: number; towerRangeBonus: number },
): Tower {
  const def = TOWER_DEFS[type]
  if (!def) throw new Error(`Unknown tower type: ${type}`)

  const params: TowerParams = {}
  for (const field of TOWER_PARAM_FIELDS[type] ?? []) {
    params[field.key] = field.default
  }

  const mods = modifiers ?? {}
  const damageBonus = 1 + (mods['damage'] ?? 0)
  const rangeBonus = 1 + (mods['range'] ?? 0)
  const speedBonus = mods['attack_speed'] ?? 0

  // Bug #1 fix: pick up current global tower buff state so a tower built
  // during an active range/damage buff starts with the right effective stats.
  // Cooldown is read on-the-fly via effectiveCooldown(); range is cached on
  // the tower so renderers/targeting can read it without state in scope.
  const buffRangeMult = 1 + (buffState?.towerRangeBonus ?? 0)

  const tower: Tower = {
    id: `tower_${++_nextId}`,
    type,
    x,
    y,
    params,
    cost: def.cost,
    active: true,
    configured: false,
    disabled: false,
    level: 1,

    baseDamage: def.damage,
    baseRange: def.range,
    baseCritChance: def.baseCritChance,
    effectiveDamage: 0,
    effectiveRange: def.range * rangeBonus * buffRangeMult,
    cooldown: def.cooldown * (1 - speedBonus),
    cooldownTimer: 0,

    damageBonus,
    rangeBonus,
    talentMods: mods,
    magicBuff: 1,
    interferenceFactor: 1,
    color: def.color,
  }
  recomputeEffectiveDamage(tower, buffState)

  if (type === TowerType.MAGIC) {
    tower.magicMode = 'debuff'
    tower.magicExpression = ''
  }

  if (type === TowerType.RADAR_A || type === TowerType.RADAR_B || type === TowerType.RADAR_C) {
    tower.arcStart = 0
    tower.arcEnd = Math.PI / 2
    tower.arcRestrict = false
    // Radar towers ship with a fully playable default arc (unrestricted full
    // sweep), so — unlike Magic/Limit/Calculus, which genuinely need player
    // input — they must fire automatically on placement (spec: "towers fire
    // automatically"). Mark them configured so RadarTowerSystem.update doesn't
    // skip them before the player opens the arc panel. Re-applying the panel
    // still re-seeds the needle via RADAR_ARC_CHANGED.
    tower.configured = true
  }

  if (type === TowerType.RADAR_B || type === TowerType.RADAR_C) {
    // Default to "first" so single-target shooters prioritize the enemy
    // closest to the goal — matches conventional TD player expectations.
    tower.targetingMode = 'first'
  }

  if (type === TowerType.MATRIX) {
    tower.matrixPairId = null
  }

  if (type === TowerType.LIMIT) {
    tower.limitResult = null
  }

  if (type === TowerType.CALCULUS) {
    tower.calculusState = null
  }

  return tower
}
