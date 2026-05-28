/**
 * LimitBurstRenderer — paints the Limit tower's burst the moment it lands.
 *
 * Phase 6 Q8 surfaced the *charge* visual on the tower baseplate, but the
 * burst itself only manifested as a 5.5 px bloom on the asymptote point.
 * For a player watching the wider battlefield (or for a Limit tower placed
 * far from the camera) the burst was invisible — there was no AoE shockwave
 * out to the range edge, no per-enemy damage feedback, and no link between
 * the player's answer outcome and what just happened.
 *
 * This layer fixes all three by subscribing to LIMIT_BURST (emitted once per
 * burst by LimitTowerSystem) and painting:
 *
 *   1. A shockwave ring that expands from the tower out to its effective
 *      range, telling distant players "a burst happened here".
 *   2. A floating damage number above each enemy that was hit, so the
 *      player sees the actual landing damage (or "KILL" for the +∞
 *      instakill bypass).
 *   3. A tower-anchored result badge — "+∞ INSTAKILL", "+C ×3.0", "chip" —
 *      so the player can connect their answer outcome to its effect and
 *      learn the lookup table by playing.
 *
 * Coordinates are stored in world units and converted per-frame, matching
 * CombatFeedbackRenderer's convention.
 */
import { Events, UNIT_PX } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { clipToBoard } from '@/engine/render-helpers/clip-to-board'
import { EffectLayer, type Effect } from './effects/EffectLayer'
import type { Game, LimitBurstPayload } from '@/engine/Game'
import type { Renderer } from '@/engine/Renderer'

interface Shockwave extends Effect {
  kind: 'shockwave'
  x: number
  y: number
  range: number
  color: string
}

interface HitPopup extends Effect {
  kind: 'hit'
  x: number
  y: number
  text: string
  killed: boolean
}

interface Badge extends Effect {
  kind: 'badge'
  x: number
  y: number
  text: string
  tone: 'kill' | 'bonus' | 'chip'
}

type LimitEffect = Shockwave | HitPopup | Badge

const SHOCKWAVE_LIFETIME = 0.55
const HIT_LIFETIME = 0.7
const BADGE_LIFETIME = 0.9
const HIT_RISE_PX = 22
const BADGE_RISE_PX = 28

const KILL_COLOR = '#ff7a4d'
const BONUS_COLOR = '#7adcff'
const CHIP_COLOR = '#b6b6b6'

export class LimitBurstRenderer extends EffectLayer<LimitEffect> {
  init(game: Game): void {
    super.init(game)
    this.unsubs.push(
      game.eventBus.on(Events.LIMIT_BURST, (p: LimitBurstPayload) => this._onBurst(p)),
    )
  }

  private _onBurst(p: LimitBurstPayload): void {
    this.spawn({ kind: 'shockwave', age: 0, maxAge: SHOCKWAVE_LIFETIME, x: p.x, y: p.y, range: p.range, color: p.color })

    for (const h of p.hits) {
      const text = h.killed ? 'KILL' : `${Math.round(h.damage)}`
      this.spawn({ kind: 'hit', age: 0, maxAge: HIT_LIFETIME, x: h.x, y: h.y, text, killed: h.killed })
    }

    const { text, tone } = formatResultBadge(p)
    this.spawn({ kind: 'badge', age: 0, maxAge: BADGE_LIFETIME, x: p.x, y: p.y, text, tone })
  }

  render(renderer: Renderer, _game: Game): void {
    if (this.effects.length === 0) return
    const { ctx } = renderer
    // Shockwave radii scale by `range × UNIT_PX`, so a LIMIT tower placed
    // near the grid border emits a ring that crosses the board edge. Clip
    // only the ring — hit popups and result badges are floating text that
    // ride above enemy / tower positions and need to remain visible even
    // when they drift past the board's painted extent.
    for (const e of this.effects) {
      if (e.kind === 'shockwave') {
        ctx.save()
        clipToBoard(ctx)
        this._drawShockwave(ctx, e)
        ctx.restore()
      } else if (e.kind === 'hit') {
        this._drawHit(ctx, e)
      } else {
        this._drawBadge(ctx, e)
      }
    }
  }

  private _drawShockwave(ctx: CanvasRenderingContext2D, e: Shockwave): void {
    const t = e.age / e.maxAge
    // Ease-out so the wave looks like it loses energy as it expands; matches
    // how players intuit a shock front (fast initial expansion, then settles).
    const eased = 1 - (1 - t) * (1 - t)
    const cx = gameToCanvasX(e.x)
    const cy = gameToCanvasY(e.y)
    const rPx = eased * e.range * UNIT_PX
    const alpha = (1 - t) * 0.75
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = e.color
    ctx.globalAlpha = alpha
    ctx.lineWidth = 2.4 + (1 - t) * 1.6
    ctx.beginPath()
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  private _drawHit(ctx: CanvasRenderingContext2D, e: HitPopup): void {
    const t = e.age / e.maxAge
    const cx = gameToCanvasX(e.x)
    const cy = gameToCanvasY(e.y) - t * HIT_RISE_PX
    ctx.save()
    ctx.globalAlpha = 1 - t
    ctx.font = e.killed ? 'bold 14px sans-serif' : 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'
    ctx.fillStyle = e.killed ? KILL_COLOR : '#ffffff'
    ctx.strokeText(e.text, cx, cy)
    ctx.fillText(e.text, cx, cy)
    ctx.restore()
  }

  private _drawBadge(ctx: CanvasRenderingContext2D, e: Badge): void {
    const t = e.age / e.maxAge
    const cx = gameToCanvasX(e.x)
    const cy = gameToCanvasY(e.y) - 22 - t * BADGE_RISE_PX
    const color = e.tone === 'kill' ? KILL_COLOR : e.tone === 'bonus' ? BONUS_COLOR : CHIP_COLOR
    ctx.save()
    ctx.globalAlpha = 1 - t
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.fillStyle = color
    ctx.strokeText(e.text, cx, cy)
    ctx.fillText(e.text, cx, cy)
    ctx.restore()
  }
}

function formatResultBadge(p: LimitBurstPayload): { text: string; tone: 'kill' | 'bonus' | 'chip' } {
  switch (p.outcome) {
    case '+inf':    return { text: '+∞ INSTAKILL',                       tone: 'kill' }
    // The dmg scales with |answer|, so showing |C| is the most actionable
    // hint for "the bigger your positive constant, the harder it hits".
    case '+c':      return { text: `+C ×${Math.abs(p.answerValue)}`,     tone: 'bonus' }
    case 'zero':    return { text: '0 → chip',                           tone: 'chip' }
    case 'constant':return { text: 'C → chip',                           tone: 'chip' }
    case '-c':      return { text: '−C → chip',                          tone: 'chip' }
    case '-inf':    return { text: '−∞ → chip',                          tone: 'chip' }
  }
}
