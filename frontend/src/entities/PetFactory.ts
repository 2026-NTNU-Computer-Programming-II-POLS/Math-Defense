import type { Pet, PetTrait } from './types'

let _nextPetId = 0

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
  range: number,
  coefficient: number,
  exponent: number,
  mods: Record<string, number> = {},
): Pet[] {
  if (coefficient === 0 || exponent === 0) return []

  const trait = traitFromExponent(exponent)
  const isInteger = Number.isInteger(coefficient) && coefficient > 0
  const count = isInteger ? coefficient : 1
  const abilityMod = isInteger ? 1 : Math.abs(coefficient)

  const dmgMult = 1 + (mods['pet_damage'] ?? 0)
  const speedMult = 1 - (mods['pet_attack_speed'] ?? 0)
  const hpMult = 1 + (mods['pet_hp'] ?? 0)

  const baseDmg = trait === 'heavy' ? 15 : trait === 'fast' ? 5 : 8
  const baseSpeed = trait === 'fast' ? 0.3 : trait === 'heavy' ? 1.5 : 0.8
  const baseHp = trait === 'heavy' ? 60 : 30

  const pets: Pet[] = []
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count
    const dist = range * 0.4
    pets.push({
      id: `pet_${++_nextPetId}`,
      ownerId,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      hp: baseHp * hpMult,
      maxHp: baseHp * hpMult,
      damage: baseDmg * abilityMod * dmgMult,
      attackSpeed: Math.max(0.1, baseSpeed * speedMult),
      range,
      trait,
      abilityMod,
      cooldownTimer: 0,
      targetId: null,
      active: true,
    })
  }
  return pets
}
