import { Events, GamePhase, TowerType } from '@/data/constants'
import { distance } from '@/math/MathUtils'
import { hashStr } from '@/math/RandomUtils'
import { generateLimitQuestion } from '@/math/limit-evaluator'
import { shouldSplit, spawnChildren } from '@/domain/combat/SplitPolicy'
import type { Game } from '@/engine/Game'
import type { Tower, LimitResult } from '@/entities/types'

export class LimitTowerSystem {
  private _unsubs: (() => void)[] = []
  private _questionSeed = 0

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.LIMIT_ANSWER, ({ towerId, answer }: { towerId: string; answer: LimitResult }) => {
        const tower = game.towers.find((t) => t.id === towerId)
        if (!tower || tower.type !== TowerType.LIMIT) return
        tower.limitResult = answer
        tower.configured = true
        this._applyLimitEffect(tower, answer, game)
      }),
      game.eventBus.on(Events.LEVEL_START, () => {
        this._questionSeed = Date.now()
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
      if (result.outcome === 'zero' || result.outcome === 'constant') continue

      const range = tower.effectiveRange
      for (const enemy of game.enemies) {
        if (!enemy.alive) continue
        if (distance(tower.x, tower.y, enemy.x, enemy.y) > range) continue

        let dmg: number
        switch (result.outcome) {
          case '+inf': dmg = tower.effectiveDamage * 3; break
          case '+c': dmg = tower.effectiveDamage * Math.abs(result.value); break
          case '-c':
            enemy.hp = Math.min(enemy.maxHp, enemy.hp + tower.effectiveDamage * Math.abs(result.value) * 0.5)
            continue
          case '-inf':
            enemy.hp = Math.min(enemy.maxHp, enemy.hp + tower.effectiveDamage * 2)
            continue
          default: dmg = 0
        }

        if (dmg > 0) {
          let remaining = dmg * game.state.enemyVulnerability
          if (enemy.shield > 0) {
            const absorbed = Math.min(enemy.shield, remaining)
            enemy.shield -= absorbed
            remaining -= absorbed
          }
          if (remaining > 0) {
            enemy.hp -= remaining
          }
          if (enemy.hp <= 0) {
            enemy.hp = 0
            enemy.alive = false
            enemy.active = false
            game.eventBus.emit(Events.ENEMY_KILLED, enemy)
            if (shouldSplit(enemy) && game.levelContext?.path) {
              spawnChildren(enemy, {
                path: game.levelContext.path,
                onChildCreated: (child) => {
                  game.enemies.push(child)
                  game.eventBus.emit(Events.ENEMY_SPAWNED, child)
                },
              })
            }
          }
        }
      }
    }
  }

  private _applyLimitEffect(tower: Tower, result: LimitResult, game: Game): void {
    if (result.outcome === 'zero') {
      const idx = game.towers.findIndex((t) => t.id === tower.id)
      if (idx >= 0) game.towers.splice(idx, 1)
    } else if (result.outcome === 'constant') {
      tower.disabled = true
    }
  }

  render(): void {}
}
