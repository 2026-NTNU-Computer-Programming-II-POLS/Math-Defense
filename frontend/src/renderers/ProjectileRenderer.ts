/**
 * ProjectileRenderer — paints each in-flight projectile as a fading trail
 * plus a tinted body. The variant differs by owning tower type so a
 * Radar-C "sniper" round reads as an elongated streak rather than the
 * same ball as a Radar-B "rapid" round.
 *
 * Visual Redesign Phase 1. Trail data is the `proj.history` buffer
 * populated by `CombatSystem._tickProjectiles`; we only read it.
 */
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { TowerType } from '@/data/constants'
import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import type { Projectile } from '@/entities/types'

export class ProjectileRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    const { ctx } = renderer
    for (const proj of game.projectiles) {
      if (!proj.active) continue
      const variant = this._variantFor(proj, game)
      this._drawTrail(ctx, proj, variant)
      this._drawBody(ctx, proj, variant)
    }
  }

  private _variantFor(proj: Projectile, game: Game): ProjectileVariant {
    const owner = game.towers.find((t) => t.id === proj.ownerId)
    if (!owner) return 'default'
    if (owner.type === TowerType.RADAR_C) return 'sniper'
    if (owner.type === TowerType.RADAR_B) return 'rapid'
    if (owner.type === TowerType.MAGIC)   return 'magic'
    return 'default'
  }

  /** Linearly fade old samples toward zero alpha. Sniper uses an elongated
   *  ribbon between successive samples; others use discrete circles. */
  private _drawTrail(ctx: CanvasRenderingContext2D, proj: Projectile, variant: ProjectileVariant): void {
    const samples = proj.history
    if (samples.length < 2) return
    const tipX = gameToCanvasX(proj.x)
    const tipY = gameToCanvasY(proj.y)

    ctx.save()
    if (variant === 'sniper') {
      // Streak: stroke a single tapered polyline from oldest sample to tip.
      ctx.lineCap = 'round'
      ctx.strokeStyle = proj.color
      for (let i = 0; i < samples.length - 1; i++) {
        const t = (i + 1) / samples.length
        ctx.globalAlpha = t * t * 0.85
        ctx.lineWidth = 1 + t * 2.2
        const a = samples[i]
        const b = samples[i + 1]
        ctx.beginPath()
        ctx.moveTo(gameToCanvasX(a.x), gameToCanvasY(a.y))
        ctx.lineTo(gameToCanvasX(b.x), gameToCanvasY(b.y))
        ctx.stroke()
      }
      // Final segment to the live tip.
      const last = samples[samples.length - 1]
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(gameToCanvasX(last.x), gameToCanvasY(last.y))
      ctx.lineTo(tipX, tipY)
      ctx.stroke()
    } else {
      // Discrete fading dots — cheaper, reads as a comet tail.
      ctx.fillStyle = proj.color
      const baseRadius = variant === 'magic' ? 2.6 : 2.0
      for (let i = 0; i < samples.length; i++) {
        const t = (i + 1) / samples.length
        ctx.globalAlpha = t * t * 0.7
        const s = samples[i]
        ctx.beginPath()
        ctx.arc(gameToCanvasX(s.x), gameToCanvasY(s.y), baseRadius * t, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  private _drawBody(ctx: CanvasRenderingContext2D, proj: Projectile, variant: ProjectileVariant): void {
    const px = gameToCanvasX(proj.x)
    const py = gameToCanvasY(proj.y)
    const radius = variant === 'sniper' ? 2.2 : variant === 'magic' ? 4.5 : 3.5

    // Tinted radial halo around the live tip.
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const halo = ctx.createRadialGradient(px, py, 0, px, py, radius * 2.6)
    halo.addColorStop(0, hexToRgba(proj.color, 0.9))
    halo.addColorStop(0.4, hexToRgba(proj.color, 0.45))
    halo.addColorStop(1, hexToRgba(proj.color, 0))
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(px, py, radius * 2.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Magic variant: four-pointed spark over the body.
    if (variant === 'magic') {
      ctx.save()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.2
      ctx.globalAlpha = 0.85
      const spike = radius * 1.8
      ctx.beginPath()
      ctx.moveTo(px - spike, py); ctx.lineTo(px + spike, py)
      ctx.moveTo(px, py - spike); ctx.lineTo(px, py + spike)
      ctx.stroke()
      ctx.restore()
    }

    // Solid bright core.
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(px, py, Math.max(1, radius * 0.45), 0, Math.PI * 2)
    ctx.fill()

    // Ringed coloured shell.
    ctx.strokeStyle = proj.color
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.stroke()
  }
}

type ProjectileVariant = 'default' | 'rapid' | 'sniper' | 'magic'

/** Lightweight `#rrggbb` → `rgba()` for the radial-gradient stops. Accepts
 *  the existing tower-color literals (always 6-digit hex). */
function hexToRgba(hex: string, alpha: number): string {
  // Trim a leading '#' if present; tolerate already-rgba inputs.
  if (hex.startsWith('rgba') || hex.startsWith('rgb(')) return hex
  const h = hex.replace('#', '')
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

