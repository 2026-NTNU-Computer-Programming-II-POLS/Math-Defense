import { Events, TowerType } from '@/data/constants'
import { hashStr, mulberry32 } from '@/math/RandomUtils'
import { applyCalcOp } from '@/math/monomial'
import { spawnPets } from '@/entities/PetFactory'
import { formatCoefficient } from '@/utils/formatters'
import type { Game } from '@/engine/Game'
import type { Tower } from '@/entities/types'
import type { CalcOp } from '@/math/monomial'

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
        operation?: CalcOp
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
          // The op cost is charged up-front (only on chain ops). A collapse is
          // a free retry, so capture whether we charged and refund on collapse.
          const wasApplied = tower.calculusState.opApplied
          if (wasApplied) {
            if (game.state.gold < CALCULUS_OP_COST) {
              // Emit so the UI knows the op was rejected and can signal the player.
              game.eventBus.emit(Events.CALCULUS_STATE_CHANGED, {
                towerId: tower.id,
                state: { ...tower.calculusState },
              })
              return
            }
            game.economy.changeGold(-CALCULUS_OP_COST)
            game.economy.addCost(CALCULUS_OP_COST)
          }
          const status = this._applyOperation(tower, payload.operation, game)
          if (status === 'collapsed') {
            if (wasApplied) {
              game.economy.changeGold(CALCULUS_OP_COST)
              game.economy.addCost(-CALCULUS_OP_COST)
            }
            // Leave opApplied unchanged — a collapse does not advance the chain.
          } else {
            tower.calculusState.opApplied = true
          }
          game.eventBus.emit(Events.CALCULUS_STATE_CHANGED, {
            towerId: tower.id,
            state: { ...tower.calculusState },
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
          expr: exp === 1 ? `${formatCoefficient(coeff)}x` : `${formatCoefficient(coeff)}x^${exp}`,
        })
      }
    }
    return presets
  }

  // Returns 'collapsed' when the operation degenerates the monomial (to 0 or to
  // a constant). A collapse never removes or disables the tower — it falls back
  // to the minimal f(x) = x so the student can immediately try another op.
  private _applyOperation(
    tower: Tower,
    op: CalcOp,
    game: Game,
  ): 'ok' | 'collapsed' {
    const state = tower.calculusState!
    const { coefficient: newCoeff, exponent: newExp, collapsed } = applyCalcOp(
      { coefficient: state.coefficient, exponent: state.exponent },
      op,
    )

    if (collapsed) {
      state.coefficient = 1
      state.exponent = 1
      state.currentExpr = 'x'
      tower.configured = true
      tower.disabled = false
      this._respawnPets(tower, game)
      return 'collapsed'
    }

    state.coefficient = newCoeff
    state.exponent = newExp
    state.currentExpr = newExp === 1
      ? `${formatCoefficient(newCoeff)}x`
      : `${formatCoefficient(newCoeff)}x^${newExp}`

    tower.configured = true
    tower.disabled = false

    this._respawnPets(tower, game)
    return 'ok'
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
