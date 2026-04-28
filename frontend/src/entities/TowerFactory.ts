import { TOWER_DEFS } from '@/data/tower-defs'
import { TOWER_PARAM_FIELDS } from '@/data/ui-defs'
import { TowerType } from '@/data/constants'
import type { Tower, TowerParams } from './types'

let _nextId = 0

export function createTower(
  type: TowerType,
  x: number,
  y: number,
  modifiers?: Record<string, number>,
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
    effectiveDamage: def.damage * damageBonus,
    effectiveRange: def.range * rangeBonus,
    cooldown: def.cooldown * (1 - speedBonus),
    cooldownTimer: 0,

    damageBonus,
    rangeBonus,
    talentMods: mods,
    magicBuff: 1,
    color: def.color,
  }

  if (type === TowerType.MAGIC) {
    tower.magicMode = 'debuff'
    tower.magicFunctionIndex = -1
  }

  if (type === TowerType.RADAR_A || type === TowerType.RADAR_B || type === TowerType.RADAR_C) {
    tower.arcStart = 0
    tower.arcEnd = Math.PI / 2
    tower.arcRestrict = false
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
