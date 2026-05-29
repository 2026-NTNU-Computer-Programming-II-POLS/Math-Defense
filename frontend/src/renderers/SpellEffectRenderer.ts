/**
 * SpellEffectRenderer — glyph-centred spell VFX.
 *
 * Visual Redesign Spell Re-skin (Phase 1, Option A): each spell paints a
 * math-symbol body (eˣ / →0 / δ / dv/dt) on top of its own resolve
 * geometry, with a gold-only chromatic fringe so spells read as the
 * "player action" category — distinct from enemy (cyan/magenta) and pet
 * (cyan-only) glyph bodies.
 *
 * Determinism: any per-cast jitter (e.g. lightning's bolt path) routes
 * through seededUnit(seedFor(...)) so replays reproduce frame-for-frame.
 *
 * Reduced motion (Phase 2): each spell drops its motion-intensive branch
 * (shockwave rings / collapsing contours / chromatic split / drift) and
 * keeps the glyph + a static colour bloom. Identity silhouettes never
 * disappear under reduced motion — see Math_Defense_Spec.md §4.1.
 */
import { Events, UNIT_PX } from '@/data/constants'
import { SPELL_MAP } from '@/data/spell-defs'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { seededUnit, seedFor } from '@/math/seededRandom'
import { prefersReducedMotion } from '@/utils/reducedMotion'
import { EffectLayer, type Effect } from './effects/EffectLayer'
import { drawGlyphBody } from './primitives'
import type { Game } from '@/engine/Game'
import type { Renderer } from '@/engine/Renderer'

const TAU = Math.PI * 2

// Gold-only fringe for the "player action" signal — distinct from the
// hostile (cyan/magenta) and allied (cyan-only) palettes used elsewhere.
const SPELL_FRINGE: readonly [string, string] = ['#ffd700', '#c47206']

interface SpellVfx extends Effect {
  spellId: string
  x: number
  y: number
  radius: number
  color: string
  seed: number
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function easeOutQuart(t: number): number {
  const u = clamp01(t)
  return 1 - (1 - u) ** 4
}

function easeInOut(t: number): number {
  const u = clamp01(t)
  return u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2
}

export class SpellEffectRenderer extends EffectLayer<SpellVfx> {
  init(game: Game): void {
    super.init(game)
    this.unsubs.push(
      game.eventBus.on(Events.SPELL_EFFECT, ({ spellId, x, y, radius }) => {
        const def = SPELL_MAP.get(spellId)
        this.spawn({
          spellId,
          x,
          y,
          radius: radius ?? 2,
          age: 0,
          maxAge: def?.vfxDuration ?? 0.65,
          color: def?.color ?? '#ffffff',
          seed: seedFor(spellId, x, y),
        })
      }),
    )
  }

  render(renderer: Renderer, _game: Game): void {
    const ctx = renderer.ctx
    const reduced = prefersReducedMotion()
    for (const vfx of this.effects) {
      if (vfx.spellId === 'fireball') this._drawExponential(ctx, vfx, reduced)
      else if (vfx.spellId === 'slow') this._drawAsymptote(ctx, vfx, reduced)
      else if (vfx.spellId === 'lightning') this._drawImpulse(ctx, vfx, reduced)
      else if (vfx.spellId === 'haste') this._drawAcceleration(ctx, vfx, reduced)
      else this._drawFallback(ctx, vfx)
    }
  }

  // ── Exponential: eˣ glyph rising from cast point with an outward shockwave.
  private _drawExponential(ctx: CanvasRenderingContext2D, vfx: SpellVfx, reduced: boolean): void {
    const p = clamp01(vfx.age / vfx.maxAge)
    const out = easeOutQuart(p)
    const alpha = 1 - p
    const px = gameToCanvasX(vfx.x)
    const py = gameToCanvasY(vfx.y)
    const baseR = Math.max(UNIT_PX * 0.9, vfx.radius * UNIT_PX)
    // Reduced motion holds the glyph at its full size from frame 1 so there
    // is no scale animation; the identity silhouette stays static.
    const glyphSize = reduced ? UNIT_PX * 1.25 : UNIT_PX * (0.9 + out * 0.55)
    const rise = reduced ? 0 : UNIT_PX * 0.35 * out

    ctx.save()
    // Heat bloom under the glyph — kept under reduced motion as the static
    // colour flash the §4.1 contract calls for.
    const bloomR = reduced ? baseR * 0.95 : baseR * (0.3 + out * 1.05)
    const bloom = ctx.createRadialGradient(px, py, 0, px, py, bloomR)
    bloom.addColorStop(0, `rgba(255, 230, 140, ${0.42 * alpha})`)
    bloom.addColorStop(0.55, `rgba(255, 138, 60, ${0.22 * alpha})`)
    bloom.addColorStop(1, 'rgba(60, 16, 6, 0)')
    ctx.fillStyle = bloom
    ctx.beginPath()
    ctx.arc(px, py, bloomR, 0, TAU)
    ctx.fill()

    if (!reduced) {
      // Shockwave rings expanding outward; damage frame at p≈0.3.
      const ignition = Math.max(0, 1 - Math.abs(p - 0.3) * 3.2)
      for (let i = 0; i < 3; i++) {
        const r = baseR * (0.4 + out * (0.7 + i * 0.18))
        ctx.strokeStyle = i === 0
          ? `rgba(255, 222, 130, ${0.55 * alpha})`
          : `rgba(255, 138, 60, ${0.28 * alpha})`
        ctx.lineWidth = 1.4 + ignition * (3 - i)
        ctx.beginPath()
        ctx.arc(px, py, r, 0, TAU)
        ctx.stroke()
      }
    }

    // Glyph body — rises slightly from the cast point.
    ctx.globalAlpha = 0.4 + alpha * 0.6
    drawGlyphBody(ctx, px, py - rise, glyphSize, 'eˣ', vfx.color, {
      fringeColors: SPELL_FRINGE,
      fringeOffset: glyphSize * 0.08,
    })
    ctx.restore()
  }

