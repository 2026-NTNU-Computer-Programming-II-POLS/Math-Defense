import { Events, GamePhase, TowerType } from '@/data/constants'
import { hashStr, mulberry32 } from '@/math/RandomUtils'
import { spawnPets } from '@/entities/PetFactory'
import type { Game } from '@/engine/Game'
import type { Tower, Pet, CalculusState } from '@/entities/types'

export interface MonomialPreset {
  coefficient: number
  exponent: number
  expr: string
}

export class CalculusTowerSystem {
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.CALCULUS_OPERATION, (payload: {
        towerId: string
        presetIndex?: number
        operation?: 'derivative' | 'integral'
      }) => {
        const tower = game.towers.find((t) => t.id === payload.towerId)
        if (!tower || tower.type !== TowerType.CALCULUS) return

        if (payload.presetIndex !== undefined && !tower.calculusState) {
          const presets = this.generatePresets(tower)
          const preset = presets[payload.presetIndex]
          if (!preset) return
          tower.calculusState = {
            coefficient: preset.coefficient,
            exponent: preset.exponent,
            currentExpr: preset.expr,
          }
          return
        }

        if (payload.operation && tower.calculusState) {
          this._applyOperation(tower, payload.operation, game)
        }
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
  }

  generatePresets(tower: Tower): MonomialPreset[] {
    const seed = hashStr(tower.id)
    const rng = mulberry32(seed)
    const count = 3 + Math.floor(rng() * 3)
    const presets: MonomialPreset[] = []

    for (let i = 0; i < count; i++) {
      const coeff = Math.floor(rng() * 6) + 1
      const exp = Math.floor(rng() * 4) + 1
      const isTrap = i === count - 1

      if (isTrap) {
        presets.push({ coefficient: 1, exponent: 1, expr: `x` })
      } else {
        presets.push({
          coefficient: coeff,
          exponent: exp,
          expr: exp === 1 ? `${coeff}x` : `${coeff}x^${exp}`,
        })
      }
    }
    return presets
  }

  private _applyOperation(tower: Tower, op: 'derivative' | 'integral', game: Game): void {
    const state = tower.calculusState!
    let newCoeff: number
    let newExp: number

    if (op === 'derivative') {
      newCoeff = state.coefficient * state.exponent
      newExp = state.exponent - 1
    } else {
      newCoeff = state.coefficient / (state.exponent + 1)
      newExp = state.exponent + 1
    }

    if (newCoeff === 0 || (op === 'derivative' && state.exponent === 0)) {
      const idx = game.towers.findIndex((t) => t.id === tower.id)
      if (idx >= 0) game.towers.splice(idx, 1)
      this._removePets(tower.id, game)
      return
    }

    if (newExp === 0) {
      tower.disabled = true
      this._removePets(tower.id, game)
      state.coefficient = newCoeff
      state.exponent = newExp
      state.currentExpr = `${newCoeff}`
      return
    }

    state.coefficient = newCoeff
    state.exponent = newExp
    state.currentExpr = newExp === 1
      ? `${this._formatCoeff(newCoeff)}x`
      : `${this._formatCoeff(newCoeff)}x^${newExp}`

    tower.configured = true
    tower.disabled = false

    this._removePets(tower.id, game)
    const pets = spawnPets(tower.id, tower.x, tower.y, tower.effectiveRange, newCoeff, newExp, tower.talentMods)
    game.pets.push(...pets)
    for (const pet of pets) {
      game.eventBus.emit(Events.PET_SPAWNED, pet)
    }
  }

  private _formatCoeff(c: number): string {
    if (Number.isInteger(c)) return c === 1 ? '' : c === -1 ? '-' : `${c}`
    const frac = toFraction(c)
    return frac ? `(${frac})` : `${c.toFixed(2)}`
  }

  private _removePets(ownerId: string, game: Game): void {
    for (let i = game.pets.length - 1; i >= 0; i--) {
      if (game.pets[i].ownerId === ownerId) {
        game.pets[i].active = false
        game.pets.splice(i, 1)
      }
    }
  }

  update(_dt: number, _game: Game): void {}
  render(): void {}
}

export class PetCombatSystem {
  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    for (const pet of game.pets) {
      if (!pet.active) continue

      pet.cooldownTimer -= dt

      if (pet.trait === 'slow') {
        for (const enemy of game.enemies) {
          if (!enemy.alive) continue
          const dx = pet.x - enemy.x
          const dy = pet.y - enemy.y
          if (dx * dx + dy * dy < pet.range * pet.range) {
            enemy.slowFactor = Math.max(enemy.slowFactor, 0.3 * pet.abilityMod)
          }
        }
      }

      if (pet.cooldownTimer > 0) continue
      pet.cooldownTimer = pet.attackSpeed

      let target = pet.targetId
        ? game.enemies.find((e) => e.id === pet.targetId && e.alive)
        : null

      if (!target) {
        let bestDist = Infinity
        for (const enemy of game.enemies) {
          if (!enemy.alive) continue
          const dx = pet.x - enemy.x
          const dy = pet.y - enemy.y
          const d = dx * dx + dy * dy
          if (d < pet.range * pet.range && d < bestDist) {
            target = enemy
            bestDist = d
          }
        }
        pet.targetId = target?.id ?? null
      }

      if (!target) continue

      target.hp -= pet.damage
      if (target.hp <= 0) {
        target.hp = 0
        target.alive = false
        target.active = false
        game.eventBus.emit(Events.ENEMY_KILLED, target)
        pet.targetId = null
      }
    }
  }

  render(): void {}
}

function toFraction(n: number): string | null {
  for (let d = 2; d <= 10; d++) {
    const num = n * d
    if (Math.abs(num - Math.round(num)) < 1e-9) {
      return `${Math.round(num)}/${d}`
    }
  }
  return null
}
