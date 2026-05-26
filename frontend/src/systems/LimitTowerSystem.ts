import { Events, GamePhase, TowerType } from '@/data/constants'
import { distance } from '@/math/MathUtils'
import { hashStr } from '@/math/RandomUtils'
import { generateLimitQuestion } from '@/math/limit-evaluator'
import { applyDamage, killEnemy } from '@/domain/combat/SplitPolicy'
import type { Game } from '@/engine/Game'
import type { Tower, LimitResult } from '@/entities/types'

// A wrong or degenerate limit answer no longer removes the tower or heals
// enemies — it clamps the tower to a weak chip of its effective damage.
const WRONG_ANSWER_CHIP = 0.10

// Phase 6 Q8: LIMIT is a charge-up burst tower. The existing 3 s cooldown is
// the charge window; when it elapses the tower releases an AoE blast at
// BURST_MULTIPLIER × the formula damage. `+inf` is unaffected — multiplying
// an instakill is meaningless and the bypass-everything path must stay clean.
export const BURST_MULTIPLIER = 1.5

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

      // Phase 7 (Q14): `burst_bonus` talent adds directly to the burst
      // multiplier (1.5 → up to 2.0 at lv2). `+inf` instakills bypass this
      // entirely (the bypass-everything path stays clean per Phase 6 design).
      const burstBonus = tower.talentMods['burst_bonus'] ?? 0
      const burstMult = BURST_MULTIPLIER + burstBonus
      const range = tower.effectiveRange
      for (const enemy of game.enemies) {
        if (!enemy.alive) continue
        if (distance(tower.x, tower.y, enemy.x, enemy.y) > range) continue

        if (result.outcome === '+inf') {
          // Infinity kills outright: bypass all defensive modifiers (Bulwark
          // cap, evasion) so a correct +inf answer always removes the enemy.
          killEnemy(enemy, game)
          continue
        }

        let dmg: number
        switch (result.outcome) {
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
          applyDamage(enemy, dmg * burstMult, game, 'towerHit')
        }
      }
    }
  }

}
