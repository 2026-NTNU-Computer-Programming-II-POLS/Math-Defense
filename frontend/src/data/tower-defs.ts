import { TowerType, Colors } from './constants'

export type MagicMode = 'debuff' | 'buff'

export interface UpgradeTier {
  costPercent: number
  damageBonus: number
  rangeBonus: number
  speedBonus: number
  extra?: Record<string, number>
}

export interface TowerDef {
  type: TowerType
  name: string
  nameEn: string
  color: string
  cost: number
  damage: number
  range: number
  cooldown: number
  unlockLevel: number
  description: string
  mathConcept: string
  upgrades: UpgradeTier[]
}

const UPGRADE_TIER_2: UpgradeTier = { costPercent: 0.6, damageBonus: 0.25, rangeBonus: 0.1, speedBonus: 0 }
const UPGRADE_TIER_3: UpgradeTier = { costPercent: 1.0, damageBonus: 0.5, rangeBonus: 0.2, speedBonus: 0.15 }

export const TOWER_DEFS: Record<TowerType, TowerDef> = {
  [TowerType.MAGIC]: {
    type: TowerType.MAGIC,
    name: 'Magic Tower',
    nameEn: 'Magic Tower',
    color: Colors.MAGIC,
    cost: 60,
    damage: 8,
    range: 10,
    cooldown: 1.0,
    unlockLevel: 1,
    description: 'Draws a math function curve as a zone of effect. Toggle between debuff enemies or buff allied towers.',
    mathConcept: 'Function curves (polynomial, trig, log)',
    upgrades: [UPGRADE_TIER_2, UPGRADE_TIER_3],
  },
  [TowerType.RADAR_A]: {
    type: TowerType.RADAR_A,
    name: 'Radar A — Sweep',
    nameEn: 'Radar A — Sweep',
    color: Colors.RADAR_A,
    cost: 50,
    damage: 5,
    range: 6,
    cooldown: 0.5,
    unlockLevel: 1,
    description: 'Continuous sweep around circle, AoE damage on contact.',
    mathConcept: 'Radian intervals, arc sectors',
    upgrades: [
      { ...UPGRADE_TIER_2, extra: { sweepSpeed: 0.2 } },
      { ...UPGRADE_TIER_3, extra: { sweepSpeed: 0.4, aoeWidth: 0.3 } },
    ],
  },
  [TowerType.RADAR_B]: {
    type: TowerType.RADAR_B,
    name: 'Radar B — Rapid',
    nameEn: 'Radar B — Rapid',
    color: Colors.RADAR_B,
    cost: 65,
    damage: 8,
    range: 7,
    cooldown: 0.3,
    unlockLevel: 2,
    description: 'Fast single-target projectile shots.',
    mathConcept: 'Radian intervals, arc sectors',
    upgrades: [
      { ...UPGRADE_TIER_2, extra: { targetCount: 1 } },
      { ...UPGRADE_TIER_3, extra: { targetCount: 2 } },
    ],
  },
  [TowerType.RADAR_C]: {
    type: TowerType.RADAR_C,
    name: 'Radar C — Sniper',
    nameEn: 'Radar C — Sniper',
    color: Colors.RADAR_C,
    cost: 90,
    damage: 40,
    range: 12,
    cooldown: 2.5,
    unlockLevel: 2,
    description: 'Slow powerful single-target shots with long range.',
    mathConcept: 'Radian intervals, arc sectors',
    upgrades: [
      { ...UPGRADE_TIER_2, extra: { critChance: 0.1 } },
      { ...UPGRADE_TIER_3, extra: { critChance: 0.2, critDamage: 0.5 } },
    ],
  },
  [TowerType.MATRIX]: {
    type: TowerType.MATRIX,
    name: 'Matrix Tower',
    nameEn: 'Matrix Tower',
    color: Colors.MATRIX,
    cost: 80,
    damage: 0,
    range: 8,
    cooldown: 0.5,
    unlockLevel: 2,
    description: 'Pair two towers. Base damage = dot product of their grid coordinate vectors. Laser locks on and ramps damage.',
    mathConcept: 'Dot product, vectors',
    upgrades: [
      { ...UPGRADE_TIER_2, extra: { rampRate: 0.2 } },
      { ...UPGRADE_TIER_3, extra: { rampRate: 0.4, targetCount: 1 } },
    ],
  },
  [TowerType.LIMIT]: {
    type: TowerType.LIMIT,
    name: 'Limit Tower',
    nameEn: 'Limit Tower',
    color: Colors.LIMIT,
    cost: 70,
    damage: 25,
    range: 8,
    cooldown: 3.0,
    unlockLevel: 3,
    description: 'Answer lim f(x)/(x-a) as x→a. Result determines tower effect: +∞ = max damage, 0 = removed.',
    mathConcept: 'Limits, L\'Hôpital\'s rule',
    upgrades: [UPGRADE_TIER_2, UPGRADE_TIER_3],
  },
  [TowerType.CALCULUS]: {
    type: TowerType.CALCULUS,
    name: 'Calculus Tower',
    nameEn: 'Calculus Tower',
    color: Colors.CALCULUS,
    cost: 100,
    damage: 0,
    range: 10,
    cooldown: 0,
    unlockLevel: 3,
    description: 'Choose a function, then derivative or integral. Result C*x^n spawns C pets with trait based on n.',
    mathConcept: 'Derivatives, integrals, power rule',
    upgrades: [
      { ...UPGRADE_TIER_2, extra: { petHp: 0.25 } },
      { ...UPGRADE_TIER_3, extra: { petHp: 0.5, petCount: 1 } },
    ],
  },
}