  // ── Asymptote: →0 glyph with concentric rings collapsing inward.
  private _drawAsymptote(ctx: CanvasRenderingContext2D, vfx: SpellVfx, reduced: boolean): void {
    const p = clamp01(vfx.age / vfx.maxAge)
    const inward = easeInOut(p)
    const alpha = 1 - p * 0.85
    const px = gameToCanvasX(vfx.x)
    const py = gameToCanvasY(vfx.y)
    const baseR = Math.max(UNIT_PX * 1.2, vfx.radius * UNIT_PX)
    const glyphSize = UNIT_PX * 0.95

    ctx.save()
    // Cold bloom centred on cast point.
    const bloom = ctx.createRadialGradient(px, py, 0, px, py, baseR)
    bloom.addColorStop(0, `rgba(220, 248, 255, ${0.42 * alpha})`)
    bloom.addColorStop(0.6, `rgba(96, 192, 255, ${0.18 * alpha})`)
    bloom.addColorStop(1, 'rgba(20, 60, 110, 0)')
    ctx.fillStyle = bloom
    ctx.beginPath()
    ctx.arc(px, py, baseR, 0, TAU)
    ctx.fill()

    if (!reduced) {
      // Four contour rings collapsing inward toward zero — the load-bearing
      // motion that distinguishes this spell from the Regenerator's static
      // `lim` glyph. Reduced motion drops this; the `→0` glyph itself (no
      // `lim`) already reads distinct from the enemy (Spell_Reskin_Plan §2.4).
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (let i = 0; i < 4; i++) {
        const startR = baseR * (0.45 + i * 0.18)
        const r = startR * (1 - inward * 0.88)
        if (r < 2) continue
        ctx.strokeStyle = i % 2 === 0
          ? `rgba(230, 252, 255, ${0.48 * alpha})`
          : `rgba(108, 208, 255, ${0.36 * alpha})`
        ctx.lineWidth = 1.4 + (1 - inward) * 1.4
        ctx.setLineDash([r * 0.12, r * 0.06])
        ctx.beginPath()
        ctx.arc(px, py, r, p * (1.4 + i * 0.25), TAU - i * 0.32)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }

    // Glyph body — `→0` shows the arrow + target so the operator motivation
    // (speed driven asymptotically to zero) is legible even if the
    // contour-collapse animation is pruned by reduced motion (Phase 2).
    ctx.globalAlpha = 0.45 + alpha * 0.55
    drawGlyphBody(ctx, px, py, glyphSize, '→0', vfx.color, {
      fringeColors: SPELL_FRINGE,
      fringeOffset: glyphSize * 0.06,
    })
    ctx.restore()
  }

  // ── Impulse: δ glyph at the target with a chromatic vertical bolt.
  private _drawImpulse(ctx: CanvasRenderingContext2D, vfx: SpellVfx, reduced: boolean): void {
    const p = clamp01(vfx.age / vfx.maxAge)
    const flash = 1 - easeInOut(p)
    const alpha = 1 - p
    const px = gameToCanvasX(vfx.x)
    const py = gameToCanvasY(vfx.y)
    const span = Math.max(UNIT_PX * 2.1, vfx.radius * UNIT_PX * 1.2)
    const topY = py - span * 1.6
    const glyphSize = UNIT_PX * 1.1

    ctx.save()
    // Vertical polyline from above to the target. Reduced motion drops the
    // chromatic gold/amber split passes and renders a single white core.
    const path = this._buildBoltPath(px, topY, py, span, vfx.seed)
    if (!reduced) {
      this._strokeBolt(ctx, path, -span * 0.06, 0, 4.6, `rgba(255, 215, 0, ${0.55 * alpha})`)
      this._strokeBolt(ctx, path, span * 0.06, 0, 4.6, `rgba(196, 114, 6, ${0.45 * alpha})`)
    }
    this._strokeBolt(ctx, path, 0, 0, reduced ? 3.2 : 1.8, `rgba(255, 255, 230, ${0.95 * alpha})`)

    // Impact flash under the glyph — peaks at half-life.
    const flashR = span * 0.32
    const glow = ctx.createRadialGradient(px, py, 0, px, py, flashR)
    glow.addColorStop(0, `rgba(255, 255, 220, ${0.85 * flash})`)
    glow.addColorStop(0.5, `rgba(255, 215, 0, ${0.4 * flash})`)
    glow.addColorStop(1, 'rgba(40, 28, 6, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(px, py, flashR, 0, TAU)
    ctx.fill()

    // δ glyph at the strike point.
    ctx.globalAlpha = 0.55 + alpha * 0.45
    drawGlyphBody(ctx, px, py, glyphSize, 'δ', vfx.color, {
      fringeColors: SPELL_FRINGE,
      fringeOffset: glyphSize * 0.09,
    })
    ctx.restore()
  }

  // ── Acceleration: dv/dt glyph drifting upward above the cast point.
  private _drawAcceleration(ctx: CanvasRenderingContext2D, vfx: SpellVfx, reduced: boolean): void {
    const p = clamp01(vfx.age / vfx.maxAge)
    const out = easeOutQuart(p)
    const alpha = 1 - p
    const px = gameToCanvasX(vfx.x)
    const py = gameToCanvasY(vfx.y)
    const baseR = Math.max(UNIT_PX * 1.4, vfx.radius * UNIT_PX)
    // Reduced motion: hold the glyph static (no drift / no scale-in pulse).
    const glyphSize = reduced ? UNIT_PX * 1.0 : UNIT_PX * (0.85 + out * 0.2)
    const drift = reduced ? 0 : UNIT_PX * 0.55 * out

    ctx.save()
    // Soft halo aura — kept under reduced motion as the static buff field.
    const aura = ctx.createRadialGradient(px, py, 0, px, py, baseR)
    aura.addColorStop(0, `rgba(255, 246, 196, ${0.4 * alpha})`)
    aura.addColorStop(0.55, `rgba(124, 247, 181, ${0.22 * alpha})`)
    aura.addColorStop(1, 'rgba(40, 90, 50, 0)')
    ctx.fillStyle = aura
    ctx.beginPath()
    ctx.arc(px, py, baseR, 0, TAU)
    ctx.fill()

    if (!reduced) {
      // Speed lines under the glyph — six short strokes radiating outward.
      ctx.lineCap = 'round'
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + p * 1.2
        const inner = baseR * 0.42
        const outer = baseR * (0.62 + out * 0.18)
        ctx.strokeStyle = i % 2 === 0
          ? `rgba(255, 224, 112, ${0.42 * alpha})`
          : `rgba(124, 247, 181, ${0.42 * alpha})`
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.moveTo(px + Math.cos(a) * inner, py + Math.sin(a) * inner)
        ctx.lineTo(px + Math.cos(a) * outer, py + Math.sin(a) * outer)
        ctx.stroke()
      }
    }

    // dv/dt glyph drifts upward.
    ctx.globalAlpha = 0.5 + alpha * 0.5
    drawGlyphBody(ctx, px, py - drift, glyphSize, 'dv/dt', vfx.color, {
      fringeColors: SPELL_FRINGE,
      fringeOffset: glyphSize * 0.08,
    })
    ctx.restore()
  }

  private _drawFallback(ctx: CanvasRenderingContext2D, vfx: SpellVfx): void {
    const p = clamp01(vfx.age / vfx.maxAge)
    const alpha = 1 - p
    const px = gameToCanvasX(vfx.x)
    const py = gameToCanvasY(vfx.y)
    ctx.save()
    ctx.globalAlpha = alpha * 0.6
    ctx.fillStyle = vfx.color
    ctx.beginPath()
    ctx.arc(px, py, UNIT_PX * 0.6, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  private _buildBoltPath(
    px: number,
    topY: number,
    bottomY: number,
    span: number,
    seed: number,
  ): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = []
    const segments = 8
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const taper = Math.sin(t * Math.PI)
      const jitter = (seededUnit(seed, i + 11) - 0.5) * span * 0.32 * taper
      points.push({
        x: px + jitter,
        y: topY + (bottomY - topY) * t,
      })
    }
    return points
  }

  private _strokeBolt(
    ctx: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    dx: number,
    dy: number,
    width: number,
    stroke: string,
  ): void {
    if (points.length < 2) return
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = width
    ctx.strokeStyle = stroke
    ctx.beginPath()
    ctx.moveTo(points[0].x + dx, points[0].y + dy)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x + dx, points[i].y + dy)
    }
    ctx.stroke()
    ctx.restore()
  }
}
