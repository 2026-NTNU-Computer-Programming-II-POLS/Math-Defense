/**
 * ImpactEffectRenderer — short-lived spark particles painted at the point
 * of a defensively-modified hit (DAMAGE_RESOLVED). Sits on top of the
 * ProjectileRenderer in the z-order so sparks read as "this hit happened
 * just now" against the trail beneath them.
 *
 * Visual Redesign Phase 1. Only fires on DAMAGE_RESOLVED, which today
 * only emits on capped / evaded hits — i.e. the moments where a
 * defensive trait visibly changed the number. The per-hit white flash on
 * every connect is owned by `EnemyRenderer._drawHitFlash`; this layer is
 * the extra "something special happened" cue.
 */
import { Events, ANIM } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { seededUnit, seedFor } from '@/math/seededRandom'
import { EffectLayer, type Effect } from './effects/EffectLayer'
import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'

interface Spark extends Effect {
  /** Spawn-time canvas-space anchor. Sparks fly outward from here. */
  cx: number
  cy: number
  vx: number
  vy: number
  color: string
}

const SPARK_LIFETIME = 0.35
const PARTICLES_PER_HIT = 5
const SPEED_PX_PER_SEC = 110

export class ImpactEffectRenderer extends EffectLayer<Spark> {
  private _spawnSeq = 0

  init(game: Game): void {
    super.init(game)
    this.unsubs.push(
      game.eventBus.on(Events.DAMAGE_RESOLVED, (p) => {
        // `p.x/p.y` are game units; resolve to canvas-space once at spawn so
        // each draw frame stays cheap.
        const cx = gameToCanvasX(p.x)
        const cy = gameToCanvasY(p.y)
        // `kind` controls hue — matches the floating combat text palette
        // already shown by CombatFeedbackRenderer for the same event.
        const color = p.kind === 'capped' ? '#ffb86b' : '#9ad8ff'
        const seed = seedFor(`impact${this._spawnSeq++}`, p.x, p.y)
        for (let i = 0; i < PARTICLES_PER_HIT; i++) {
          const angle = seededUnit(seed, i) * Math.PI * 2
          const speed = SPEED_PX_PER_SEC * (0.55 + seededUnit(seed, i + 17) * 0.55)
          this.spawn({
            age: 0,
            maxAge: SPARK_LIFETIME,
            cx,
            cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color,
          })
        }
      }),
    )
  }

  render(renderer: Renderer, _game: Game): void {
    const { ctx } = renderer
    if (this.effects.length === 0) return
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    for (const s of this.effects) {
      const t = s.age / s.maxAge
      const alpha = (1 - t) * (1 - t)
      const x = s.cx + s.vx * s.age
      const y = s.cy + s.vy * s.age
      // Short tail behind each spark — draw a line opposite the velocity.
      ctx.globalAlpha = alpha
      ctx.strokeStyle = s.color
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - s.vx * 0.04, y - s.vy * 0.04)
      ctx.stroke()
    }
    ctx.restore()
  }
}
