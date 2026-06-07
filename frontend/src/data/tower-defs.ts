import { TowerType } from './constants'

function validateTowerDefs(defs: Record<string, TowerDef>): void {
  const allTypes = Object.values(TowerType) as string[]
  for (const type of allTypes) {
    const def = defs[type]
    if (!def) throw new Error(`[tower-defs] missing definition for TowerType '${type}'`)
    if (def.cost <= 0) throw new Error(`[tower-defs] ${type}: cost must be > 0 (got ${def.cost})`)
    if (def.range <= 0) throw new Error(`[tower-defs] ${type}: range must be > 0 (got ${def.range})`)
    if (def.damage < 0) throw new Error(`[tower-defs] ${type}: damage must be >= 0 (got ${def.damage})`)
    if (!def.examRelevance || def.examRelevance.trim().length === 0) {
      throw new Error(`[tower-defs] ${type}: examRelevance must be a non-empty string`)
    }
    if (!def.glyph || def.glyph.length === 0) {
      throw new Error(`[tower-defs] ${type}: glyph must be a non-empty string`)
    }
    if (!def.color || !/^#[0-9A-Fa-f]{6}$/.test(def.color)) {
      throw new Error(`[tower-defs] ${type}: color must be a #RRGGBB hex (got ${def.color})`)
    }
    if (def.upgrades.length === 0) throw new Error(`[tower-defs] ${type}: upgrades array is empty`)
    for (let i = 0; i < def.upgrades.length; i++) {
      const tier = def.upgrades[i]
      if (tier.costPercent <= 0) throw new Error(`[tower-defs] ${type} tier ${i}: costPercent must be > 0`)
      if (tier.speedBonus >= 1) throw new Error(`[tower-defs] ${type} tier ${i}: speedBonus must be < 1 to avoid zero/negative cooldown`)
    }
  }
}

export type MagicMode = 'debuff' | 'buff'

// On-canvas hue for a Magic tower per mode — mirrors the --tw-magic-debuff /
// --tw-magic-buff design tokens (variables.css) so the placed tower body, its
// zone-of-effect band, and the mode toggle all read as the same colour. A
// Magic tower's render colour is mode-driven rather than the static def colour.
export const MAGIC_MODE_COLORS: Record<MagicMode, string> = {
  debuff: '#8A75A8', // --tw-magic-debuff
  buff:   '#C8B5DA', // --tw-magic-buff
}

// Math discipline a tower's mechanic belongs to. Drives the TowerBar category
// filter chips; also available to any future UI/curriculum surface that wants
// to group towers by topic (e.g. an in-game tutorial index).
export type TowerCategory = 'geometry' | 'functions' | 'algebra' | 'calculus'

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
  // Single tower identity colour — used both on-canvas (body, attack range,
  // projectiles) and by out-of-canvas UI cards (TowerBar, TowerInfoPanel,
  // talent tree) so a placed tower visually matches its button.
  color: string
  cost: number
  damage: number
  range: number
  cooldown: number
  // Innate crit chance (RADAR_C only; other towers omit it → treated as 0).
  // Crit DAMAGE comes from the Tier-2/3 `critDamage` upgrade extra plus the
  // `crit_damage` talent; this base chance guarantees those amplifiers always
  // have crits to act on, so the crit_damage talent is never dead weight on a
  // not-yet-upgraded tower. RADAR_C's crit chance upgrades stack on top.
  baseCritChance?: number
  unlockLevel: number
  description: string
  mathConcept: string
  examRelevance: string
  // Color-blind disambiguation: a unique Unicode glyph rendered alongside the
  // tower's hue-coded body so type is identifiable in greyscale (WCAG 2.2 SC 1.4.1).
  glyph: string
  category: TowerCategory
  upgrades: UpgradeTier[]
}

const UPGRADE_TIER_2: UpgradeTier = { costPercent: 0.6, damageBonus: 0.25, rangeBonus: 0.1, speedBonus: 0 }
const UPGRADE_TIER_3: UpgradeTier = { costPercent: 1.0, damageBonus: 0.5, rangeBonus: 0.2, speedBonus: 0.15 }

