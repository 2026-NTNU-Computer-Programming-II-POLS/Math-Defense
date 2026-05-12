import { Events, TowerType } from '@/data/constants'
import { hashStr, mulberry32 } from '@/math/RandomUtils'
import { spawnPets } from '@/entities/PetFactory'
import { formatCoefficient } from '@/utils/formatters'
import type { Game } from '@/engine/Game'
import type { Tower } from '@/entities/types'

export const CALCULUS_OP_COST = 50

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
      game.eventBus.on(Events.TOWER_UPGRADED, ({ towerId }) => {
        const tower = game.towers.find((t) => t.id === towerId)
        if (tower && tower.type === TowerType.CALCULUS) this._respawnPets(tower, game)
      }),
      game.eventBus.on(Events.ACTIVE_BUFFS_CHANGED, () => {
        for (const t of game.towers) {
          if (t.type === TowerType.CALCULUS) this._respawnPets(t, game)
        }
      }),
      game.eventBus.on(Events.CALCULUS_OPERATION, (payload: {
        towerId: string
        presetIndex?: number
        operation?: 'derivative' | 'derivative2' | 'integral'
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
            opApplied: false,
          }
          game.eventBus.emit(Events.CALCULUS_STATE_CHANGED, {
            towerId: tower.id,
            state: { ...tower.calculusState },
          })
          return
        }

        if (payload.operation && tower.calculusState) {
          if (tower.calculusState.opApplied) {
            if (game.state.gold < CALCULUS_OP_COST) return
            game.economy.changeGold(-CALCULUS_OP_COST)
            game.economy.addCost(CALCULUS_OP_COST)
          }
          tower.calculusState.opApplied = true
          this._applyOperation(tower, payload.operation, game)
          const stillExists = game.towers.includes(tower)
          game.eventBus.emit(Events.CALCULUS_STATE_CHANGED, {
            towerId: tower.id,
            state: stillExists && tower.calculusState ? { ...tower.calculusState } : null,
          })
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
    const MIN_PRESETS = 3
    const PRESET_COUNT_RANGE = 3
    const MIN_COEFFICIENT = 1
    const COEFFICIENT_RANGE = 6
    const MIN_EXPONENT = 1
    const EXPONENT_RANGE = 4
    const count = MIN_PRESETS + Math.floor(rng() * PRESET_COUNT_RANGE)
    const presets: MonomialPreset[] = []

    for (let i = 0; i < count; i++) {
      const coeff = Math.floor(rng() * COEFFICIENT_RANGE) + MIN_COEFFICIENT
      const exp = Math.floor(rng() * EXPONENT_RANGE) + MIN_EXPONENT
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

  private _applyOperation(tower: Tower, op: 'derivative' | 'derivative2' | 'integral', game: Game): void {
    const state = tower.calculusState!
    let newCoeff: number
    let newExp: number

    if (op === 'derivative') {
      newCoeff = state.coefficient * state.exponent
      newExp = state.exponent - 1
    } else if (op === 'derivative2') {
      newCoeff = state.coefficient * state.exponent * (state.exponent - 1)
      newExp = state.exponent - 2
    } else {
      const integratedCoeff = state.coefficient / (state.exponent + 1)
      newCoeff = Math.round(integratedCoeff * 1e12) / 1e12
      newExp = state.exponent + 1
    }

    if (newCoeff === 0 || (op === 'derivative' && state.exponent === 0)) {
      const idx = game.towers.findIndex((t) => t.id === tower.id)
      if (idx >= 0) {
        game.getSystem('buff')?.onTowerRemoved(game, tower.id)
        game.towers.splice(idx, 1)
        game.eventBus.emit(Events.TOWER_REMOVED, { towerId: tower.id })
      }
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
      ? `${formatCoefficient(newCoeff)}x`
      : `${formatCoefficient(newCoeff)}x^${newExp}`

    tower.configured = true
    tower.disabled = false

    this._respawnPets(tower, game)
  }

  private _respawnPets(tower: Tower, game: Game): void {
    const state = tower.calculusState
    if (!state || tower.disabled) return
    if (state.coefficient === 0 || state.exponent === 0) return

    this._removePets(tower.id, game)
    const combinedMods = {
      ...tower.talentMods,
      pet_damage: (tower.talentMods['pet_damage'] ?? 0) + (tower.upgradeExtras?.['petDamage'] ?? 0),
      pet_count:  (tower.talentMods['pet_count']  ?? 0) + (tower.upgradeExtras?.['petCount']  ?? 0),
      pet_speed:  (tower.talentMods['pet_speed']  ?? 0) + (tower.upgradeExtras?.['petSpeed']  ?? 0),
    }
    const towerDmgMult = tower.damageBonus * tower.magicBuff
    const pets = spawnPets(
      tower.id,
      tower.x,
      tower.y,
      state.coefficient,
      state.exponent,
      combinedMods,
      towerDmgMult,
      tower.level,
    )
    game.pets.push(...pets)
    for (const pet of pets) {
      game.eventBus.emit(Events.PET_SPAWNED, pet)
    }
  }

  private _removePets(ownerId: string, game: Game): void {
    for (const pet of game.pets) {
      if (pet.ownerId === ownerId) pet.active = false
    }
  }
}
