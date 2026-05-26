import { GamePhase } from '@/data/constants'
import { applyDamage } from '@/domain/combat/SplitPolicy'
import type { Game } from '@/engine/Game'
import type { Enemy, Pet } from '@/entities/types'

// Game units (UNIT_PX = 20 px/unit), matching the pet/enemy coordinate space.
const SLOW_AURA_RADIUS = 2
// Guard zone: a pet only engages enemies within this radius of its home anchor,
// and drifts back home when none are in range.
const LEASH_RADIUS = 5
// A pet closer than this to its home anchor is treated as "parked" — stops drifting.
const HOME_EPSILON = 0.1

export class PetCombatSystem {
  update(dt: number, game: Game): void {
    this._pruneInactivePets(game)

    if (game.state.phase !== GamePhase.WAVE) return

    for (const pet of game.pets) {
      const target = this._acquireTarget(pet, game.enemies)

      if (!target) {
        this._returnHome(pet, dt)
        continue
      }

      const dx = target.x - pet.x
      const dy = target.y - pet.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > pet.range) {
        const inv = (pet.speed * dt) / dist
        pet.x += dx * inv
        pet.y += dy * inv
      }

      if (pet.trait === 'slow') {
        this._applySlowAura(pet, game.enemies)
      }

      if (dist <= pet.range) {
        pet.cooldownTimer -= dt
        if (pet.cooldownTimer <= 0) {
          pet.cooldownTimer = pet.attackSpeed
          // Phase 7 (Q14): pet_crit talent — roll the seeded RNG so a
          // recorded run replays bit-identical. Crit mult fixed at 2×.
          const isCrit = pet.critChance > 0 && game.rng() < pet.critChance
          const dmg = isCrit ? pet.damage * 2 : pet.damage
          this._dealDamage(target, dmg, game)
        }
      }
    }
  }

  // Picks the enemy this pet should engage. The current target is kept only
  // while it is alive AND inside the leash zone; otherwise the nearest in-leash
  // enemy is re-acquired. Re-validating every frame stops a slow pet from
  // locking onto an enemy it can never catch.
  private _acquireTarget(pet: Pet, enemies: Enemy[]): Enemy | null {
    const leashSq = LEASH_RADIUS * LEASH_RADIUS

    if (pet.targetId) {
      const current = enemies.find((e) => e.id === pet.targetId && e.alive)
      if (current && this._homeDistSq(pet, current) <= leashSq) return current
    }

    let best: Enemy | null = null
    let bestDist = Infinity
    for (const enemy of enemies) {
      if (!enemy.alive) continue
      const d = this._homeDistSq(pet, enemy)
      if (d <= leashSq && d < bestDist) {
        best = enemy
        bestDist = d
      }
    }
    pet.targetId = best?.id ?? null
    return best
  }

  // No enemy in the leash zone: drift back to the orbit anchor so the pet stays
  // a tower-guarding satellite rather than wandering the map.
  private _returnHome(pet: Pet, dt: number): void {
    pet.targetId = null
    const dx = pet.homeX - pet.x
    const dy = pet.homeY - pet.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist <= HOME_EPSILON) return
    const step = pet.speed * dt
    if (step >= dist) {
      pet.x = pet.homeX
      pet.y = pet.homeY
      return
    }
    const inv = step / dist
    pet.x += dx * inv
    pet.y += dy * inv
  }

  private _homeDistSq(pet: Pet, enemy: Enemy): number {
    const dx = enemy.x - pet.homeX
    const dy = enemy.y - pet.homeY
    return dx * dx + dy * dy
  }

  // Deactivated pets are flagged with active=false by CalculusTowerSystem._removePets.
  // Flushing them here keeps game.pets from growing unboundedly between waves.
  private _pruneInactivePets(game: Game): void {
    game.pets = game.pets.filter((p) => p.active)
  }

  // enemy.slowFactor is reset to 0 by CombatSystem each frame when slowTimer <= 0,
  // so this must be called every frame to sustain the aura effect.
  private _applySlowAura(pet: Pet, enemies: Enemy[]): void {
    for (const enemy of enemies) {
      if (!enemy.alive) continue
      const dx = pet.x - enemy.x
      const dy = pet.y - enemy.y
      if (dx * dx + dy * dy <= SLOW_AURA_RADIUS * SLOW_AURA_RADIUS) {
        enemy.slowFactor = Math.max(enemy.slowFactor, 0.3 * pet.abilityMod)
      }
    }
  }

  private _dealDamage(enemy: Enemy, amount: number, game: Game): void {
    if (!enemy.alive) return
    applyDamage(enemy, amount, game, 'pet')
  }
}
