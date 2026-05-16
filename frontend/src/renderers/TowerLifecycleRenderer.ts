/**
 * TowerLifecycleRenderer — paints place / upgrade celebrations.
 *
 * Visual Redesign Phase 3. Two events feed the same effect list:
 *
 *   - TOWER_PLACED → a single "land" ring expands outward from the tower
 *     centre and fades over ANIM.PLACEMENT_POP. Tower color tints the ring;
 *     a soft white core flash sells the impact.
 *   - TOWER_UPGRADED → a vertical light pillar rises from the baseplate plus
 *     a radial colored burst; a rune ring sweeps once around the tower over
 *     ANIM.UPGRADE_BURST. TOWER_UPGRADED's payload is `{ towerId }`, so the
 *     listener resolves the live tower position from `game.towers` at the
 *     instant the event fires — towers cannot move, so caching that snapshot
 *     in the effect record is correct for the lifetime of the burst.
 *
 * Pause-safe: ages advance through the EffectLayer base from engine dt.
 * Determinism: rune-ring glyph order is fixed, not seeded, so no RNG calls.
 */
import { Events, ANIM } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { prefersReducedMotion } from '@/utils/reducedMotion'
import { EffectLayer, type Effect } from './effects/EffectLayer'
import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import type { Tower } from '@/entities/types'

type LifecycleKind = 'land' | 'upgrade'

interface LifecycleFx extends Effect {
  kind: LifecycleKind
  cx: number
  cy: number
  color: string
}

const LAND_LIFETIME = ANIM.PLACEMENT_POP
const UPGRADE_LIFETIME = ANIM.UPGRADE_BURST
const LAND_MAX_RADIUS = 30
const UPGRADE_BURST_RADIUS = 36
const UPGRADE_PILLAR_HEIGHT = 44
const UPGRADE_RUNES = ['+', '−', '×', '÷', '∫', '∑', '∂', 'π']

export class TowerLifecycleRenderer extends EffectLayer<LifecycleFx> {
  init(game: Game): void {
    super.init(game)
    this.unsubs.push(
      game.eventBus.on(Events.TOWER_PLACED, (tower: Tower) => {
        this.spawn({
          kind: 'land',
          age: 0,
          maxAge: LAND_LIFETIME,
          cx: gameToCanvasX(tower.x),
          cy: gameToCanvasY(tower.y),
          color: tower.color,
        })
      }),
      game.eventBus.on(Events.TOWER_UPGRADED, ({ towerId }: { towerId: string }) => {
        const tower = game.towers.find((t) => t.id === towerId)
        if (!tower) return
        this.spawn({
          kind: 'upgrade',
          age: 0,
          maxAge: UPGRADE_LIFETIME,
          cx: gameToCanvasX(tower.x),
          cy: gameToCanvasY(tower.y),
          color: tower.color,
        })
      }),
    )
  }

  render(renderer: Renderer, _game: Game): void {
    const { ctx } = renderer
    if (this.effects.length === 0) return
    const reduced = prefersReducedMotion()
    ctx.save()
    for (const e of this.effects) {
      const t = Math.min(1, e.age / e.maxAge)
      if (e.kind === 'land') this._drawLand(ctx, e, t, reduced)
      else this._drawUpgrade(ctx, e, t, reduced)
    }
    ctx.restore()
  }

  private _drawLand(ctx: CanvasRenderingContext2D, e: LifecycleFx, t: number, reduced: boolean): void {
    // Reduced-motion: collapse the expanding ring to a static colored flash
    // so a tower placement still registers without animating geometry.
    const r = reduced ? 18 : 8 + LAND_MAX_RADIUS * t
    const alpha = (1 - t) * (1 - t)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    if (!reduced) {
      ctx.strokeStyle = e.color
      ctx.lineWidth = Math.max(1, 3 * (1 - t))
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(e.cx, e.cy, r, 0, Math.PI * 2)
      ctx.stroke()
    }

    const core = ctx.createRadialGradient(e.cx, e.cy, 0, e.cx, e.cy, 18)
    core.addColorStop(0, `rgba(255,255,255,${0.55 * (1 - t)})`)
    core.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.globalAlpha = 1
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(e.cx, e.cy, 18, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private _drawUpgrade(ctx: CanvasRenderingContext2D, e: LifecycleFx, t: number, reduced: boolean): void {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    // Reduced-motion: drop the rising pillar + rune-ring sweep and paint a
    // single static colored flash sized to the baseplate. Burst ring is
    // retained but at a fixed radius (no expansion).
    if (reduced) {
      const alpha = (1 - t) * (1 - t) * 0.9
      ctx.globalAlpha = alpha
      ctx.fillStyle = e.color
      ctx.beginPath()
      ctx.arc(e.cx, e.cy, 22, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      return
    }

    // Vertical pillar: rises in the first half, fades through the second.
    const pillarRise = Math.min(1, t / 0.5)
    const pillarFade = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5
    const pillarHeight = UPGRADE_PILLAR_HEIGHT * pillarRise
    const pillarGrad = ctx.createLinearGradient(e.cx, e.cy, e.cx, e.cy - pillarHeight)
    pillarGrad.addColorStop(0, `${e.color}00`)
    pillarGrad.addColorStop(0.4, `${e.color}cc`)
    pillarGrad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = pillarGrad
    ctx.globalAlpha = pillarFade * 0.85
    ctx.beginPath()
    ctx.ellipse(e.cx, e.cy - pillarHeight / 2, 6, pillarHeight / 2, 0, 0, Math.PI * 2)
    ctx.fill()

    // Radial burst — short colored shockwave.
    const burstR = UPGRADE_BURST_RADIUS * t
    const burstAlpha = (1 - t) * (1 - t)
    ctx.strokeStyle = e.color
    ctx.lineWidth = Math.max(1, 2.6 * (1 - t))
    ctx.globalAlpha = burstAlpha
    ctx.beginPath()
    ctx.arc(e.cx, e.cy, burstR, 0, Math.PI * 2)
    ctx.stroke()

    // Rune ring sweep — one revolution over the lifetime, fading on the back half.
    const ringR = 24
    const sweep = t * Math.PI * 2
    const runeFade = 1 - t
    ctx.globalAlpha = runeFade * 0.9
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = e.color
    ctx.lineWidth = 1.2
    ctx.font = 'bold 9px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < UPGRADE_RUNES.length; i++) {
      const a = sweep + (i / UPGRADE_RUNES.length) * Math.PI * 2
      const rx = e.cx + Math.cos(a) * ringR
      const ry = e.cy + Math.sin(a) * ringR
      ctx.strokeText(UPGRADE_RUNES[i], rx, ry)
      ctx.fillText(UPGRADE_RUNES[i], rx, ry)
    }

    ctx.restore()
  }
}
