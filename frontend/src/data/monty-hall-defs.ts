export interface MontyHallThreshold {
  killValue: number
  doorCount: number       // 3-5 doors
}

export const MONTY_HALL_THRESHOLDS_BY_STAR: Record<number, MontyHallThreshold[]> = {
  1: [
    { killValue: 50,  doorCount: 3 },
    { killValue: 120, doorCount: 3 },
  ],
  2: [
    { killValue: 80,  doorCount: 3 },
    { killValue: 200, doorCount: 4 },
    { killValue: 350, doorCount: 4 },
  ],
  3: [
    { killValue: 120, doorCount: 3 },
    { killValue: 300, doorCount: 4 },
    { killValue: 500, doorCount: 5 },
  ],
  4: [
    { killValue: 150, doorCount: 4 },
    { killValue: 400, doorCount: 4 },
    { killValue: 700, doorCount: 5 },
    { killValue: 1000, doorCount: 5 },
  ],
  5: [
    { killValue: 200, doorCount: 4 },
    { killValue: 500, doorCount: 5 },
    { killValue: 900, doorCount: 5 },
    { killValue: 1400, doorCount: 5 },
  ],
}

export interface MontyHallReward {
  id: string
  name: string
  description: string
  effectId: string
  revertId?: string
  duration: number        // seconds (0 = instant)
}

export const MONTY_HALL_REWARD_POOL: MontyHallReward[] = [
  {
    id: 'mh_atk_double',
    name: 'Power Surge',
    description: 'All towers deal double damage for 30s',
    effectId: 'ALL_TOWERS_DAMAGE_MULTIPLY_2',
    revertId: 'ALL_TOWERS_DAMAGE_DIVIDE_2',
    duration: 30,
  },
  {
    id: 'mh_range_up',
    name: 'Eagle Eye',
    description: 'All towers +50% range for 25s',
    effectId: 'ALL_TOWERS_RANGE_MULTIPLY_1_5',
    revertId: 'ALL_TOWERS_RANGE_DIVIDE_1_5',
    duration: 25,
  },
  {
    id: 'mh_slow_all',
    name: 'Time Warp',
    description: 'All enemies slowed by 40% for 20s',
    effectId: 'ENEMY_SPEED_MULTIPLIER_0_6',
    revertId: 'ENEMY_SPEED_MULTIPLIER_RESET',
    duration: 20,
  },
  {
    id: 'mh_gold_rush',
    name: 'Gold Rush',
    description: 'Triple gold from kills for 20s',
    effectId: 'GOLD_MULTIPLIER_TRIPLE',
    revertId: 'GOLD_MULTIPLIER_TRIPLE_REVERT',
    duration: 20,
  },
  {
    id: 'mh_heal_full',
    name: 'Divine Blessing',
    description: 'Restore HP to full',
    effectId: 'HEAL_FULL',
    duration: 0,
  },
  {
    id: 'mh_free_towers',
    name: 'Master Builder',
    description: 'Next 2 towers are free',
    effectId: 'FREE_TOWER_CHARGES_2',
    duration: 0,
  },
]
