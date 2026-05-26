import { describe, it, expect } from 'vitest'
import { spawnPets } from '../PetFactory'

describe('PetFactory.spawnPets', () => {
  describe('Q11: pet attack-speed scales linearly with level (floor 0.1)', () => {
    // Pets are spawned from a Calculus result C·x^n; coefficient=1, exponent=2 → 'fast' trait.
    // baseAtkSpd for 'fast' trait = 0.3. atkSpdMult = 1 (no talent). levelAtkMult is what we test.
    // Final attackSpeed = max(0.1, 0.3 * 1 * levelAtkMult).
    const baseAtkSpd = 0.3

    it('level 1: levelAtkMult = 1.0 (no scaling)', () => {
      const [pet] = spawnPets('owner', 0, 0, 1, 2, {}, 1, 1)
      expect(pet.attackSpeed).toBeCloseTo(baseAtkSpd * 1.0, 5)
    })

    it('level 2: levelAtkMult = 0.9', () => {
      const [pet] = spawnPets('owner', 0, 0, 1, 2, {}, 1, 2)
      expect(pet.attackSpeed).toBeCloseTo(baseAtkSpd * 0.9, 5)
    })

    it('level 5: levelAtkMult = 0.6', () => {
      const [pet] = spawnPets('owner', 0, 0, 1, 2, {}, 1, 5)
      expect(pet.attackSpeed).toBeCloseTo(baseAtkSpd * 0.6, 5)
    })

    it('level 10: levelAtkMult floors at 0.1', () => {
      const [pet] = spawnPets('owner', 0, 0, 1, 2, {}, 1, 10)
      // baseAtkSpd 0.3 * levelAtkMult 0.1 = 0.03, then outer Math.max(0.1, …) lifts to 0.1
      expect(pet.attackSpeed).toBeCloseTo(0.1, 5)
    })

    it('level 99: still floored at 0.1 (no negative cooldown)', () => {
      const [pet] = spawnPets('owner', 0, 0, 1, 2, {}, 1, 99)
      expect(pet.attackSpeed).toBeCloseTo(0.1, 5)
      expect(pet.attackSpeed).toBeGreaterThan(0)
    })
  })
})
