import { Events, GamePhase, TowerType } from '@/data/constants'
import { parseExpression, type CurveFunction } from '@/math/expressionParser'
import { recomputeEffectiveDamage, effectiveCooldown } from '@/entities/tower-stats'
import type { Game } from '@/engine/Game'
import type { Tower } from '@/entities/types'

export const ZONE_WIDTH = 1.5
// Buff zone uses a 2× multiplier relative to the debuff zone: towers sit on a
// fixed grid so a tighter width would miss well-placed towers.
export const BUFF_ZONE_MULTIPLIER = 2

// Phase 6 Q7: slow lingers longer than the DoT tick window so consecutive
// debuff hits keep the enemy slowed without a gap. Both still scale by the
// `duration` talent mod (same surface as the DoT duration).
export const SLOW_BASE_DURATION = 2.0
export const DOT_BASE_DURATION = 1.0
// slowFactor = fraction of speed REMOVED (see MovementSystem:84 — final speed =
// base × (1 − slowFactor)). So 0.4 → 60% of normal speed.
export const SLOW_FACTOR = 0.4
// Phase 7 (Q14): the deepest the `slow_strength` talent can push the slow.
// Capped at 0.90 (≥ 10% of normal speed) so a future stacked modifier cannot
// drive slowFactor to ≥ 1 and freeze enemies outright.
export const SLOW_FACTOR_CEIL = 0.90

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

  // Ordering dependency (Phase 7 §7.3): TowerInterferenceSystem must run
  // before MagicTowerSystem each frame so `tower.interferenceFactor` is set
  // before the magic buff is folded in. Both systems write effectiveDamage
  // only through `recomputeEffectiveDamage`, which reads interferenceFactor,
  // so the two factors compose with no flicker or double-application.
  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    // Reset all magic buffs before reapplying below — ensures buff clears
    // on the frame after a buff tower is destroyed or disabled.
    for (const t of game.towers) {
      if (t.magicBuff !== 1) {
        t.magicBuff = 1
        recomputeEffectiveDamage(t, game.state)
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
        tower.cooldownTimer = effectiveCooldown(tower, game.state)
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
    const durationMult = 1 + (mods['duration'] ?? 0)
    // Phase 6 Q7: slow outlasts the DoT window. Refresh-on-rehit semantics
    // — `max()` on the factor and overwrite the timer — mean stacking two
    // MAGIC towers does not push the slow past SLOW_FACTOR.
    const slowDuration = SLOW_BASE_DURATION * durationMult
    const dotDuration = DOT_BASE_DURATION * durationMult
    // Phase 7 (Q14): `slow_strength` deepens the slow. slowFactor is the
    // amount of speed REMOVED, so a bigger factor = stronger slow. Cap at
    // SLOW_FACTOR_CEIL so future stacking cannot freeze enemies (≥ 1.0).
    const slowDepthMod = mods['slow_strength'] ?? 0
    const slowFactor = Math.min(SLOW_FACTOR_CEIL, SLOW_FACTOR + slowDepthMod)
    const range = tower.effectiveRange
    // Curve is evaluated in world coordinates so students must compute the
    // translation `y = f(x − h) + k` themselves — but the influence is gated
    // by the tower's range on x, otherwise a curve passing far away would
    // still tag distant enemies.
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue
      if (Math.abs(enemy.x - tower.x) > range) continue
      const curveY = fn(enemy.x)
      if (Math.abs(enemy.y - curveY) < zoneWidth) {
        enemy.slowFactor = Math.max(enemy.slowFactor, slowFactor)
        enemy.slowTimer = slowDuration
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
    const range = tower.effectiveRange
    for (const other of game.towers) {
      if (other.id === tower.id || other.disabled) continue
      if (Math.abs(other.x - tower.x) > range) continue
      const curveY = fn(other.x)
      if (Math.abs(other.y - curveY) < zoneWidth * BUFF_ZONE_MULTIPLIER) {
        other.magicBuff = Math.max(other.magicBuff, buffAmount)
        recomputeEffectiveDamage(other, game.state)
      }
    }
  }

}
