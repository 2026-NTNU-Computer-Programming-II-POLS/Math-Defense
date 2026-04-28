import { Events, GamePhase } from '@/data/constants'
import { SPELL_MAP, type SpellDef } from '@/data/spell-defs'
import { shouldSplit, spawnChildren } from '@/domain/combat/SplitSlimePolicy'
import type { Game, GameSystem } from '@/engine/Game'
import type { Renderer } from '@/engine/Renderer'
import type { Enemy } from '@/entities/types'

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

export class SpellSystem implements GameSystem {
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this.destroy()

    this._unsubs.push(
      game.eventBus.on(Events.SPELL_CAST, (payload) => {
        this._castSpell(payload.spellId, payload.x, payload.y, payload.targetId, game)
      }),

      game.eventBus.on(Events.LEVEL_START, () => {
        game.state.spellCooldowns = {}
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
  }

  canCast(spellId: string, game: Game): boolean {
    const def = SPELL_MAP.get(spellId)
    if (!def) return false
    if (game.state.gold < def.cost) return false
    if ((game.state.spellCooldowns[spellId] ?? 0) > 0) return false
    return true
  }

  private _castSpell(spellId: string, x: number, y: number, targetId: string | undefined, game: Game): void {
    const def = SPELL_MAP.get(spellId)
    if (!def) return
    if (!this.canCast(spellId, game)) return

    game.changeGold(-def.cost)
    game.addCost(def.cost)
    game.state.spellCooldowns[spellId] = def.cooldown

    switch (def.id) {
      case 'fireball':
        this._applyAreaDamage(x, y, def.radius!, def.damage!, game)
        break
      case 'slow':
        this._applyAreaSlow(x, y, def.radius!, def.slowFactor!, def.duration!, game)
        break
      case 'lightning':
        this._applySingleDamage(targetId, def.damage!, game)
        break
      case 'heal':
        this._applyTowerBoost(def.duration!, game)
        break
    }

    game.eventBus.emit(Events.SPELL_EFFECT, { spellId, x, y, radius: def.radius })
  }

  private _applyAreaDamage(x: number, y: number, radius: number, damage: number, game: Game): void {
    const enemies = [...game.enemies]
    for (const enemy of enemies) {
      if (!enemy.alive) continue
      if (dist(x, y, enemy.x, enemy.y) > radius) continue
      const dmg = damage * game.state.enemyVulnerability
      enemy.hp -= dmg
      if (enemy.hp <= 0) {
        this._killEnemy(enemy, game)
      }
    }
  }

  private _applyAreaSlow(x: number, y: number, radius: number, factor: number, duration: number, game: Game): void {
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue
      if (dist(x, y, enemy.x, enemy.y) > radius) continue
      enemy.slowFactor = factor
      enemy.dotTimer = (enemy.dotTimer ?? 0) + duration
    }
  }

  private _applySingleDamage(targetId: string | undefined, damage: number, game: Game): void {
    const target = targetId
      ? game.enemies.find((e) => e.id === targetId && e.alive)
      : game.enemies.find((e) => e.alive)
    if (!target) return
    const dmg = damage * game.state.enemyVulnerability
    target.hp -= dmg
    if (target.hp <= 0) {
      this._killEnemy(target, game)
    }
  }

  private _applyTowerBoost(duration: number, game: Game): void {
    const buffSys = game.getSystem('buff')
    buffSys?.applyExternalBuff(
      'ALL_TOWERS_DAMAGE_MULTIPLY_1_5',
      'ALL_TOWERS_DAMAGE_DIVIDE_1_5',
      duration,
      'Rejuvenate',
      game,
    )
  }

  private _killEnemy(enemy: Enemy, game: Game): void {
    enemy.hp = 0
    enemy.alive = false
    enemy.active = false
    game.eventBus.emit(Events.ENEMY_KILLED, enemy)
    if (shouldSplit(enemy)) {
      spawnChildren(enemy, {
        path: game.levelContext?.path ?? null,
        onChildCreated: (child) => {
          game.enemies.push(child)
          game.eventBus.emit(Events.ENEMY_SPAWNED, child)
        },
      })
    }
  }

  update(dt: number, game: Game): void {
    const cds = game.state.spellCooldowns
    for (const id of Object.keys(cds)) {
      if (cds[id] > 0) {
        cds[id] -= dt
        if (cds[id] <= 0) {
          cds[id] = 0
          game.eventBus.emit(Events.SPELL_COOLDOWN_READY, id)
        }
      }
    }
  }

  render(_renderer: Renderer, _game: Game): void {}
}
