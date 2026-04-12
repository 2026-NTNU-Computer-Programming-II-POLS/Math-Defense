/**
 * BuffSystem — Buff card / curse system (strategy-pattern rewrite)
 * buff-defs.ts stores effectId strings; this file owns the effectStrategies Map that executes them.
 * No more dynamically injected properties like game._shieldActive.
 */
import { Events, GamePhase, TowerType } from '@/data/constants'
import { BUFF_POOL, CURSE_POOL, type BuffDef } from '@/data/buff-defs'
import { shouldSplit, spawnChildren } from '@/domain/combat/SplitSlimePolicy'
import type { Game } from '@/engine/Game'

interface ActiveBuff extends BuffDef {
  remainingWaves: number
  isCurse: boolean
  _targetTowerId?: string   // used by RANDOM_TOWER_RANGE effects
}

// ── Effect strategy map ──

type EffectFn = (game: Game, buff: ActiveBuff) => void

/** Snap bonus to avoid floating-point drift from multiply/divide cycles */
function snap(v: number): number {
  return Math.round(v * 1e8) / 1e8
}

/** Recalculate effective damage from base + bonus to avoid float drift */
function recalcDamage(g: Game): void {
  g.towers.forEach((t) => { t.effectiveDamage = t.baseDamage * t.damageBonus })
}

const effectStrategies: Record<string, EffectFn> = {
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
  RANDOM_TOWER_RANGE_MULTIPLY_1_3: (g, buff) => {
    if (g.towers.length > 0) {
      const t = g.towers[Math.floor(Math.random() * g.towers.length)]
      t.rangeBonus = snap(t.rangeBonus * 1.3)
      t.effectiveRange = t.baseRange * t.rangeBonus
      buff._targetTowerId = t.id
    }
  },
  RANDOM_TOWER_RANGE_DIVIDE_1_3: (g, buff) => {
    if (buff._targetTowerId) {
      const t = g.towers.find((tower) => tower.id === buff._targetTowerId)
      if (t) {
        t.rangeBonus = snap(t.rangeBonus / 1.3)
        t.effectiveRange = t.baseRange * t.rangeBonus
      }
      buff._targetTowerId = undefined
    }
  },
  UPGRADE_FUNCTION_CANNON: (g) => {
    g.towers
      .filter((t) => t.type === TowerType.FUNCTION_CANNON)
      .forEach((t) => { (t as { level?: number }).level = 2 })
  },
  GOLD_MULTIPLIER_DOUBLE: (g) => { g.state.goldMultiplier *= 2 },
  GOLD_MULTIPLIER_RESET: (g) => { g.state.goldMultiplier = Math.max(1, g.state.goldMultiplier / 2) },
  FREE_TOWER_NEXT: (g) => { g.state.freeTowerNext = true },
  FREE_TOWER_CLEAR: (g) => { g.state.freeTowerNext = false },
  REFUND_LAST_TOWER: (g) => {
    if (g.towers.length > 0) {
      const last = g.towers[g.towers.length - 1]
      g.changeGold(last.cost)
    }
  },
  HEAL_3: (g) => { g.changeHp(3) },
  SHIELD_ACTIVATE: (g) => { g.state.shieldActive = true },
  SHIELD_DEACTIVATE: (g) => { g.state.shieldActive = false },
  ORIGIN_EXPLOSION: (g) => {
    // deal 50 damage to all living enemies
    const enemies = [...g.enemies] // snapshot to avoid mutating the array during iteration
    for (const enemy of enemies) {
      if (!enemy.alive) continue
      enemy.hp -= 50
      if (enemy.hp <= 0) {
        enemy.hp = 0
        enemy.alive = false
        enemy.active = false
        g.eventBus.emit(Events.ENEMY_KILLED, enemy)

        if (shouldSplit(enemy)) {
          spawnChildren(enemy, {
            pathFunction: g.pathFunction,
            onChildCreated: (child) => {
              g.enemies.push(child)
              g.eventBus.emit(Events.ENEMY_SPAWNED, child)
            },
          })
        }
      }
    }
  },
  ENEMY_SPEED_MULTIPLIER_1_5: (g) => { g.state.enemySpeedMultiplier = 1.5 },
  ENEMY_SPEED_MULTIPLIER_RESET: (g) => { g.state.enemySpeedMultiplier = 1.0 },
  DISABLE_RANDOM_TOWER: (g, buff) => {
    if (g.towers.length > 0) {
      const t = g.towers[Math.floor(Math.random() * g.towers.length)]
      t.disabled = true
      buff._targetTowerId = t.id
    }
  },
  ENABLE_DISABLED_TOWER: (g, buff) => {
    if (buff._targetTowerId) {
      const t = g.towers.find((tower) => tower.id === buff._targetTowerId)
      if (t) t.disabled = false
      buff._targetTowerId = undefined
    }
  },
}

function applyEffect(effectId: string, game: Game, buff: ActiveBuff): void {
  const fn = effectStrategies[effectId]
  if (fn) fn(game, buff)
  else console.warn(`[BuffSystem] Unknown effectId: ${effectId}`)
}

// ── BuffSystem ──

