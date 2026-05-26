/**
 * Phase 4 Q10: PetCombatSystem reads `pet.range` directly for the engagement
 * check (`if (dist <= pet.range) deal damage`). PetFactory now widens that
 * value via the `pet_range` talent, so the gate that "a pet sitting at home
 * within range hits its target" is the integration point worth pinning down.
 */
import { describe, it, expect } from 'vitest'
import { PetCombatSystem } from '../PetCombatSystem'
import { spawnPets } from '@/entities/PetFactory'
import { GamePhase } from '@/data/constants'
import { createMockGame, createMockEnemy } from './helpers'

describe('PetCombatSystem — pet.range gates damage', () => {
  function setup(petRangeMod = 0) {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const system = new PetCombatSystem()
    // Spawn one pet at the origin via PetFactory so the range field is
    // computed by production code (not hand-set in the test).
    const pets = spawnPets('owner', 0, 0, 1, 1, { pet_range: petRangeMod }, 1, 1)
    game.pets.push(...pets)
    return { game, system, pet: pets[0] }
  }

  it('no talent: pet (range 1.0) does NOT damage an enemy at distance 1.4', () => {
    const { game, system, pet } = setup(0)
    const enemy = createMockEnemy({
      // Pet home is (0,0); place enemy just past base range 1.0 but well
      // inside the LEASH_RADIUS (5) so it will be targeted.
      x: pet.homeX + 1.4, y: pet.homeY,
      hp: 100, maxHp: 100, damage: 0,
    })
    game.enemies.push(enemy)

    // dt large enough that the pet definitely tries to attack if in range.
    system.update(0.5, game)

    expect(enemy.hp).toBe(100)
  })

  it('pet_range 0.60 (lvl 3 max): pet (range 1.6) DOES damage an enemy at distance 1.4', () => {
    const { game, system, pet } = setup(0.60)
    const enemy = createMockEnemy({
      x: pet.homeX + 1.4, y: pet.homeY,
      hp: 100, maxHp: 100, damage: 0,
    })
    game.enemies.push(enemy)

    // The first tick acquires + closes the gap; the cooldown starts at 0 so
    // a damage tick fires the same frame for any in-range target.
    system.update(0.5, game)

    expect(pet.range).toBeCloseTo(1.6, 5)
    expect(enemy.hp).toBeLessThan(100)
  })
})

// Phase 7 (Q14) — `pet_crit` talent is baked into Pet.critChance at spawn so
// PetCombatSystem can roll game.rng() at attack time. critChance=1 guarantees
// the crit so we sidestep the RNG and verify the 2× multiplier directly.
describe('PetCombatSystem — pet_crit talent', () => {
  function spawnAt(petCritMod: number) {
    const game = createMockGame({ phase: GamePhase.WAVE })
    const system = new PetCombatSystem()
    const pets = spawnPets('owner', 0, 0, 1, 1, { pet_crit: petCritMod }, 1, 1)
    game.pets.push(...pets)
    return { game, system, pet: pets[0] }
  }

  it('PetFactory bakes critChance from mods.pet_crit (clamped to [0,1])', () => {
    const { pet } = spawnAt(0.20)
    expect(pet.critChance).toBeCloseTo(0.20, 5)

    const { pet: clamped } = spawnAt(5.0)  // absurd → must clamp
    expect(clamped.critChance).toBe(1)
  })

  it('critChance=1 doubles pet damage on every attack', () => {
    const { game, system, pet } = spawnAt(1.0)
    const enemy = createMockEnemy({
      x: pet.homeX + 0.5, y: pet.homeY,
      hp: 500, maxHp: 500, damage: 0,
    })
    game.enemies.push(enemy)

    system.update(0.5, game)

    // damage dealt is exactly 2 × pet.damage (one crit hit this frame).
    expect(500 - enemy.hp).toBeCloseTo(pet.damage * 2, 5)
  })

  it('critChance=0 deals base damage (no double, no RNG read)', () => {
    const { game, system, pet } = spawnAt(0)
    const enemy = createMockEnemy({
      x: pet.homeX + 0.5, y: pet.homeY,
      hp: 500, maxHp: 500, damage: 0,
    })
    game.enemies.push(enemy)

    system.update(0.5, game)

    expect(500 - enemy.hp).toBeCloseTo(pet.damage, 5)
  })
})
