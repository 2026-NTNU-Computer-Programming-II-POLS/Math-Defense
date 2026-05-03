import { Events } from '@/data/constants'
import { TOWER_DEFS } from '@/data/tower-defs'
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

    game.changeGold(-cost)
    game.addCost(cost)
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
    tower.effectiveDamage = tower.baseDamage * tower.damageBonus
    tower.effectiveRange = tower.baseRange * tower.rangeBonus
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
    const refund = Math.round(base * game.state.goldMultiplier)
    game.changeGold(refund)
    game.addCost(-refund)
    game.getSystem('buff')?.onTowerRemoved(game, towerId)
    game.eventBus.emit(Events.TOWER_REFUND_RESULT, { success: true, towerId })
  }

  update(): void {}
  render(): void {}
}