export class BuffSystem {
  currentCards: (BuffDef & { isCurse: boolean })[] = []
  private activeBuffs: ActiveBuff[] = []
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    // Clear any prior subscriptions so HMR / re-init doesn't double-subscribe.
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.BUFF_PHASE_START, () => this._drawCards(game)),

      game.eventBus.on(Events.BUFF_CARD_SELECTED, (cardId) => {
        const idx = this.currentCards.findIndex((c) => c.id === cardId)
        this._applyCard(idx, game)
      }),

      // Tick at WAVE_END so a duration=1 buff stays active for the wave that follows
      // its selection. Decrementing at WAVE_START would revert it before the wave ran.
      game.eventBus.on(Events.WAVE_END, () => this._tickBuffs(game)),

      game.eventBus.on(Events.LEVEL_START, () => {
        for (const buff of this.activeBuffs) {
          if (buff.revertId) applyEffect(buff.revertId, game, buff)
        }
        this.activeBuffs = []
        this.currentCards = []
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
  }

  private _drawCards(game?: Game): void {
    // Each Probability Shrine adds one extra card and tilts the curse-vs-buff
    // coin against the player less often. With no shrines, behave as before.
    const shrines = game ? game.towers.filter((t) => t.type === TowerType.PROBABILITY_SHRINE).length : 0
    const cardCount = 3 + shrines
    const curseChance = Math.max(0.05, 0.3 - shrines * 0.08)
    // Build a fresh array each draw so downstream consumers (e.g. the Pinia
    // store) can treat the payload as an immutable snapshot. Reassigning
    // `currentCards` — rather than splicing/pushing into the existing one —
    // is what guarantees the store's previous reference stays untouched.
    const fresh: (BuffDef & { isCurse: boolean })[] = []
    for (let i = 0; i < cardCount; i++) {
      if (Math.random() < curseChance && CURSE_POOL.length > 0) {
        const curse = CURSE_POOL[Math.floor(Math.random() * CURSE_POOL.length)]
        fresh.push({ ...curse, isCurse: true })
      } else {
        const buff = BUFF_POOL[Math.floor(Math.random() * BUFF_POOL.length)]
        fresh.push({ ...buff, isCurse: false })
      }
    }
    this.currentCards = fresh
    if (game) game.eventBus.emit(Events.BUFF_CARDS_UPDATED, fresh)
  }

  private _applyCard(cardIndex: number, game: Game): void {
    if (cardIndex < 0 || cardIndex >= this.currentCards.length) {
      game.eventBus.emit(Events.BUFF_RESULT, { success: false, cardId: '', skipped: true })
      game.setPhase(GamePhase.BUILD)
      return
    }

    const card = this.currentCards[cardIndex]

    if (card.isCurse) {
      game.changeGold(card.goldReward ?? 0)
      const entry: ActiveBuff = { ...card, remainingWaves: card.duration }
      applyEffect(card.effectId, game, entry)
      this._trackOrRevertImmediate(card, entry, game)
      game.eventBus.emit(Events.BUFF_RESULT, { success: true, cardId: card.id, skipped: false })
    } else {
      if (game.state.gold < card.cost) {
        game.eventBus.emit(Events.BUFF_RESULT, { success: false, cardId: card.id, skipped: false, insufficientGold: true })
        return  // Stay in BUFF_SELECT — UI should show "insufficient gold" and let player pick another card
      }
      game.changeGold(-card.cost)
      const success = Math.random() < card.probability
      if (success) {
        const entry: ActiveBuff = { ...card, remainingWaves: card.duration }
        applyEffect(card.effectId, game, entry)
        this._trackOrRevertImmediate(card, entry, game)
      }
      game.eventBus.emit(Events.BUFF_RESULT, { success, cardId: card.id, skipped: false })
    }

    game.setPhase(GamePhase.BUILD)
  }

  /**
   * duration > 0 (including Infinity) → add to activeBuffs for tracking (reverted on LEVEL_START or _tickBuffs)
   * duration === 0 with revertId → instant effect, revert immediately after applying
   */
  private _trackOrRevertImmediate(card: BuffDef & { isCurse: boolean }, entry: ActiveBuff, game: Game): void {
    if (card.duration > 0) {
      this.activeBuffs.push(entry)
    } else if (card.duration === 0 && card.revertId) {
      applyEffect(card.revertId, game, entry)
    } else if (card.duration === 0 && !card.revertId) {
      // One-shot effect (e.g. heal, explosion) — no revert needed.
      // Warn if this looks like a persistent modifier that's missing a revertId.
      if (import.meta.env.DEV) {
        const id = card.effectId
        if (id.includes('MULTIPLY') || id.includes('DIVIDE') || id.includes('DISABLE')) {
          console.warn(`[BuffSystem] duration=0 buff "${card.id}" (${id}) modifies persistent state but has no revertId`)
        }
      }
    }
  }

  private _tickBuffs(game: Game): void {
    for (let i = this.activeBuffs.length - 1; i >= 0; i--) {
      const buff = this.activeBuffs[i]
      buff.remainingWaves--
      if (buff.remainingWaves <= 0) {
        if (buff.revertId) applyEffect(buff.revertId, game, buff)
        this.activeBuffs.splice(i, 1)
      }
    }
  }

  update(_dt: number, _game: Game): void { /* no per-frame update needed */ }
  render(_renderer: unknown, _game: Game): void { /* rendering handled by the Vue UI layer */ }
}
