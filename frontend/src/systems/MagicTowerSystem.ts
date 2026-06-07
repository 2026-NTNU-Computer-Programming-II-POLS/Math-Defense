import { Events, GamePhase, TowerType } from '@/data/constants'
import { parseExpression, type CurveFunction } from '@/math/expressionParser'
import { distance } from '@/math/MathUtils'
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
    // Reset every tower's magic buff each frame, BEFORE the phase gate. The
    // buff is only re-applied during WAVE (below), so clearing it here drops
    // the buff the instant a wave ends. Doing the reset only inside the WAVE
    // branch left it stale through BUILD — and CalculusTowerSystem snapshots
    // `magicBuff` into its pets' damage at respawn, so a respawn between waves
    // baked a buff that no longer had a source. The `!== 1` guard keeps this
    // idempotent once cleared.
    for (const t of game.towers) {
      if (t.magicBuff !== 1) {
        t.magicBuff = 1
        recomputeEffectiveDamage(t, game.state)
      }
    }

    if (game.state.phase !== GamePhase.WAVE) return

    // Two ordered passes so the outcome never depends on tower placement
    // order. Pass 1 folds every buff zone into the affected towers'
    // effectiveDamage; pass 2 runs the debuffs, whose DoT reads that
    // already-buffed effectiveDamage. A single interleaved pass let a buff
    // reach a debuff tower's DoT only when the buff tower happened to sit
    // earlier in `game.towers`.
    for (const tower of game.towers) {
      if (!this._isActiveMagicTower(tower) || tower.magicMode === 'debuff') continue
      const fn = this.getTowerCurve(tower)
      if (!fn) continue
      this._applyBuff(tower, fn, game)
    }

    for (const tower of game.towers) {
      if (!this._isActiveMagicTower(tower) || tower.magicMode !== 'debuff') continue
      const fn = this.getTowerCurve(tower)
      if (!fn) continue
      // Debuff is cooldown-gated so the DoT doesn't stack every frame.
      tower.cooldownTimer -= dt
      if (tower.cooldownTimer > 0) continue
      tower.cooldownTimer = effectiveCooldown(tower, game.state)
      this._applyDebuff(tower, fn, game)
    }
  }

  private _isActiveMagicTower(tower: Tower): boolean {
    return (
      tower.type === TowerType.MAGIC &&
      !tower.disabled &&
      tower.configured &&
      !!tower.magicExpression
    )
  }

  private _applyDebuff(tower: Tower, fn: CurveFunction, game: Game): void {
    const mods = tower.talentMods
    const zoneWidth = ZONE_WIDTH * (1 + (mods['zone_width'] ?? 0))
    const strengthMult = 1 + (mods['zone_strength'] ?? 0)
    const durationMult = 1 + (mods['duration'] ?? 0)
    // Phase 6 Q7: slow outlasts the DoT window. Refresh-on-rehit semantics
    // — `max()` on both the factor and the timer (see the apply block below) —
    // mean stacking two MAGIC towers does not push the slow past SLOW_FACTOR,
    // while a longer slow from another source is never truncated.
    const slowDuration = SLOW_BASE_DURATION * durationMult
    const dotDuration = DOT_BASE_DURATION * durationMult
    // Phase 7 (Q14): `slow_strength` deepens the slow. slowFactor is the
    // amount of speed REMOVED, so a bigger factor = stronger slow. Cap at
    // SLOW_FACTOR_CEIL so future stacking cannot freeze enemies (≥ 1.0).
    const slowDepthMod = mods['slow_strength'] ?? 0
    const slowFactor = Math.min(SLOW_FACTOR_CEIL, SLOW_FACTOR + slowDepthMod)
    const range = tower.effectiveRange
    // Curve is evaluated in world coordinates so students must compute the
    // translation `y = f(x − h) + k` themselves. Influence is a CIRCULAR range
    // centered on the tower (radius = effectiveRange), measured to the curve
    // point `(x, f(x))` — same radial semantics as RadarTargeting and the drawn
    // band. Gating on `|enemy.x − tower.x|` alone (the old slab) let a steep
    // curve reach far past `range` along its arc; the radial gate caps the
    // actual reach at `range` regardless of slope.
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue
      // Cheap x-axis pre-filter — the curve point can only sit within `range`
      // of the tower if its x is, so this skips the fn() eval for far enemies.
      // The authoritative gate is the radial distance below.
      if (Math.abs(enemy.x - tower.x) > range) continue
      const curveY = fn(enemy.x)
      if (distance(tower.x, tower.y, enemy.x, curveY) > range) continue
      if (Math.abs(enemy.y - curveY) < zoneWidth) {
        // max() on every field, not assignment, so overlapping debuff zones
        // (and a longer slow from an Asymptote spell) compose as "strongest +
        // longest wins" instead of "last writer wins" — which let a weaker or
        // shorter source clobber a stronger/longer one. Refresh-on-rehit is
        // preserved: a re-hit from the same tower still tops up to full because
        // max(remaining, full) === full.
        enemy.slowFactor = Math.max(enemy.slowFactor, slowFactor)
        enemy.slowTimer = Math.max(enemy.slowTimer, slowDuration)
        enemy.dotDamage = Math.max(enemy.dotDamage, tower.effectiveDamage * strengthMult)
        enemy.dotTimer = Math.max(enemy.dotTimer, dotDuration)
      }
    }
  }

  private _applyBuff(tower: Tower, fn: CurveFunction, game: Game): void {
    const mods = tower.talentMods
    const zoneWidth = ZONE_WIDTH * (1 + (mods['zone_width'] ?? 0))
    const strengthMult = 1 + (mods['zone_strength'] ?? 0)
    const buffAmount = 1.25 * strengthMult
    const range = tower.effectiveRange
    // Circular range centered on the tower (see _applyDebuff) — the buff zone
    // shares the same radial gate; only the band's vertical half-width is
    // widened by BUFF_ZONE_MULTIPLIER, not its reach.
    for (const other of game.towers) {
      if (other.id === tower.id || other.disabled) continue
      if (Math.abs(other.x - tower.x) > range) continue
      const curveY = fn(other.x)
      if (distance(tower.x, tower.y, other.x, curveY) > range) continue
      if (Math.abs(other.y - curveY) < zoneWidth * BUFF_ZONE_MULTIPLIER) {
        other.magicBuff = Math.max(other.magicBuff, buffAmount)
        recomputeEffectiveDamage(other, game.state)
      }
    }
  }

}
