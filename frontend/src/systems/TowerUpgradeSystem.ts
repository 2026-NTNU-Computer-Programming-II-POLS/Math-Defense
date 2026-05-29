import { Events } from '@/data/constants'
import { TOWER_DEFS } from '@/data/tower-defs'
import { recomputeEffectiveDamage } from '@/entities/tower-stats'
import type { Game } from '@/engine/Game'
import type { Tower } from '@/entities/types'

export class TowerUpgradeSystem {
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.TOWER_UPGRADE, ({ towerId }: { towerId: string }) => {
        const tower = game.towers.find((t) => t.id === towerId)
        if (!tower) return
        this._upgrade(tower, game)
      }),
      game.eventBus.on(Events.TOWER_REFUND, ({ towerId }: { towerId: string }) => {
        this._refund(towerId, game)
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
  }

  canUpgrade(tower: Tower, gold: number): { ok: boolean; cost: number } {
    const def = TOWER_DEFS[tower.type]
    if (!def) return { ok: false, cost: 0 }
    const tierIndex = tower.level - 1
    if (tierIndex >= def.upgrades.length) return { ok: false, cost: 0 }
    const tier = def.upgrades[tierIndex]
    const cost = Math.max(1, Math.round(def.cost * tier.costPercent))
    return { ok: gold >= cost, cost }
  }

  private _upgrade(tower: Tower, game: Game): void {
    const { ok, cost } = this.canUpgrade(tower, game.state.gold)
    if (!ok) return

    const def = TOWER_DEFS[tower.type]
    if (!def) return
    const oldLevel = tower.level
    const tier = def.upgrades[oldLevel - 1]
    if (!tier) return

    game.economy.changeGold(-cost)
    game.economy.addCost(cost)
    tower.upgradeSpend ??= 0
    tower.upgradeSpend += cost
    tower.level = oldLevel + 1

    const mods = game.towerModifierProvider?.(tower.type) ?? {}
    const talentDmg = 1 + (mods['damage'] ?? 0)
    const talentRange = 1 + (mods['range'] ?? 0)
    const talentSpeed = mods['attack_speed'] ?? 0

    tower.baseDamage = tower.baseDamage * (1 + tier.damageBonus)
    tower.baseRange = tower.baseRange * (1 + tier.rangeBonus)
    tower.damageBonus = talentDmg
    tower.rangeBonus = talentRange
    // Bug #2 fix: recomputeEffectiveDamage now folds in state.towerDamageBonus
    // and effectiveRange picks up state.towerRangeBonus — an upgrade during an
    // active buff no longer wipes the buff (per-tower fields hold talent +
    // upgrade only; buff lives on game.state).
    recomputeEffectiveDamage(tower, game.state)
    tower.effectiveRange = tower.baseRange * tower.rangeBonus * (1 + game.state.towerRangeBonus)
    tower.talentMods = mods
    let cd = def.cooldown
    for (let i = 0; i < oldLevel; i++) {
      cd *= (1 - (def.upgrades[i]?.speedBonus ?? 0))
    }
    tower.cooldown = cd * (1 - talentSpeed)
    if (tier.extra) {
      tower.upgradeExtras = { ...(tower.upgradeExtras ?? {}), ...tier.extra }
    }
    game.eventBus.emit(Events.TOWER_UPGRADED, { towerId: tower.id })
  }

  private _refund(towerId: string, game: Game): void {
    const idx = game.towers.findIndex((t) => t.id === towerId)
    if (idx < 0) {
      console.warn(`[TowerUpgradeSystem] refund ignored: tower ${towerId} not found`)
      game.eventBus.emit(Events.TOWER_REFUND_RESULT, { success: false })
      return
    }
    const tower = game.towers[idx]
    game.towers.splice(idx, 1)
    const base = Math.floor(tower.cost / 2) + Math.floor((tower.upgradeSpend ?? 0) / 2)
    // Gold side keeps the Q15 "selling during a gold-multiplier buff is worth
    // more" perk, but is capped at the tower's actual spend so a buy+sell loop
    // can never print net gold (the previous `round(base * goldMultiplier)`
    // returned up to 6×/4× the base, profiting under a ×3 buff).
    const spent = tower.cost + (tower.upgradeSpend ?? 0)
    const goldRefund = Math.min(Math.round(base * game.state.goldMultiplier), spent)
    game.economy.changeGold(goldRefund)
    // costTotal is the anti-cheat scoring denominator (S2 = killValue /
    // costTotal). It must track real spend, so sink only the un-multiplied
    // base — this also keeps costTotal from being driven negative (and the
    // S2 score inflated) by selling under a gold buff.
    game.economy.addCost(-base)
    game.getSystem('buff')?.onTowerRemoved(game, towerId)
    game.eventBus.emit(Events.TOWER_REFUND_RESULT, { success: true, towerId })
  }

}
