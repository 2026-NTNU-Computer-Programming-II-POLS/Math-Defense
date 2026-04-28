export type SpellTargetMode = 'area' | 'single' | 'self'

export interface SpellDef {
  id: string
  name: string
  description: string
  cost: number
  cooldown: number        // seconds
  targetMode: SpellTargetMode
  radius?: number         // game units (for area spells)
  damage?: number
  duration?: number       // seconds (for lingering effects)
  slowFactor?: number     // multiplier (e.g. 0.5 = 50% speed)
  color: string
}

export const SPELL_DEFS: SpellDef[] = [
  {
    id: 'fireball',
    name: 'Fireball',
    description: 'AoE damage to enemies in radius',
    cost: 80,
    cooldown: 12,
    targetMode: 'area',
    radius: 3,
    damage: 60,
    color: '#ff6030',
  },
  {
    id: 'slow',
    name: 'Frost Nova',
    description: 'Temporarily slow enemies in area',
    cost: 60,
    cooldown: 15,
    targetMode: 'area',
    radius: 4,
    duration: 5,
    slowFactor: 0.4,
    color: '#60c0ff',
  },
  {
    id: 'lightning',
    name: 'Lightning',
    description: 'High single-target damage',
    cost: 100,
    cooldown: 18,
    targetMode: 'single',
    damage: 150,
    color: '#f0e060',
  },
  {
    id: 'heal',
    name: 'Rejuvenate',
    description: 'Boost all tower stats briefly',
    cost: 120,
    cooldown: 25,
    targetMode: 'self',
    duration: 8,
    color: '#60f090',
  },
]

export const SPELL_MAP = new Map(SPELL_DEFS.map((s) => [s.id, s]))
