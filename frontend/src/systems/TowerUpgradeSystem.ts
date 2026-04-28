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
    const cost = Math.round(def.cost * tier.costPercent)
    return { ok: gold >= cost, cost }
  }

  private _upgrade(tower: Tower, game: Game): void {
    const { ok, cost } = this.canUpgrade(tower, game.state.gold)
    if (!ok) return

    const def = TOWER_DEFS[tower.type]
    if (!def) return
    const tier = def.upgrades[tower.level - 1]
    if (!tier) return

    game.changeGold(-cost)
    tower.level++

    const mods = game.towerModifierProvider?.(tower.type) ?? {}
    const talentDmg = 1 + (mods['damage'] ?? 0)
    const talentRange = 1 + (mods['range'] ?? 0)
    const talentSpeed = mods['attack_speed'] ?? 0

    tower.baseDamage = def.damage * (1 + tier.damageBonus)
    tower.baseRange = def.range * (1 + tier.rangeBonus)
    tower.damageBonus = talentDmg
    tower.rangeBonus = talentRange
    tower.effectiveDamage = tower.baseDamage * tower.damageBonus
    tower.effectiveRange = tower.baseRange * tower.rangeBonus
    tower.talentMods = mods
    tower.cooldown = def.cooldown * (1 - tier.speedBonus) * (1 - talentSpeed)
  }

  private _refund(towerId: string, game: Game): void {
    const idx = game.towers.findIndex((t) => t.id === towerId)
    if (idx < 0) return
    const tower = game.towers[idx]
    game.towers.splice(idx, 1)
    game.changeGold(tower.cost)
    game.getSystem('buff')?.onTowerRemoved(game, towerId)
  }

  update(): void {}
  render(): void {}
}
