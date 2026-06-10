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
  slowFactor?: number     // fraction of speed REMOVED; MovementSystem applies base × (1 − slowFactor), so 0.6 → 40% effective speed (NOT a remaining-speed multiplier)
  color: string
  vfxDuration?: number    // seconds — overrides the default VFX lifetime (0.65 s)
  showVfxOnMiss?: boolean // emit SPELL_EFFECT even when the AoE refund path is taken
}

export const SPELL_DEFS: SpellDef[] = [
  {
    id: 'fireball',
    name: 'Exponential',
    description: 'AoE burst whose value blows up exponentially across the radius',
    cost: 80,
    cooldown: 12,
    targetMode: 'area',
    radius: 3,
    damage: 60,
    color: '#ff6030',
    vfxDuration: 1.35,
    showVfxOnMiss: true,
  },
  {
    id: 'slow',
    name: 'Asymptote',
    description: 'Drive enemy speed asymptotically toward zero in an area',
    cost: 60,
    cooldown: 15,
    targetMode: 'area',
    radius: 4,
    duration: 5,
    // 40% effective speed = base × (1 − 0.6); matches spec/manual ("slow to 40% speed").
    // Previously 0.4 here delivered 60% speed because the engine treats slowFactor as
    // the fraction REMOVED, not a remaining-speed multiplier (same field semantics as Magic).
    slowFactor: 0.6,
    color: '#60c0ff',
    vfxDuration: 1.45,
  },
  {
    id: 'lightning',
    name: 'Impulse',
    description: 'A single-target Dirac-delta spike concentrating all the energy at one point',
    cost: 100,
    cooldown: 18,
    targetMode: 'single',
    damage: 150,
    color: '#f0e060',
    vfxDuration: 0.85,
  },
  {
    id: 'haste',
    name: 'Acceleration',
    description: 'All towers deal 1.5× damage briefly, like output rising at rate dv/dt',
    cost: 120,
    cooldown: 25,
    targetMode: 'self',
    duration: 8,
    color: '#7cf7b5',
    vfxDuration: 1.05,
  },
]

export const SPELL_MAP = new Map(SPELL_DEFS.map((s) => [s.id, s]))
