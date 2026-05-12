import type { Pet, PetTrait } from './types'

let _nextPetId = 0

const ATTACK_RANGE = 20
const SPAWN_OFFSET = 25

function traitFromExponent(n: number): PetTrait {
  if (n === 1) return 'slow'
  if (n === 2) return 'fast'
  if (n === 3) return 'heavy'
  return 'basic'
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
  const count = (isInteger ? coefficient : 1) + bonusCount
  const abilityMod = isInteger ? 1 : Math.abs(coefficient)

  // Mod multipliers from talents + upgrade extras
  const dmgMult       = (1 + (mods['pet_damage'] ?? 0)) * towerDamageMultiplier
  const atkSpdMult    = 1 - (mods['pet_attack_speed'] ?? 0)
  const moveSpdMod    = 1 + (mods['pet_speed'] ?? 0)

  // Level scaling: each level adds 30% dmg, 15% faster attack, 20% faster movement
  const levelDmgMult  = 1 + 0.3 * (level - 1)
  const levelAtkMult  = Math.pow(0.85, level - 1)
  const levelMoveMult = 1 + 0.2 * (level - 1)

  // Calculus scaling: coefficient → damage bonus, exponent → movement bonus
  // Represents the "power" of the polynomial after differentiation / integration
  const coeffDmgBonus = 1 + 0.05 * Math.max(0, coefficient - 1)
  const expMoveBonus  = 1 + 0.08 * (exponent - 1)

  const baseDmg      = trait === 'heavy' ? 15 : trait === 'fast' ? 5 : 8
  const baseAtkSpd   = trait === 'fast' ? 0.3 : trait === 'heavy' ? 1.5 : 0.8
  const baseMoveSpd  = trait === 'fast' ? 220 : trait === 'slow' ? 60 : trait === 'heavy' ? 45 : 100

  const pets: Pet[] = []
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count
    pets.push({
      id: `pet_${++_nextPetId}`,
      ownerId,
      x: x + Math.cos(angle) * SPAWN_OFFSET,
      y: y + Math.sin(angle) * SPAWN_OFFSET,
      damage:      baseDmg * abilityMod * dmgMult * levelDmgMult * coeffDmgBonus,
      speed:       baseMoveSpd * levelMoveMult * expMoveBonus * moveSpdMod,
      attackSpeed: Math.max(0.1, baseAtkSpd * atkSpdMult * levelAtkMult),
      range:       ATTACK_RANGE,
      trait,
      abilityMod,
      cooldownTimer: 0,
      targetId: null,
      active: true,
    })
  }
  return pets
}
