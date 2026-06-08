import { Events, GamePhase, TowerType } from '@/data/constants'
import { PURCHASABLE_BUFFS } from '@/data/buff-defs'
import { applyDamage } from '@/domain/combat/SplitPolicy'
import { recomputeEffectiveDamage } from '@/entities/tower-stats'
import type { Game, GameSystem } from '@/engine/Game'
import type { ActiveBuffEntry } from '@/engine/GameState'

type EffectFn = (game: Game) => void

function snap(v: number): number {
  return Math.round(v * 1e8) / 1e8
}

function recalcDamage(g: Game): void {
  g.towers.forEach((t) => recomputeEffectiveDamage(t, g.state))
}

function recalcRange(g: Game): void {
  const buffMult = 1 + g.state.towerRangeBonus
  g.towers.forEach((t) => { t.effectiveRange = t.baseRange * t.rangeBonus * buffMult })
}

// Q15: gold buffs stack additively. The bonus accumulator lives on GameState
// and the displayed multiplier is always 1 + bonus, so stacking ×2 + ×3 yields
// 4× (not 6×) and reverts never overshoot below 1×.
function recomputeGoldMult(g: Game): void {
  g.state.goldMultiplier = 1 + g.state.goldMultiplierBonus
}

// Enemy debuffs stack additively (same accumulator pattern as gold/tower). Each
// buff adds a delta to the bonus; the effective multipliers are derived here so
// an expiring buff's revert — which subtracts only its own delta — can never
// wipe a still-active concurrent debuff. The 0.1 speed floor stops stacked
// slows from freezing enemies outright; vulnerability is floored at 0.
function recomputeEnemyMods(g: Game): void {
  g.state.enemySpeedMultiplier = Math.max(0.1, snap(1 + g.state.enemySpeedBonus))
  g.state.enemyVulnerability = Math.max(0, snap(1 + g.state.enemyVulnBonus))
}

