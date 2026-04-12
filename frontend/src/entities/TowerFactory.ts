/**
 * TowerFactory — tower factory
 * Creates default tower objects; parameters are injected via the BuildPanel → CastSpell flow.
 */
import { TOWER_DEFS } from '@/data/tower-defs'
import { TOWER_PARAM_FIELDS } from '@/data/ui-defs'
import type { TowerType } from '@/data/constants'
import type { Tower, TowerParams } from './types'

let _nextId = 0

export function createTower(type: TowerType, x: number, y: number): Tower {
  const def = TOWER_DEFS[type]
  if (!def) throw new Error(`Unknown tower type: ${type}`)

  // Initialize params with default values from ui-defs
  const params: TowerParams = {}
  for (const field of TOWER_PARAM_FIELDS[type] ?? []) {
    params[field.key] = field.default
  }

  return {
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
    effectiveDamage: def.damage,
    effectiveRange: def.range,
    cooldown: def.cooldown,
    cooldownTimer: 0,

    damageBonus: 1,
    rangeBonus: 1,
    color: def.color,
  }
}
