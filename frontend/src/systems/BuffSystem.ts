import { Events, TowerType } from '@/data/constants'
import { PURCHASABLE_BUFFS } from '@/data/buff-defs'
import { applyDamage } from '@/domain/combat/SplitPolicy'
import type { Game, GameSystem } from '@/engine/Game'
import type { ActiveBuffEntry } from '@/engine/GameState'

type EffectFn = (game: Game) => void

function snap(v: number): number {
  return Math.round(v * 1e8) / 1e8
}

function recalcDamage(g: Game): void {
  g.towers.forEach((t) => { t.effectiveDamage = t.baseDamage * t.damageBonus })
}

function recalcRange(g: Game): void {
  g.towers.forEach((t) => { t.effectiveRange = t.baseRange * t.rangeBonus })
}

const effectStrategies: Record<string, EffectFn> = {
  // Tower damage modifiers
  ALL_TOWERS_DAMAGE_MULTIPLY_1_2: (g) => {
    g.towers.forEach((t) => { t.damageBonus = snap(t.damageBonus * 1.2) })
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_DIVIDE_1_2: (g) => {
    g.towers.forEach((t) => { t.damageBonus = snap(t.damageBonus / 1.2) })
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_MULTIPLY_2: (g) => {
    g.towers.forEach((t) => { t.damageBonus = snap(t.damageBonus * 2) })
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_DIVIDE_2: (g) => {
    g.towers.forEach((t) => { t.damageBonus = snap(t.damageBonus / 2) })
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_MULTIPLY_1_5: (g) => {
    g.towers.forEach((t) => { t.damageBonus = snap(t.damageBonus * 1.5) })
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_DIVIDE_1_5: (g) => {
    g.towers.forEach((t) => { t.damageBonus = snap(t.damageBonus / 1.5) })
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_MULTIPLY_0_8: (g) => {
    g.towers.forEach((t) => { t.damageBonus = snap(t.damageBonus * 0.8) })
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_DIVIDE_0_8: (g) => {
    g.towers.forEach((t) => { t.damageBonus = snap(t.damageBonus / 0.8) })
    recalcDamage(g)
  },

  // Tower speed modifiers
  ALL_TOWERS_SPEED_MULTIPLY_1_15: (g) => {
    g.towers.forEach((t) => { t.cooldown = snap(t.cooldown / 1.15) })
  },
  ALL_TOWERS_SPEED_DIVIDE_1_15: (g) => {
    g.towers.forEach((t) => { t.cooldown = snap(t.cooldown * 1.15) })
  },

  // Tower range modifiers
  ALL_TOWERS_RANGE_MULTIPLY_1_15: (g) => {
    g.towers.forEach((t) => { t.rangeBonus = snap(t.rangeBonus * 1.15) })
    recalcRange(g)
  },
  ALL_TOWERS_RANGE_DIVIDE_1_15: (g) => {
    g.towers.forEach((t) => { t.rangeBonus = snap(t.rangeBonus / 1.15) })
    recalcRange(g)
  },
  ALL_TOWERS_RANGE_MULTIPLY_1_5: (g) => {
    g.towers.forEach((t) => { t.rangeBonus = snap(t.rangeBonus * 1.5) })
    recalcRange(g)
  },
  ALL_TOWERS_RANGE_DIVIDE_1_5: (g) => {
    g.towers.forEach((t) => { t.rangeBonus = snap(t.rangeBonus / 1.5) })
    recalcRange(g)
  },

  // Enemy modifiers
  ENEMY_SPEED_MULTIPLIER_0_85: (g) => { g.state.enemySpeedMultiplier = 0.85 },
  ENEMY_SPEED_MULTIPLIER_0_6: (g) => { g.state.enemySpeedMultiplier = 0.6 },
  ENEMY_SPEED_MULTIPLIER_1_5: (g) => { g.state.enemySpeedMultiplier = 1.5 },
  ENEMY_SPEED_MULTIPLIER_RESET: (g) => { g.state.enemySpeedMultiplier = 1.0 },
  ENEMY_VULNERABILITY_1_1: (g) => { g.state.enemyVulnerability = 1.1 },
  ENEMY_VULNERABILITY_RESET: (g) => { g.state.enemyVulnerability = 1.0 },

  // Player / economy
  HEAL_3: (g) => { g.changeHp(3) },
  HEAL_5: (g) => { g.changeHp(5) },
  HEAL_10: (g) => { g.changeHp(10) },
  HEAL_FULL: (g) => { g.changeHp(g.state.maxHp - g.state.hp) },
  SHIELD_ACTIVATE: (g) => { g.state.shieldActive = true; g.state.shieldHitsRemaining = 3 },
  SHIELD_DEACTIVATE: (g) => { g.state.shieldActive = false; g.state.shieldHitsRemaining = 0 },
  GOLD_MULTIPLIER_DOUBLE: (g) => { g.state.goldMultiplier *= 2 },
  GOLD_MULTIPLIER_DOUBLE_REVERT: (g) => { g.state.goldMultiplier = Math.max(1, g.state.goldMultiplier / 2) },
  GOLD_MULTIPLIER_TRIPLE: (g) => { g.state.goldMultiplier *= 3 },
  GOLD_MULTIPLIER_TRIPLE_REVERT: (g) => { g.state.goldMultiplier = Math.max(1, g.state.goldMultiplier / 3) },
  GOLD_MULTIPLIER_RESET: (g) => { g.state.goldMultiplier = 1 },
  FREE_TOWER_NEXT: (g) => { g.state.freeTowerNext = true },
  FREE_TOWER_CLEAR: (g) => { g.state.freeTowerNext = false },
  FREE_TOWER_CHARGES_2: (g) => { g.state.freeTowerCharges += 2 },

  // Legacy effects kept for compatibility
  UPGRADE_MAGIC_TOWER: (g) => {
    g.towers
      .filter((t) => t.type === TowerType.MAGIC)
      .forEach((t) => { (t as { level?: number }).level = 2 })
  },
  REFUND_LAST_TOWER: (g) => {
    if (g.towers.length > 0) {
      const last = g.towers[g.towers.length - 1]
      g.changeGold(last.cost)
    }
  },
  ORIGIN_EXPLOSION: (g) => {
    const enemies = [...g.enemies]
    for (const enemy of enemies) {
      if (!enemy.alive) continue
      applyDamage(enemy, 50, g)
    }
  },
  DISABLE_RANDOM_TOWER: (g) => {
    const active = g.towers.filter((t) => !t.disabled)
    if (active.length > 0) {
      active[Math.floor(Math.random() * active.length)].disabled = true
    }
  },
  ENABLE_DISABLED_TOWER: (g) => {
    g.towers.forEach((t) => { t.disabled = false })
  },
}

function applyEffect(effectId: string, game: Game): void {
  const fn = effectStrategies[effectId]
  if (fn) { fn(game); return }
  const msg = `[BuffSystem] Unknown effectId: ${effectId}`
  if (import.meta.env.DEV) throw new Error(msg)
  console.warn(msg)
}

export class BuffSystem implements GameSystem {
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.SHOP_PURCHASE, ({ itemId, cost }) => {
        this._purchaseBuff(itemId, cost, game)
      }),

      game.eventBus.on(Events.LEVEL_START, () => {
        const surviving: typeof game.state.activeBuffs = []
        for (const buff of game.state.activeBuffs) {
          if (buff.survivesLevelStart) { surviving.push(buff); continue }
          if (buff.revertId) applyEffect(buff.revertId, game)
        }
        game.state.activeBuffs = surviving
        game.eventBus.emit(Events.ACTIVE_BUFFS_CHANGED, [...surviving])
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
  }

  purchaseBuffDirect(buffId: string, game: Game): boolean {
    const def = PURCHASABLE_BUFFS.find((b) => b.id === buffId)
    if (!def) return false
    return this._purchaseBuff(buffId, def.cost, game)
  }

  applyExternalBuff(effectId: string, revertId: string | undefined, duration: number, name: string, game: Game, survivesLevelStart = false): void {
    applyEffect(effectId, game)
    if (duration > 0) {
      game.state.activeBuffs.push({
        id: `ext_${Date.now()}`,
        name,
        effectId,
        revertId,
        remainingTime: duration,
        totalDuration: duration,
        survivesLevelStart,
      })
      game.eventBus.emit(Events.ACTIVE_BUFFS_CHANGED, [...game.state.activeBuffs])
    }
  }

  private _purchaseBuff(itemId: string, cost: number, game: Game): boolean {
    const def = PURCHASABLE_BUFFS.find((b) => b.id === itemId)
    if (!def) return false
    if (game.state.gold < cost) return false

    game.changeGold(-cost)
    game.addCost(cost)
    applyEffect(def.effectId, game)

    if (def.duration > 0) {
      const entry: ActiveBuffEntry = {
        id: def.id + '_' + Date.now(),
        name: def.name,
        effectId: def.effectId,
        revertId: def.revertId,
        remainingTime: def.duration,
        totalDuration: def.duration,
      }
      game.state.activeBuffs.push(entry)
      game.eventBus.emit(Events.ACTIVE_BUFFS_CHANGED, [...game.state.activeBuffs])
    }
    return true
  }

  update(dt: number, game: Game): void {
    const buffs = game.state.activeBuffs
    let changed = false
    for (let i = buffs.length - 1; i >= 0; i--) {
      buffs[i].remainingTime -= dt
      if (buffs[i].remainingTime <= 0) {
        const expired = buffs[i]
        if (expired.revertId) applyEffect(expired.revertId, game)
        buffs.splice(i, 1)
        changed = true
      }
    }
    if (changed) {
      game.eventBus.emit(Events.ACTIVE_BUFFS_CHANGED, [...buffs])
    }
  }

  onTowerRemoved(_game: Game, _towerId: string): void {}

  render(_renderer: unknown, _game: Game): void {}
}