// Bug #1+#2 fix: tower buffs no longer mutate per-tower damageBonus/rangeBonus/
// cooldown. They mutate global state.tower*Bonus accumulators (mirroring the
// gold-multiplier pattern from Q15). Effective stats are read from the
// accumulator at consumption sites — so a new tower built during an active
// buff is buffed without ever being divided back on revert, and an upgrade
// that overwrites damageBonus/rangeBonus/cooldown still leaves the buff in
// place (it lives on state, not on the tower).
const effectStrategies: Record<string, EffectFn> = {
  // Tower damage modifiers
  ALL_TOWERS_DAMAGE_MULTIPLY_1_2: (g) => {
    g.state.towerDamageBonus = snap(g.state.towerDamageBonus + 0.2)
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_DIVIDE_1_2: (g) => {
    g.state.towerDamageBonus = snap(Math.max(0, g.state.towerDamageBonus - 0.2))
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_MULTIPLY_2: (g) => {
    g.state.towerDamageBonus = snap(g.state.towerDamageBonus + 1)
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_DIVIDE_2: (g) => {
    g.state.towerDamageBonus = snap(Math.max(0, g.state.towerDamageBonus - 1))
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_MULTIPLY_1_5: (g) => {
    g.state.towerDamageBonus = snap(g.state.towerDamageBonus + 0.5)
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_DIVIDE_1_5: (g) => {
    g.state.towerDamageBonus = snap(Math.max(0, g.state.towerDamageBonus - 0.5))
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_MULTIPLY_0_8: (g) => {
    // -20% debuff: bonus goes negative but stays > -1 (clamped at -0.99).
    g.state.towerDamageBonus = snap(Math.max(-0.99, g.state.towerDamageBonus - 0.2))
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_DIVIDE_0_8: (g) => {
    g.state.towerDamageBonus = snap(g.state.towerDamageBonus + 0.2)
    recalcDamage(g)
  },

  // Tower speed modifiers (cooldown read via effectiveCooldown helper).
  ALL_TOWERS_SPEED_MULTIPLY_1_15: (g) => {
    g.state.towerSpeedBonus = snap(g.state.towerSpeedBonus + 0.15)
  },
  ALL_TOWERS_SPEED_DIVIDE_1_15: (g) => {
    g.state.towerSpeedBonus = snap(Math.max(0, g.state.towerSpeedBonus - 0.15))
  },

  // Tower range modifiers
  ALL_TOWERS_RANGE_MULTIPLY_1_15: (g) => {
    g.state.towerRangeBonus = snap(g.state.towerRangeBonus + 0.15)
    recalcRange(g)
  },
  ALL_TOWERS_RANGE_DIVIDE_1_15: (g) => {
    g.state.towerRangeBonus = snap(Math.max(0, g.state.towerRangeBonus - 0.15))
    recalcRange(g)
  },
  ALL_TOWERS_RANGE_MULTIPLY_1_5: (g) => {
    g.state.towerRangeBonus = snap(g.state.towerRangeBonus + 0.5)
    recalcRange(g)
  },
  ALL_TOWERS_RANGE_DIVIDE_1_5: (g) => {
    g.state.towerRangeBonus = snap(Math.max(0, g.state.towerRangeBonus - 0.5))
    recalcRange(g)
  },

  // Enemy modifiers — additive deltas + per-effect reverts. (Bug fix: these used
  // to be absolute SET with a shared *_RESET revert, so an expiring debuff reset
  // the global multiplier to 1.0 and silently cancelled any other still-active
  // enemy debuff. Now each apply adds a delta and each revert subtracts only its
  // own, mirroring the gold/tower accumulators.) 0.85→-0.15, 0.6→-0.4, 1.5→+0.5.
  ENEMY_SPEED_MULTIPLIER_0_85: (g) => { g.state.enemySpeedBonus = snap(g.state.enemySpeedBonus - 0.15); recomputeEnemyMods(g) },
  ENEMY_SPEED_RESTORE_0_85:    (g) => { g.state.enemySpeedBonus = snap(g.state.enemySpeedBonus + 0.15); recomputeEnemyMods(g) },
  ENEMY_SPEED_MULTIPLIER_0_6:  (g) => { g.state.enemySpeedBonus = snap(g.state.enemySpeedBonus - 0.4); recomputeEnemyMods(g) },
  ENEMY_SPEED_RESTORE_0_6:     (g) => { g.state.enemySpeedBonus = snap(g.state.enemySpeedBonus + 0.4); recomputeEnemyMods(g) },
  ENEMY_SPEED_MULTIPLIER_1_5:  (g) => { g.state.enemySpeedBonus = snap(g.state.enemySpeedBonus + 0.5); recomputeEnemyMods(g) },
  ENEMY_SPEED_RESTORE_1_5:     (g) => { g.state.enemySpeedBonus = snap(g.state.enemySpeedBonus - 0.5); recomputeEnemyMods(g) },
  // Hard reset (defensive full clear): zero the accumulator.
  ENEMY_SPEED_MULTIPLIER_RESET: (g) => { g.state.enemySpeedBonus = 0; recomputeEnemyMods(g) },
  ENEMY_VULNERABILITY_1_1:     (g) => { g.state.enemyVulnBonus = snap(g.state.enemyVulnBonus + 0.1); recomputeEnemyMods(g) },
  ENEMY_VULN_RESTORE_1_1:      (g) => { g.state.enemyVulnBonus = snap(g.state.enemyVulnBonus - 0.1); recomputeEnemyMods(g) },
  ENEMY_VULNERABILITY_RESET:   (g) => { g.state.enemyVulnBonus = 0; recomputeEnemyMods(g) },

  // Player / economy
  HEAL_3: (g) => { g.economy.changeHp(3) },
  HEAL_5: (g) => { g.economy.changeHp(5) },
  HEAL_10: (g) => { g.economy.changeHp(10) },
  HEAL_FULL: (g) => { g.economy.changeHp(g.state.maxHp - g.state.hp) },
  // Q4+Q5: shield no longer grants full immunity. It absorbs the next 3 hits
  // but each one only deals half its original damage (rounded up). The
  // reductionFactor is the lever — set on activate, reset on deactivate so
  // an expired shield never leaks the 0.5 multiplier into the next session.
  SHIELD_ACTIVATE: (g) => {
    g.state.shieldActive = true
    g.state.shieldHitsRemaining = 3
    g.state.shieldReductionFactor = 0.5
  },
  SHIELD_DEACTIVATE: (g) => {
    g.state.shieldActive = false
    g.state.shieldHitsRemaining = 0
    g.state.shieldReductionFactor = 1
  },
  GOLD_MULTIPLIER_DOUBLE:        (g) => { g.state.goldMultiplierBonus += 1; recomputeGoldMult(g) },
  GOLD_MULTIPLIER_DOUBLE_REVERT: (g) => { g.state.goldMultiplierBonus = Math.max(0, g.state.goldMultiplierBonus - 1); recomputeGoldMult(g) },
  GOLD_MULTIPLIER_TRIPLE:        (g) => { g.state.goldMultiplierBonus += 2; recomputeGoldMult(g) },
  GOLD_MULTIPLIER_TRIPLE_REVERT: (g) => { g.state.goldMultiplierBonus = Math.max(0, g.state.goldMultiplierBonus - 2); recomputeGoldMult(g) },
  GOLD_MULTIPLIER_RESET:         (g) => { g.state.goldMultiplierBonus = 0; recomputeGoldMult(g) },
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
      g.economy.changeGold(last.cost)
      g.economy.addCost(-last.cost)
    }
  },
  ORIGIN_EXPLOSION: (g) => {
    const enemies = [...g.enemies]
    for (const enemy of enemies) {
      if (!enemy.alive) continue
      applyDamage(enemy, 50, g, 'effect')
    }
  },
  DISABLE_RANDOM_TOWER: (g) => {
    const active = g.towers.filter((t) => !t.disabled)
    if (active.length > 0) {
      // game.rng (seeded) keeps this deterministic for replay (Backlog §24).
      active[Math.floor(g.rng() * active.length)].disabled = true
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

// HEAL effects only have value while hp < maxHp. _purchaseBuff guards on these
// effectIds so a full-HP player can't waste gold on a no-op. The set is the
// single source of truth — both purchase guard and ShopPanel disable use it.
const HEAL_EFFECT_IDS = new Set(['HEAL_3', 'HEAL_5', 'HEAL_10', 'HEAL_FULL'])

export class BuffSystem implements GameSystem {
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      // Bug #4 fix: the event no longer carries `cost` — _purchaseBuff reads
      // it from the catalog so a stray emitter can't spoof a cheaper price.
      game.eventBus.on(Events.SHOP_PURCHASE, ({ itemId }) => {
        this._purchaseBuff(itemId, game)
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
    return this._purchaseBuff(buffId, game)
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

  /**
   * Retire an active buff identified by its effectId before its timer expires.
   * This is the seam for a buff that has a second, non-timer expiry condition.
   * BUG-001: a Ward Shield expires on either 3 absorbed hits OR 30s. EconomySystem
   * owns the hit counter but BuffSystem owns `activeBuffs`, so when the hits drain
   * first EconomySystem calls this to retire the entry. It applies the buff's
   * revert (idempotent for SHIELD_DEACTIVATE) and emits the same events as a timer
   * expiry, so the shop and active-buff HUD see the buff as gone instead of
   * showing a frozen countdown that gates re-purchase. No-op when no matching
   * entry exists, so a later 30s timer tick for an already-retired shield is
   * harmless.
   */
  retireActiveBuffByEffectId(effectId: string, game: Game): void {
    const buffs = game.state.activeBuffs
    const i = buffs.findIndex((b) => b.effectId === effectId)
    if (i === -1) return
    const retired = buffs[i]
    if (retired.revertId) applyEffect(retired.revertId, game)
    buffs.splice(i, 1)
    game.eventBus.emit(Events.BUFF_EXPIRED, {
      id: retired.id,
      name: retired.name,
      effectId: retired.effectId,
    })
    game.eventBus.emit(Events.ACTIVE_BUFFS_CHANGED, [...buffs])
  }

  private _purchaseBuff(itemId: string, game: Game): boolean {
    const def = PURCHASABLE_BUFFS.find((b) => b.id === itemId)
    if (!def) return false
    if (game.state.gold < def.cost) return false
    // Bug #3 fix: refuse heal purchases at full HP. changeHp() clamps to
    // maxHp anyway, so without this guard the gold is spent for no effect.
    if (HEAL_EFFECT_IDS.has(def.effectId) && game.state.hp >= game.state.maxHp) return false

    game.economy.changeGold(-def.cost)
    game.economy.addCost(def.cost)
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
    // Bug #5 fix: only tick buff timers during WAVE phase. The shop is only
    // open during BUILD, and BUILD/MONTY_HALL/CHAIN_RULE are excluded from
    // scoring via timeExcludePrepare — keeping the buff clock in lockstep
    // with that "active time" definition prevents the case where a 60s buff
    // bought at the start of BUILD expires before the wave even starts.
    if (game.state.phase !== GamePhase.WAVE) return

    const buffs = game.state.activeBuffs
    let changed = false
    for (let i = buffs.length - 1; i >= 0; i--) {
      buffs[i].remainingTime -= dt
      if (buffs[i].remainingTime <= 0) {
        const expired = buffs[i]
        if (expired.revertId) applyEffect(expired.revertId, game)
        buffs.splice(i, 1)
        changed = true
        // Feedback-only signal: drives the HUD expiry flash + expire SFX.
        // Not recorded for replay (simulation-derived, not a player decision).
        game.eventBus.emit(Events.BUFF_EXPIRED, {
          id: expired.id,
          name: expired.name,
          effectId: expired.effectId,
        })
      }
    }
    if (changed) {
      game.eventBus.emit(Events.ACTIVE_BUFFS_CHANGED, [...buffs])
    }
  }

  onTowerRemoved(_game: Game, _towerId: string): void {}

}

export { HEAL_EFFECT_IDS }
