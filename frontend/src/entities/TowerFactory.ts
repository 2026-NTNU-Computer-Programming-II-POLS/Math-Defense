/**
 * TowerFactory — 塔工廠
 * 建立預設塔物件；參數設定透過 BuildPanel → CastSpell 流程注入。
 */
import { TOWER_DEFS } from '@/data/tower-defs'
import { TOWER_PARAM_FIELDS } from '@/data/ui-defs'
import type { TowerType } from '@/data/constants'
import type { Tower, TowerParams } from './types'

let _nextId = 0

export function createTower(type: TowerType, x: number, y: number): Tower {
  const def = TOWER_DEFS[type]
  if (!def) throw new Error(`Unknown tower type: ${type}`)

  // 用 ui-defs 的 default 值初始化 params
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

    damageBonus: 0,
    rangeBonus: 0,
    color: def.color,
  }
}
