import { Events, GamePhase, GRID_MIN_X, GRID_MAX_X, GRID_MIN_Y, GRID_MAX_Y } from '@/data/constants'
import { SPELL_MAP } from '@/data/spell-defs'
import { applyDamage } from '@/domain/combat/SplitPolicy'
import type { Enemy } from '@/entities/types'
import type { Game, GameSystem } from '@/engine/Game'

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
    if (game.state.phase !== GamePhase.WAVE) return
    const def = SPELL_MAP.get(spellId)
    if (!def) return
    if (!this.canCast(spellId, game)) return

    // S-5: reject out-of-bounds target position before spending resources
    if (def.radius !== undefined) {
      if (x < GRID_MIN_X || x > GRID_MAX_X || y < GRID_MIN_Y || y > GRID_MAX_Y) return
    }

    game.economy.changeGold(-def.cost)
    game.economy.addCost(def.cost)
    game.state.spellCooldowns[spellId] = def.cooldown

    let hitCount = 0
    switch (def.id) {
      case 'fireball':
        hitCount = this._applyAreaDamage(x, y, def.radius!, def.damage!, game)
        break
      case 'slow':
        hitCount = this._applyAreaSlow(x, y, def.radius!, def.slowFactor!, def.duration!, game)
        break
      case 'lightning':
        {
          const target = this._applySingleDamage(targetId, x, y, def.damage!, game)
          if (!target) {
            this._refundSpell(spellId, def.cost, game)
            return
          }
          x = target.x
          y = target.y
          hitCount = 1
        }
        break
      case 'haste':
        this._applyTowerBoost(def.duration!, game)
        hitCount = 1
        break
    }

    // S-8: refund AoE cost when no enemies were in range
    if (hitCount === 0 && def.radius !== undefined) {
      if (def.showVfxOnMiss) {
        game.eventBus.emit(Events.SPELL_EFFECT, { spellId, x, y, radius: def.radius })
      }
      this._refundSpell(spellId, def.cost, game)
      return
    }

    game.eventBus.emit(Events.SPELL_EFFECT, { spellId, x, y, radius: def.radius })
  }

  private _applyAreaDamage(x: number, y: number, radius: number, damage: number, game: Game): number {
    let hits = 0
    const enemies = [...game.enemies]
    for (const enemy of enemies) {
      if (!enemy.alive) continue
      if (dist(x, y, enemy.x, enemy.y) > radius) continue  // S-6: > means boundary is inclusive
      hits++
      applyDamage(enemy, damage, game, 'spell')
    }
    return hits
  }

  private _applyAreaSlow(x: number, y: number, radius: number, factor: number, duration: number, game: Game): number {
    let hits = 0
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue
      if (dist(x, y, enemy.x, enemy.y) > radius) continue  // S-6: > means boundary is inclusive
      hits++
      enemy.slowFactor = Math.max(enemy.slowFactor, factor)
      // max() not assignment: a shorter slow from another source (e.g. a Magic
      // debuff tower's 2 s window) overlapping this cast must not truncate the
      // longer spell slow. Same refresh semantics — on a fresh enemy
      // max(0, duration) is still `duration`.
      enemy.slowTimer = Math.max(enemy.slowTimer, duration)
    }
    return hits
  }

  private _applySingleDamage(
    targetId: string | undefined,
    x: number,
    y: number,
    damage: number,
    game: Game,
  ): Enemy | null {
    const target = targetId
      ? game.enemies.find((e) => e.id === targetId && e.alive)
      : this._findNearestEnemy(x, y, game.enemies)
    if (!target) return null
    applyDamage(target, damage, game, 'spell')
    return target
  }

  private _findNearestEnemy(x: number, y: number, enemies: Enemy[]): Enemy | null {
    let best: Enemy | null = null
    let bestDist = Infinity
    for (const enemy of enemies) {
      if (!enemy.alive) continue
      const d = dist(x, y, enemy.x, enemy.y)
      if (d >= bestDist) continue
      best = enemy
      bestDist = d
    }
    return best
  }

  private _refundSpell(spellId: string, cost: number, game: Game): void {
    game.economy.changeGold(cost)
    game.economy.addCost(-cost)
    game.state.spellCooldowns[spellId] = 0
  }

  private _applyTowerBoost(duration: number, game: Game): void {
    const buffSys = game.getSystem('buff')
    if (import.meta.env.DEV && !buffSys) {
      console.warn('[SpellSystem] haste no-op: BuffSystem not registered')
    }
    buffSys?.applyExternalBuff(
      'ALL_TOWERS_DAMAGE_MULTIPLY_1_5',
      'ALL_TOWERS_DAMAGE_DIVIDE_1_5',
      duration,
      'Acceleration',
      game,
    )
  }

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return
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

}
