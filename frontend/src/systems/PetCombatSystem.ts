import { GamePhase } from '@/data/constants'
import { applyDamage } from '@/domain/combat/SplitPolicy'
import type { Game } from '@/engine/Game'
import type { Enemy, Pet } from '@/entities/types'

const SLOW_AURA_RADIUS = 40

export class PetCombatSystem {
  update(dt: number, game: Game): void {
    this._pruneInactivePets(game)

    if (game.state.phase !== GamePhase.WAVE) return

    for (const pet of game.pets) {
      let target = pet.targetId
        ? game.enemies.find((e) => e.id === pet.targetId && e.alive)
        : null

      if (!target) {
        let bestDist = Infinity
        for (const enemy of game.enemies) {
          if (!enemy.alive) continue
          const dx = enemy.x - pet.x
          const dy = enemy.y - pet.y
          const d = dx * dx + dy * dy
          if (d < bestDist) {
            target = enemy
            bestDist = d
          }
        }
        pet.targetId = target?.id ?? null
      }

      if (!target) continue

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
          this._dealDamage(target, pet.damage, game)
          if (!target.alive) pet.targetId = null
        }
      }
    }
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
    applyDamage(enemy, amount, game)
  }
}
