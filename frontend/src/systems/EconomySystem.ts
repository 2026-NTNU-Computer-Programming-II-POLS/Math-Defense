import { Events } from '@/data/constants'
import type { Game, GameSystem } from '@/engine/Game'
import { isShielded } from '@/engine/GameState'
import type { Renderer } from '@/engine/Renderer'
import gameConstants from '@shared/game-constants.json'

const economy = gameConstants.economy as {
  startingGoldByStar: Record<string, number>
  waveCompletionBonus: { base: number; perStar: number }
  bossCorrectAnswerBonus: number
}

export class EconomySystem implements GameSystem {
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    if (import.meta.env.DEV && this._unsubs.length > 0) {
      console.warn('[EconomySystem] init() called while still subscribed; ensure destroy() is called first')
    }
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.ENEMY_REACHED_ORIGIN, (enemy) => {
        if (isShielded(game.state)) {
          game.state.shieldHitsRemaining = Math.max(0, game.state.shieldHitsRemaining - 1)
          if (game.state.shieldHitsRemaining === 0) game.state.shieldActive = false
          return
        }
        if (game.state.hp <= 0) return
        game.changeHp(-(enemy.damage ?? 1))
      }),

      game.eventBus.on(Events.ENEMY_KILLED, (enemy) => {
        game.state.kills++
        game.addKillValue(enemy.killValue)
        game.addScore(enemy.killValue)
        const reward = (enemy.reward || 15) * game.state.goldMultiplier
        game.changeGold(Math.round(reward))
      }),

      game.eventBus.on(Events.WAVE_END, () => {
        const star = game.state.starRating
        const bonus = economy.waveCompletionBonus.base + economy.waveCompletionBonus.perStar * star
        game.changeGold(bonus)
      }),

      game.eventBus.on(Events.CHAIN_RULE_END, ({ correct }) => {
        if (correct) {
          game.changeGold(economy.bossCorrectAnswerBonus)
        }
      }),

      game.eventBus.on(Events.LEVEL_START, () => {
        const star = game.state.starRating
        const startingGold = economy.startingGoldByStar[String(star)] ?? 200
        game.state.gold = startingGold
        // healthOrigin is already set to INITIAL_HP by createInitialState(); no override needed here.
        game.eventBus.emit(Events.GOLD_CHANGED, game.state.gold)
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
  }

  update(_dt: number, game: Game): void {
    game.state.timeTotal = game.time
  }

  render(_renderer: Renderer, _game: Game): void {}
}
