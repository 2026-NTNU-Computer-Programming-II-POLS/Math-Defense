import type { Pet, PetTrait } from './types'

let _nextPetId = 0

// Distances are in game units (UNIT_PX = 20 px/unit); the grid spans only ±14 units,
// so these must be unit-scale values, not pixel-scale.
const BASE_ATTACK_RANGE = 1
const SPAWN_OFFSET = 1.25

function traitFromExponent(n: number): PetTrait {
  if (n === 1) return 'slow'
  if (n === 2) return 'fast'
  if (n === 3) return 'heavy'
  return 'basic'
}

/**
 * Pet count yielded by a Calculus monomial coefficient. Q12 log-compression so
 * a large coefficient (e.g. 99) spawns a handful of pets, not 99. `max(1, …)`
 * floors a fractional/zero coefficient at log2(2) = 1; bonusCount from talents
 * stacks linearly on top. Exported so CalculusPanel previews the SAME count the
 * engine spawns — there must be no second formula that can drift out of sync.
 */
export function petCountForCoefficient(coefficient: number, bonusCount = 0): number {
  return Math.floor(Math.log2(Math.max(1, coefficient) + 1)) + bonusCount
}

export function spawnPets(
  ownerId: string,
  x: number,
  y: number,
  coefficient: number,
  exponent: number,
  mods: Record<string, number> = {},
  towerDamageMultiplier = 1,
  level = 1,
): Pet[] {
  if (coefficient === 0 || exponent === 0) return []

  const trait = traitFromExponent(exponent)
  const isInteger = Number.isInteger(coefficient) && coefficient > 0
  const bonusCount = Math.floor(mods['pet_count'] ?? 0)
  // Q12 log-compression lives in petCountForCoefficient so the panel preview and
  // the engine spawn from one formula; bonusCount from talents stacks on top.
  const count = petCountForCoefficient(coefficient, bonusCount)
  const abilityMod = isInteger ? 1 : Math.abs(coefficient)

  // Mod multipliers from talents + upgrade extras
  const dmgMult       = (1 + (mods['pet_damage'] ?? 0)) * towerDamageMultiplier
  const atkSpdMult    = 1 - (mods['pet_attack_speed'] ?? 0)
  const moveSpdMod    = 1 + (mods['pet_speed'] ?? 0)
  // Q10: pet_range talent (Extended Reach) widens the pet engagement radius.
  const rangeMult     = 1 + (mods['pet_range'] ?? 0)
  // Phase 7 (Q14): pet_crit talent — per-pet crit chance baked at spawn so
  // PetCombatSystem can roll game.rng() without re-walking the talent tree.
  // Clamp to [0, 1] in case future stacking pushes the raw mod past 1.
  const critChance    = Math.min(1, Math.max(0, mods['pet_crit'] ?? 0))

  // Level scaling: each level adds 30% dmg, 10% faster attack (linear, floored at 0.1), 20% faster movement
  const levelDmgMult  = 1 + 0.3 * (level - 1)
  const levelAtkMult  = Math.max(0.1, 1 - 0.1 * (level - 1))
  const levelMoveMult = 1 + 0.2 * (level - 1)

  // Calculus scaling: coefficient → damage bonus, exponent → movement bonus
  // Represents the "power" of the polynomial after differentiation / integration
  const coeffDmgBonus = 1 + 0.05 * Math.max(0, coefficient - 1)
  const expMoveBonus  = 1 + 0.08 * (exponent - 1)

  const baseDmg      = trait === 'heavy' ? 15 : trait === 'fast' ? 5 : 8
  const baseAtkSpd   = trait === 'fast' ? 0.3 : trait === 'heavy' ? 1.5 : 0.8
  // Game units per second (cf. enemy speeds 0.7–4.0 in enemy-defs.ts).
  const baseMoveSpd  = trait === 'fast' ? 11 : trait === 'slow' ? 3 : trait === 'heavy' ? 2.25 : 5

  const pets: Pet[] = []
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count
    const homeX = x + Math.cos(angle) * SPAWN_OFFSET
    const homeY = y + Math.sin(angle) * SPAWN_OFFSET
    pets.push({
      id: `pet_${++_nextPetId}`,
      ownerId,
      x: homeX,
      y: homeY,
      homeX,
      homeY,
      damage:      baseDmg * abilityMod * dmgMult * levelDmgMult * coeffDmgBonus,
      speed:       baseMoveSpd * levelMoveMult * expMoveBonus * moveSpdMod,
      attackSpeed: Math.max(0.1, baseAtkSpd * atkSpdMult * levelAtkMult),
      range:       BASE_ATTACK_RANGE * rangeMult,
      trait,
      abilityMod,
      cooldownTimer: 0,
      targetId: null,
      active: true,
      critChance,
    })
  }
  return pets
}
