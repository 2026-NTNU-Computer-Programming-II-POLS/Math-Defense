/**
 * BuffSystem — Buff 卡 / 詛咒系統（策略模式重寫）
 * buff-defs.ts 存 effectId 字串；本檔維護 effectStrategies Map 執行效果。
 * 不再有 game._shieldActive 等動態注入屬性。
 */
import { Events, GamePhase, TowerType } from '@/data/constants'
import { BUFF_POOL, CURSE_POOL, type BuffDef } from '@/data/buff-defs'
import { shouldSplit, spawnChildren } from '@/domain/combat/SplitSlimePolicy'
import type { Game } from '@/engine/Game'

interface ActiveBuff extends BuffDef {
  remainingWaves: number
  isCurse: boolean
  _targetTowerId?: string   // 用於 RANDOM_TOWER_RANGE 系列
}

// ── 效果策略 Map ──

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
    g.towers.forEach((t) => { t.damageBonus *= 1.5 })
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_DIVIDE_1_5: (g) => {
    g.towers.forEach((t) => { t.damageBonus = snap(t.damageBonus / 1.5) })
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_MULTIPLY_0_8: (g) => {
    g.towers.forEach((t) => { t.damageBonus *= 0.8 })
    recalcDamage(g)
  },
  ALL_TOWERS_DAMAGE_DIVIDE_0_8: (g) => {
    g.towers.forEach((t) => { t.damageBonus = snap(t.damageBonus / 0.8) })
    recalcDamage(g)
  },
  RANDOM_TOWER_RANGE_MULTIPLY_1_3: (g, buff) => {
    if (g.towers.length > 0) {
      const t = g.towers[Math.floor(Math.random() * g.towers.length)]
      t.rangeBonus *= 1.3
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
    // 對所有存活敵人造成 50 傷害
    const enemies = [...g.enemies] // snapshot 避免迭代中修改陣列
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
    this._unsubs.push(
      game.eventBus.on(Events.BUFF_PHASE_START, () => this._drawCards()),

      game.eventBus.on(Events.BUFF_CARD_SELECTED, (cardId) => {
        const idx = this.currentCards.findIndex((c) => c.id === cardId)
        this._applyCard(idx, game)
      }),

      game.eventBus.on(Events.WAVE_START, () => this._tickBuffs(game)),

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

  private _drawCards(): void {
    this.currentCards = []
    for (let i = 0; i < 3; i++) {
      if (Math.random() < 0.3 && CURSE_POOL.length > 0) {
        const curse = CURSE_POOL[Math.floor(Math.random() * CURSE_POOL.length)]
        this.currentCards.push({ ...curse, isCurse: true })
      } else {
        const buff = BUFF_POOL[Math.floor(Math.random() * BUFF_POOL.length)]
        this.currentCards.push({ ...buff, isCurse: false })
      }
    }
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
   * duration > 0（含 Infinity）→ 加入 activeBuffs 追蹤（LEVEL_START 或 _tickBuffs 會還原）
   * duration === 0 且有 revertId → 即時效果，執行完立刻還原
   */
  private _trackOrRevertImmediate(card: BuffDef & { isCurse: boolean }, entry: ActiveBuff, game: Game): void {
    if (card.duration > 0) {
      this.activeBuffs.push(entry)
    } else if (card.duration === 0 && card.revertId) {
      applyEffect(card.revertId, game, entry)
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

  update(_dt: number, _game: Game): void { /* 無需每幀更新 */ }
  render(_renderer: unknown, _game: Game): void { /* 渲染由 Vue UI 層負責 */ }
}
