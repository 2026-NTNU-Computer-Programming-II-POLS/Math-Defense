/**
 * EconomySystem — 遊戲經濟規則
 * 從 Game._setupEventHandlers 提取，讓 Game.ts 不再包含業務邏輯。
 */
import { Events } from '@/data/constants'
import type { Game, GameSystem } from '@/engine/Game'
import type { Renderer } from '@/engine/Renderer'

export class EconomySystem implements GameSystem {
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this._unsubs.push(
      game.eventBus.on(Events.ENEMY_REACHED_ORIGIN, () => {
        if (!game.state.shieldActive) {
          game.changeHp(-1)
        }
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
