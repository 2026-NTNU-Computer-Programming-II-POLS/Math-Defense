export type BuffCategory = 'tower' | 'enemy' | 'economy' | 'defense'
export type BuffTarget = 'allTowers' | 'allEnemies' | 'player'

export interface BuffDef {
  id: string
  name: string
  description: string
  category: BuffCategory
  target: BuffTarget
  cost: number
  duration: number        // seconds (0 = instant)
  effectId: string
  revertId?: string
}

export type BuffCard = BuffDef & { isCurse: boolean; probability: number; goldReward?: number }

export const PURCHASABLE_BUFFS: BuffDef[] = [
  // ── Tower buffs ──
  {
    id: 'shop_atk_20',
    name: 'Sharpen Blades',
    description: 'All towers +20% damage for 60s',
    category: 'tower',
    target: 'allTowers',
    cost: 80,
    duration: 60,
    effectId: 'ALL_TOWERS_DAMAGE_MULTIPLY_1_2',
    revertId: 'ALL_TOWERS_DAMAGE_DIVIDE_1_2',
  },
  {
    id: 'shop_speed_15',
    name: 'Overclock',
    description: 'All towers +15% attack speed for 45s',
    category: 'tower',
    target: 'allTowers',
    cost: 100,
    duration: 45,
    effectId: 'ALL_TOWERS_SPEED_MULTIPLY_1_15',
    revertId: 'ALL_TOWERS_SPEED_DIVIDE_1_15',
  },
  {
    id: 'shop_range_15',
    name: 'Far Sight',
    description: 'All towers +15% range for 50s',
    category: 'tower',
    target: 'allTowers',
    cost: 70,
    duration: 50,
    effectId: 'ALL_TOWERS_RANGE_MULTIPLY_1_15',
    revertId: 'ALL_TOWERS_RANGE_DIVIDE_1_15',
  },

  // ── Enemy debuffs ──
  {
    id: 'shop_slow_15',
    name: 'Quagmire',
    description: 'All enemies -15% speed for 30s',
    category: 'enemy',
    target: 'allEnemies',
    cost: 90,
    duration: 30,
    effectId: 'ENEMY_SPEED_MULTIPLIER_0_85',
    revertId: 'ENEMY_SPEED_MULTIPLIER_RESET',
  },
  {
    id: 'shop_weak_10',
    name: 'Corrode Armor',
    description: 'All enemies take 10% more damage for 40s',
    category: 'enemy',
    target: 'allEnemies',
    cost: 110,
    duration: 40,
    effectId: 'ENEMY_VULNERABILITY_1_1',
    revertId: 'ENEMY_VULNERABILITY_RESET',
  },

  // ── Defense / Utility ──
  {
    id: 'shop_heal_5',
    name: 'Heal 5 HP',
    description: 'Restore 5 HP immediately',
    category: 'defense',
    target: 'player',
    cost: 60,
    duration: 0,
    effectId: 'HEAL_5',
  },
  {
    id: 'shop_heal_10',
    name: 'Heal 10 HP',
    description: 'Restore 10 HP immediately',
    category: 'defense',
    target: 'player',
    cost: 100,
    duration: 0,
    effectId: 'HEAL_10',
  },
  {
    id: 'shop_shield',
    name: 'Ward Shield',
    description: 'Absorb next 3 damage for 30s',
    category: 'defense',
    target: 'player',
    cost: 120,
    duration: 30,
    effectId: 'SHIELD_ACTIVATE',
    revertId: 'SHIELD_DEACTIVATE',
  },
  {
    id: 'shop_gold_mult',
    name: 'Prospector',
    description: 'Double gold from kills for 30s',
    category: 'economy',
    target: 'player',
    cost: 50,
    duration: 30,
    effectId: 'GOLD_MULTIPLIER_DOUBLE',
    revertId: 'GOLD_MULTIPLIER_RESET',
  },
]

export const BUFF_MAP = new Map(PURCHASABLE_BUFFS.map((b) => [b.id, b]))
