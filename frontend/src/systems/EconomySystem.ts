import { Events, GamePhase } from '@/data/constants'
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
  // Set by init(); the resource-mutation API needs the game ref outside the
  // event-handler closures. Non-null after init().
  private _game: Game | null = null

  init(game: Game): void {
    if (import.meta.env.DEV && this._unsubs.length > 0) {
      console.warn('[EconomySystem] init() called while still subscribed; ensure destroy() is called first')
    }
    this.destroy()
    this._game = game
    this._unsubs.push(
      game.eventBus.on(Events.ENEMY_REACHED_ORIGIN, (enemy) => {
        if (isShielded(game.state)) {
          game.state.shieldHitsRemaining = Math.max(0, game.state.shieldHitsRemaining - 1)
          if (game.state.shieldHitsRemaining === 0) game.state.shieldActive = false
          return
        }
        if (game.state.hp <= 0) return
        this.changeHp(-(enemy.damage ?? 1))
      }),

      game.eventBus.on(Events.ENEMY_KILLED, (enemy) => {
        game.state.kills++
        game.addKillValue(enemy.killValue)
        this.addScore(enemy.killValue)
        const reward = (enemy.reward || 15) * game.state.goldMultiplier
        this.changeGold(Math.round(reward))
      }),

      game.eventBus.on(Events.WAVE_END, () => {
        const star = game.state.starRating
        const bonus = economy.waveCompletionBonus.base + economy.waveCompletionBonus.perStar * star
        this.changeGold(bonus)
      }),

      game.eventBus.on(Events.CHAIN_RULE_END, ({ correct }) => {
        if (correct) {
          this.changeGold(economy.bossCorrectAnswerBonus)
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
    this._game = null
  }

  update(_dt: number, game: Game): void {
    game.state.timeTotal = game.time
  }

  render(_renderer: Renderer, _game: Game): void {}

  // ── Resource-mutation API ────────────────────────────────────────────────
  // Audit F-ARCH-7: gold/hp/score/cost are economy-domain concerns and
  // belong on the system that owns that domain, not on the engine's Game
  // class. Other systems mutate via `game.economy.changeGold(...)` etc.

  changeGold(amount: number): void {
    const game = this._game
    if (!game) return
    if (import.meta.env.DEV && amount < 0 && game.state.gold + amount < 0) {
      console.warn(`[EconomySystem] gold underflow: attempted ${amount} from ${game.state.gold}`)
    }
    game.state.gold = Math.max(0, game.state.gold + amount)
    game.eventBus.emit(Events.GOLD_CHANGED, game.state.gold)
  }

  changeHp(amount: number): void {
    const game = this._game
    if (!game) return
    game.state.hp = Math.max(0, Math.min(game.state.maxHp, game.state.hp + amount))
    game.eventBus.emit(Events.HP_CHANGED, game.state.hp)
    if (game.state.hp <= 0) game.setPhase(GamePhase.GAME_OVER)
  }

  addScore(points: number): void {
    const game = this._game
    if (!game) return
    game.state.score += points
    game.eventBus.emit(Events.SCORE_CHANGED, game.state.score)
  }

  addCost(amount: number): void {
    const game = this._game
    if (!game) return
    game.state.costTotal = Math.round(game.state.costTotal + amount)
    game.eventBus.emit(Events.COST_TOTAL_CHANGED, game.state.costTotal)
  }
}
