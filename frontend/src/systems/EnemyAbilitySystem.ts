import { EnemyType, Events, GamePhase } from '@/data/constants'
import { distance } from '@/math/MathUtils'
import { createEnemy } from '@/entities/EnemyFactory'
import { ENEMY_DEFS } from '@/data/enemy-defs'
import { generateChainRuleQuestion, type ChainRuleQuestion } from '@/math/chain-rule-generator'
import type { Game, GameSystem } from '@/engine/Game'
import type { Enemy } from '@/entities/types'

export class EnemyAbilitySystem implements GameSystem {
  private _unsubs: (() => void)[] = []
  private _pendingChainRule: { boss: Enemy; question: ChainRuleQuestion } | null = null

  init(game: Game): void {
    this.destroy()

    this._unsubs.push(
      game.eventBus.on(Events.CHAIN_RULE_ANSWER, (payload) => {
        this._handleChainRuleAnswer(payload as { correct: boolean }, game)
      }),
      game.eventBus.on(Events.ENEMY_KILLED, (enemy) => {
        this._onEnemyKilled(enemy, game)
      }),
      // Backlog §25: sample the per-spawn HP-trigger fraction once, here,
      // using game.rng so the draw is replayable.
      game.eventBus.on(Events.ENEMY_SPAWNED, (enemy) => {
        this._sampleTriggerFraction(enemy, game)
      }),
    )
  }

  private _sampleTriggerFraction(enemy: Enemy, game: Game): void {
    const range = ENEMY_DEFS[enemy.type]?.triggerHpRange
    if (!range) return
    const [lo, hi] = range
    enemy.chainRuleTriggerFraction = lo + (hi - lo) * game.rng()
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
    this._pendingChainRule = null
  }

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    for (const enemy of game.enemies) {
      if (!enemy.alive) continue

      if (enemy.helperRadius > 0) {
        this._tickHelper(dt, enemy, game)
      }

      if (enemy.minionInterval > 0 && enemy.minionType) {
        this._tickMinionSpawn(dt, enemy, game)
      }

      if (enemy.type === EnemyType.BOSS_B && !enemy.chainRuleTriggered) {
        // Backstop: if ENEMY_SPAWNED was missed (e.g. boss spawned before
        // this system's init ran), sample now so the ability can never be
        // permanently skipped — fulfils §25 acceptance "never skip".
        if (enemy.chainRuleTriggerFraction <= 0) {
          this._sampleTriggerFraction(enemy, game)
        }
        if (enemy.hp <= enemy.maxHp * enemy.chainRuleTriggerFraction) {
          this._triggerChainRule(enemy, game)
        }
      }
    }
  }

  private _tickHelper(dt: number, helper: Enemy, game: Game): void {
    for (const other of game.enemies) {
      if (!other.alive || other.id === helper.id) continue
      if (distance(helper.x, helper.y, other.x, other.y) <= helper.helperRadius) {
        other.hp = Math.min(other.maxHp, other.hp + helper.helperHealPerSec * dt)
        other.speedBoost = Math.max(other.speedBoost, helper.helperSpeedBuff)
      }
    }
  }

  private _tickMinionSpawn(dt: number, boss: Enemy, game: Game): void {
    boss.minionTimer += dt
    if (boss.minionTimer < boss.minionInterval) return
    boss.minionTimer -= boss.minionInterval

    if (!game.levelContext?.path) return
    const minion = createEnemy(boss.minionType!, game.levelContext.path, boss.x, boss._targetX)
    game.enemies.push(minion)
    game.eventBus.emit(Events.ENEMY_SPAWNED, minion)
  }

  private _triggerChainRule(boss: Enemy, game: Game): void {
    boss.chainRuleTriggered = true
    // Pass game.rng so the boss-A2 chain-rule question is replayable
    // (Backlog §24). Without this, generateChainRuleQuestion's default
    // Math.random would diverge between record and replay.
    const question = generateChainRuleQuestion(game.rng)
    this._pendingChainRule = { boss, question }

    game.setPhase(GamePhase.CHAIN_RULE)
    game.eventBus.emit(Events.CHAIN_RULE_START, question)
  }

  private _handleChainRuleAnswer(payload: { correct: boolean }, game: Game): void {
    if (!this._pendingChainRule) return
    const { boss, question } = this._pendingChainRule
    this._pendingChainRule = null

    // chainRuleAnsweredCorrectly MUST be set before emitting ENEMY_KILLED:
    // _onEnemyKilled reads this flag synchronously to decide whether to split.
    boss.chainRuleAnsweredCorrectly = payload.correct

    if (payload.correct) {
      boss.alive = false
      boss.active = false
      game.eventBus.emit(Events.ENEMY_KILLED, boss)
      this._splitBoss(boss, question, game)
    }

    game.setPhase(GamePhase.WAVE)
    game.eventBus.emit(Events.CHAIN_RULE_END, { correct: payload.correct, bossId: boss.id })
  }

  private _onEnemyKilled(enemy: Enemy, game: Game): void {
    if (enemy.type !== EnemyType.BOSS_B) return
    if (enemy.chainRuleAnsweredCorrectly === true) return

    const question = generateChainRuleQuestion(game.rng)
    this._splitBoss(enemy, question, game)
  }

  private _splitBoss(boss: Enemy, question: ChainRuleQuestion, game: Game): void {
    if (!game.levelContext?.path) return

    const path = game.levelContext.path

    const child1 = createEnemy(EnemyType.STRONG, path, boss.x, boss._targetX)
    child1.hp = Math.round(boss.maxHp * 0.6)
    child1.maxHp = child1.hp
    child1.speed = boss.speed
    child1.size = Math.round(boss.size * 0.8)
    child1.reward = Math.round(boss.reward * 0.3)
    child1.killValue = Math.round(boss.killValue * 0.3)
    child1.color = '#e04060'
    child1.shield = 0
    child1.shieldMax = 0
    child1.minionInterval = 0

    const child2 = createEnemy(EnemyType.FAST, path, boss.x, boss._targetX)
    child2.hp = Math.round(boss.maxHp * 0.4)
    child2.maxHp = child2.hp
    child2.speed = boss.speed * 1.2
    child2.size = Math.round(boss.size * 0.7)
    child2.reward = Math.round(boss.reward * 0.3)
    child2.killValue = Math.round(boss.killValue * 0.2)
    child2.color = '#d060a0'
    child2.shield = 0
    child2.shieldMax = 0
    child2.minionInterval = 0

    game.enemies.push(child1, child2)
    game.eventBus.emit(Events.ENEMY_SPAWNED, child1)
    game.eventBus.emit(Events.ENEMY_SPAWNED, child2)
    game.eventBus.emit(Events.BOSS_SPLIT, {
      bossId: boss.id,
      children: [child1.id, child2.id],
      fPrimeOfG: question.fPrimeOfG,
      gPrime: question.gPrime,
    })
  }

}
