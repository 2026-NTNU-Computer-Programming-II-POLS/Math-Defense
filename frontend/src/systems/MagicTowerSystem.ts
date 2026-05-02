import { Events, GamePhase, TowerType } from '@/data/constants'
import { parseExpression, type CurveFunction } from '@/math/expressionParser'
import type { Game } from '@/engine/Game'
import type { Tower } from '@/entities/types'

const ZONE_WIDTH = 1.5
// Buff zone uses a 2× multiplier relative to the debuff zone: towers sit on a
// fixed grid so a tighter width would miss well-placed towers.
const BUFF_ZONE_MULTIPLIER = 2

export class MagicTowerSystem {
  private _unsubs: (() => void)[] = []
  private _curveCache = new Map<string, { expr: string; fn: CurveFunction }>()

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.MAGIC_FUNCTION_SELECTED, ({ towerId, expression }) => {
        const tower = game.towers.find((t) => t.id === towerId)
        if (!tower || tower.type !== TowerType.MAGIC) return
        if (!parseExpression(expression)) return
        tower.magicExpression = expression
        tower.configured = true
      }),
      game.eventBus.on(Events.MAGIC_MODE_CHANGED, ({ towerId, mode }) => {
        const tower = game.towers.find((t) => t.id === towerId)
        if (tower && tower.type === TowerType.MAGIC) {
          tower.magicMode = mode
        }
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
    this._curveCache.clear()
  }

  getTowerCurve(tower: Tower): CurveFunction | null {
    const expr = tower.magicExpression
    if (!expr) return null
    const cached = this._curveCache.get(tower.id)
    if (cached && cached.expr === expr) return cached.fn
    const fn = parseExpression(expr)
    if (!fn) return null
    this._curveCache.set(tower.id, { expr, fn })
    return fn
  }

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    // Reset all magic buffs before reapplying below — ensures buff clears
    // on the frame after a buff tower is destroyed or disabled.
    for (const t of game.towers) {
      if (t.magicBuff !== 1) {
        t.magicBuff = 1
        t.effectiveDamage = t.baseDamage * t.damageBonus * t.magicBuff
      }
    }

    for (const tower of game.towers) {
      if (tower.type !== TowerType.MAGIC || tower.disabled || !tower.configured) continue
      if (!tower.magicExpression) continue

      const fn = this.getTowerCurve(tower)
      if (!fn) continue

      if (tower.magicMode === 'debuff') {
        // Debuff: cooldown-gated so DoT doesn't stack every frame.
        tower.cooldownTimer -= dt
        if (tower.cooldownTimer > 0) continue
        tower.cooldownTimer = tower.cooldown
        this._applyDebuff(tower, fn, game)
      } else {
        // Buff: applied every frame as a persistent zone — effect lasts as
        // long as the source tower is alive (cleared by the reset above).
        this._applyBuff(tower, fn, game)
      }
    }
  }

  private _applyDebuff(tower: Tower, fn: CurveFunction, game: Game): void {
    const mods = tower.talentMods
    const zoneWidth = ZONE_WIDTH * (1 + (mods['zone_width'] ?? 0))
    const strengthMult = 1 + (mods['zone_strength'] ?? 0)
    const dotDuration = 1.0 * (1 + (mods['duration'] ?? 0))
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue
      const curveY = fn(enemy.x)
      if (Math.abs(enemy.y - curveY) < zoneWidth) {
        enemy.slowFactor = Math.max(enemy.slowFactor, 0.4)
        enemy.slowTimer = dotDuration
        enemy.dotDamage = tower.effectiveDamage * strengthMult
        enemy.dotTimer = dotDuration
      }
    }
  }

  private _applyBuff(tower: Tower, fn: CurveFunction, game: Game): void {
    const mods = tower.talentMods
    const zoneWidth = ZONE_WIDTH * (1 + (mods['zone_width'] ?? 0))
    const strengthMult = 1 + (mods['zone_strength'] ?? 0)
    const buffAmount = 1.25 * strengthMult
    for (const other of game.towers) {
      if (other.id === tower.id || other.disabled) continue
      const curveY = fn(other.x)
      if (Math.abs(other.y - curveY) < zoneWidth * BUFF_ZONE_MULTIPLIER) {
        other.magicBuff = Math.max(other.magicBuff, buffAmount)
        other.effectiveDamage = other.baseDamage * other.damageBonus * other.magicBuff
      }
    }
  }

  render(): void {}
}
