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

  // Q12: previously `count = (isInteger ? coefficient : 1) + bonusCount`, so a
  // 99x Calculus result spawned 99 pets. Log compression caps that at 6 while
  // preserving the small-coefficient progression.
  describe('Q12: pet count = floor(log2(max(1, coefficient) + 1)) + bonus', () => {
    const cases: Array<[number, number]> = [
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 2],
      [7, 3],
      [8, 3],
      [15, 4],
      [31, 5],
      [99, 6],
    ]
    for (const [coefficient, expected] of cases) {
      it(`coefficient ${coefficient} → ${expected} pets`, () => {
        const pets = spawnPets('owner', 0, 0, coefficient, 1, {}, 1, 1)
        expect(pets).toHaveLength(expected)
      })
    }

    it('fractional coefficient (0.5) still spawns 1 pet (max(1, …) floor)', () => {
      const pets = spawnPets('owner', 0, 0, 0.5, 1, {}, 1, 1)
      expect(pets).toHaveLength(1)
    })

    it('bonusCount from pet_count talent stacks on top', () => {
      const pets = spawnPets('owner', 0, 0, 7, 1, { pet_count: 2 }, 1, 1)
      // base 3 + bonus 2 = 5
      expect(pets).toHaveLength(5)
    })
  })

  // Q10: Extended Reach (pet_range) widens the engagement radius by 20% per
  // level. PetCombatSystem reads pet.range directly, so the value here is the
  // authoritative source.
  describe('Q10: pet_range talent widens attack radius', () => {
    it('no talent → base range 1.0', () => {
      const [pet] = spawnPets('owner', 0, 0, 1, 1, {}, 1, 1)
      expect(pet.range).toBeCloseTo(1.0, 5)
    })

    it('pet_range = 0.20 (level 1) → range 1.20', () => {
      const [pet] = spawnPets('owner', 0, 0, 1, 1, { pet_range: 0.20 }, 1, 1)
      expect(pet.range).toBeCloseTo(1.2, 5)
    })

    it('pet_range = 0.60 (level 3 maxed) → range 1.60', () => {
      const [pet] = spawnPets('owner', 0, 0, 1, 1, { pet_range: 0.60 }, 1, 1)
      expect(pet.range).toBeCloseTo(1.6, 5)
    })
  })
})