export const TOWER_DEFS: Record<TowerType, TowerDef> = {
  [TowerType.MAGIC]: {
    type: TowerType.MAGIC,
    name: 'Magic Tower',
    nameEn: 'Magic Tower',
    color: '#9C8BB0',
    cost: 60,
    damage: 8,
    range: 10,
    cooldown: 1.0,
    unlockLevel: 1,
    description: 'Draws a math function curve as a zone of effect. Toggle between Debuff (enemies in the band take DoT and are slowed for 2s) or Buff (allied towers in a wider band gain damage).',
    mathConcept: 'Function curves (polynomial, trig, log)',
    examRelevance: "Polynomial and trigonometric curves appear on Taiwan's GSAT Math A and on AP Precalculus.",
    glyph: '✦',
    category: 'functions',
    upgrades: [UPGRADE_TIER_2, UPGRADE_TIER_3],
  },
  [TowerType.RADAR_A]: {
    type: TowerType.RADAR_A,
    name: 'Radar A — Sweep',
    nameEn: 'Radar A — Sweep',
    color: '#8FAA77',
    cost: 50,
    damage: 5,
    range: 6,
    cooldown: 0.5,
    unlockLevel: 1,
    description: 'A needle sweeps the circle and pings every enemy the beam passes — one hit per pass, low per-enemy but unlimited targets. Faster sweep = more hits. Restrict to confine the wiper to a chosen arc.',
    mathConcept: 'Radian intervals, arc sectors',
    examRelevance: 'Radian measure and arc identification are on the GSAT Math B unit and the AP Calculus AB exam.',
    glyph: '◐',
    category: 'geometry',
    upgrades: [
      { ...UPGRADE_TIER_2, extra: { sweepSpeed: 0.2 } },
      { ...UPGRADE_TIER_3, extra: { sweepSpeed: 0.4, aoeWidth: 0.3 } },
    ],
  },
  [TowerType.RADAR_B]: {
    type: TowerType.RADAR_B,
    name: 'Radar B — Rapid',
    nameEn: 'Radar B — Rapid',
    color: '#7D9BBE',
    cost: 65,
    damage: 8,
    range: 7,
    cooldown: 0.3,
    unlockLevel: 2,
    description: 'Fast single-target projectile shots.',
    mathConcept: 'Radian intervals, arc sectors',
    examRelevance: 'Radian measure and arc identification are on the GSAT Math B unit and the AP Calculus AB exam.',
    glyph: '◑',
    category: 'geometry',
    upgrades: [
      { ...UPGRADE_TIER_2, extra: { targetCount: 1 } },
      { ...UPGRADE_TIER_3, extra: { targetCount: 2 } },
    ],
  },
  [TowerType.RADAR_C]: {
    type: TowerType.RADAR_C,
    name: 'Radar C — Sniper',
    nameEn: 'Radar C — Sniper',
    color: '#B07E5C',
    cost: 90,
    damage: 40,
    range: 12,
    cooldown: 2.5,
    baseCritChance: 0.05,
    unlockLevel: 2,
    description: 'Slow powerful single-target shots with long range.',
    mathConcept: 'Radian intervals, arc sectors',
    examRelevance: 'Radian measure and arc identification are on the GSAT Math B unit and the AP Calculus AB exam.',
    glyph: '◒',
    category: 'geometry',
    upgrades: [
      { ...UPGRADE_TIER_2, extra: { critChance: 0.1 } },
      { ...UPGRADE_TIER_3, extra: { critChance: 0.2, critDamage: 0.5 } },
    ],
  },
  [TowerType.MATRIX]: {
    type: TowerType.MATRIX,
    name: 'Matrix Tower',
    nameEn: 'Matrix Tower',
    color: '#C9BB6E',
    cost: 80,
    damage: 1,
    range: 8,
    cooldown: 0.5,
    unlockLevel: 2,
    description: 'Pairing required. When paired, base damage = 1 + dot product of the towers’ grid coordinate vectors. Laser locks on and ramps damage.',
    mathConcept: 'Dot product, vectors',
    examRelevance: '2×2 matrices and the dot product are on the AST Math (學測數學) Linear Algebra unit.',
    glyph: '⊞',
    category: 'algebra',
    upgrades: [
      { ...UPGRADE_TIER_2, extra: { rampRate: 0.2 } },
      { ...UPGRADE_TIER_3, extra: { rampRate: 0.4, targetCount: 1 } },
    ],
  },
  [TowerType.LIMIT]: {
    type: TowerType.LIMIT,
    name: 'Limit Tower',
    nameEn: 'Limit Tower',
    color: '#C9A99E',
    cost: 70,
    damage: 25,
    range: 8,
    cooldown: 3.0,
    unlockLevel: 3,
    description: 'Answer: lim [f(x)/(x-a)] as x→a⁺. Charges for 3s, then bursts every enemy in range at 1.5× damage. +∞ instakills; +C bursts scaled damage; wrong/degenerate answers chip.',
    mathConcept: 'Limits, L\'Hôpital\'s rule',
    examRelevance: 'One-sided and infinite limits are on AP Calculus AB and the AST Calculus subject test.',
    glyph: '∞',
    category: 'functions',
    upgrades: [UPGRADE_TIER_2, UPGRADE_TIER_3],
  },
  [TowerType.CALCULUS]: {
    type: TowerType.CALCULUS,
    name: 'Calculus Tower',
    nameEn: 'Calculus Tower',
    color: '#9C958D',
    cost: 100,
    damage: 0,
    range: 10,
    cooldown: 0,
    unlockLevel: 3,
    description: 'Choose a function, then solve its derivative or integral. Result C*x^n spawns C pets with trait based on n.',
    mathConcept: 'Derivatives, integrals, power rule',
    examRelevance: 'Differentiation and integration of polynomials are on AP Calculus AB Section I.',
    glyph: '∫',
    category: 'calculus',
    upgrades: [
      { ...UPGRADE_TIER_2, extra: { petDamage: 0.25 } },
      { ...UPGRADE_TIER_3, extra: { petDamage: 0.5, petCount: 1, petSpeed: 0.2 } },
    ],
  },
}

validateTowerDefs(TOWER_DEFS)
