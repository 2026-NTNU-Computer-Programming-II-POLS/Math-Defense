/**
 * EconomySystem — game economy rules
 * Extracted from Game._setupEventHandlers to keep Game.ts free of business logic.
 */
import { Events } from '@/data/constants'
import type { Game, GameSystem } from '@/engine/Game'
import type { Renderer } from '@/engine/Renderer'

export class EconomySystem implements GameSystem {
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    // Clear any prior subscriptions so HMR / re-init doesn't double-subscribe.
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.ENEMY_REACHED_ORIGIN, (enemy) => {
        if (game.state.shieldActive) return
        // Per-enemy damage so a boss reaching origin actually ends the game; basic slimes still cost 1.
        game.changeHp(-(enemy.damage ?? 1))
      }),

      game.eventBus.on(Events.ENEMY_KILLED, (enemy) => {
        game.state.kills++
        game.addScore(10)
        const reward = (enemy.reward || 15) * game.state.goldMultiplier
        game.changeGold(reward)
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
  }

  update(_dt: number, _game: Game): void {}
  render(_renderer: Renderer, _game: Game): void {}
}
