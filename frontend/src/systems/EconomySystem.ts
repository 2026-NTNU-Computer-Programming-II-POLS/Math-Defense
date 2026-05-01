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
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.ENEMY_REACHED_ORIGIN, (enemy) => {
        if (isShielded(game.state)) {
          game.state.shieldHitsRemaining--
          if (game.state.shieldHitsRemaining <= 0) {
            game.state.shieldActive = false
            game.state.shieldHitsRemaining = 0
          }
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
        game.state.healthOrigin = game.state.hp
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
