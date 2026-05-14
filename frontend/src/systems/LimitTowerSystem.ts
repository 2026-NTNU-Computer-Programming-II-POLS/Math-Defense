import { Events, GamePhase, TowerType } from '@/data/constants'
import { distance } from '@/math/MathUtils'
import { hashStr } from '@/math/RandomUtils'
import { generateLimitQuestion } from '@/math/limit-evaluator'
import { applyDamage } from '@/domain/combat/SplitPolicy'
import type { Game } from '@/engine/Game'
import type { Tower, LimitResult } from '@/entities/types'

// A wrong or degenerate limit answer no longer removes the tower or heals
// enemies — it clamps the tower to a weak chip of its effective damage.
const WRONG_ANSWER_CHIP = 0.10

export class LimitTowerSystem {
  private _unsubs: (() => void)[] = []
  private _questionSeed = 0
  private _levelSeedNonce = 0

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.LIMIT_ANSWER, ({ towerId, answer }: { towerId: string; answer: LimitResult }) => {
        const tower = game.towers.find((t) => t.id === towerId)
        if (!tower || tower.type !== TowerType.LIMIT) return
        tower.limitResult = answer
        tower.configured = true
      }),
      game.eventBus.on(Events.LEVEL_START, () => {
        this._levelSeedNonce += 1
        this._questionSeed = Date.now() + this._levelSeedNonce
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
  }

  generateQuestion(tower: Tower) {
    return generateLimitQuestion(tower.x, this._questionSeed + hashStr(tower.id))
  }

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    for (const tower of game.towers) {
      if (tower.type !== TowerType.LIMIT || tower.disabled || !tower.configured) continue
      if (!tower.limitResult) continue

      tower.cooldownTimer -= dt
      if (tower.cooldownTimer > 0) continue
      tower.cooldownTimer = tower.cooldown

      const result = tower.limitResult

      const range = tower.effectiveRange
      for (const enemy of game.enemies) {
        if (!enemy.alive) continue
        if (distance(tower.x, tower.y, enemy.x, enemy.y) > range) continue

        let dmg: number
        switch (result.outcome) {
          case '+inf': dmg = Math.max(tower.effectiveDamage, enemy.hp); break
          case '+c': dmg = tower.effectiveDamage * Math.abs(result.value); break
          case 'zero':
          case 'constant':
          case '-c':
          case '-inf':
            dmg = tower.effectiveDamage * WRONG_ANSWER_CHIP
            break
          default: dmg = 0
        }

        if (dmg > 0) {
          applyDamage(enemy, dmg, game, 'towerHit')
        }
      }
    }
  }

}
