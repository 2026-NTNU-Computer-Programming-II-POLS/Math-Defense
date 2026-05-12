import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { projectPetScene } from '@/engine/projections/project-pets'
import type { PetTrait } from '@/engine/projections/views'
import { drawOrbitRing, drawDiamondCrystal } from './primitives'

const TRAIT_COLORS: Record<PetTrait, string> = {
  slow:  '#60a5fa',
  fast:  '#facc15',
  heavy: '#ef4444',
  basic: '#a3a3a3',
}

export class PetRenderer {
  private _time = 0

  update(dt: number, _game: Game): void {
    this._time += dt
  }

  render(renderer: Renderer, game: Game): void {
    const view = projectPetScene(game)
    const { ctx } = renderer

    for (const pet of view.pets) {
      const px = gameToCanvasX(pet.x)
      const py = gameToCanvasY(pet.y)
      const color = TRAIT_COLORS[pet.trait]

      ctx.save()
      this._drawPet(ctx, px, py, color, pet.trait)

      if (pet.hpRatio !== null) {
        const barW = 12
        const barH = 2
        ctx.globalAlpha = 0.8
        ctx.fillStyle = '#333'
        ctx.fillRect(px - barW / 2, py + 8, barW, barH)
        ctx.fillStyle = '#4ade80'
        ctx.fillRect(px - barW / 2, py + 8, barW * pet.hpRatio, barH)
      }

      ctx.restore()
    }
  }

  private _drawPet(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    color: string,
    trait: PetTrait,
  ): void {
    const pulse = Math.sin(this._time * 5) * 0.5 + 0.5
    const bob = Math.sin(this._time * 4 + px * 0.05) * 1.2
    const y = py + bob

    this._drawAura(ctx, px, y, color, pulse)
    this._drawSatellites(ctx, px, y, color)

    switch (trait) {
      case 'slow':
        this._drawSlowPet(ctx, px, y, color)
        break
      case 'fast':
        this._drawFastPet(ctx, px, y, color)
        break
      case 'heavy':
        this._drawHeavyPet(ctx, px, y, color)
        break
      default:
        this._drawBasicPet(ctx, px, y, color)
        break
    }
  }

  private _drawAura(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    color: string,
    pulse: number,
  ): void {
    ctx.save()
    ctx.globalAlpha = 0.16 + pulse * 0.12
    const glow = ctx.createRadialGradient(px, py, 2, px, py, 15 + pulse * 2)
    glow.addColorStop(0, '#ffffff')
    glow.addColorStop(0.32, color)
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(px, py, 15 + pulse * 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private _drawSatellites(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    ctx.save()
    ctx.fillStyle = color
    ctx.strokeStyle = 'rgba(255,255,255,0.72)'
    ctx.lineWidth = 1
    for (let i = 0; i < 2; i++) {
      const a = this._time * 2.8 + i * Math.PI
      const sx = px + Math.cos(a) * 11
      const sy = py + Math.sin(a) * 4.5
      ctx.globalAlpha = 0.65
      ctx.beginPath()
      ctx.arc(sx, sy, 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }

  private _drawSlowPet(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    drawOrbitRing(ctx, px, py, 10, -0.55 + this._time * 0.9, color, 0.45, 1.4, 'cc')
    drawOrbitRing(ctx, px, py, 7,   0.85 + this._time * 0.9, color, 0.45, 1.4, 'cc')
    drawDiamondCrystal(ctx, px, py, 6, color, 0.8, '#172033', 0.3, '#e0f2fe', 1.2)
    this._drawRuneDot(ctx, px - 8, py - 3, color)
    this._drawRuneDot(ctx, px + 8, py + 3, color)
  }

  private _drawFastPet(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    ctx.strokeStyle = `${color}99`
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.moveTo(px - 15, py + 5)
    ctx.lineTo(px - 4, py + 1)
    ctx.moveTo(px - 14, py - 4)
    ctx.lineTo(px - 3, py - 1)
    ctx.moveTo(px - 10, py)
    ctx.lineTo(px - 1, py)
    ctx.stroke()

    ctx.fillStyle = color
    ctx.strokeStyle = '#fff8cf'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(px + 10, py)
    ctx.lineTo(px - 4, py - 8)
    ctx.lineTo(px - 1, py)
    ctx.lineTo(px - 4, py + 8)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  private _drawHeavyPet(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    drawOrbitRing(ctx, px, py, 10, 0.2 + this._time * 0.9, color, 0.45, 1.4, 'cc')
    ctx.fillStyle = '#241517'
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 3
      const x = px + Math.cos(a) * 8
      const y = py + Math.sin(a) * 8
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.strokeStyle = '#ffd7d7'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(px - 4, py)
    ctx.lineTo(px + 4, py)
    ctx.moveTo(px, py - 4)
    ctx.lineTo(px, py + 4)
    ctx.stroke()
  }

  private _drawBasicPet(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    drawOrbitRing(ctx, px, py, 9, 0.65 + this._time * 0.9, color, 0.45, 1.4, 'cc')
    ctx.fillStyle = color
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(px, py, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 0.75
    ctx.beginPath()
    ctx.arc(px - 2, py - 2, 1.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  private _drawRuneDot(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    ctx.fillStyle = color
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(px, py, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}
