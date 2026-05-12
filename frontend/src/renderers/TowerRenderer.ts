/**
 * TowerRenderer — paints towers from a TowerSceneView snapshot (F-ARCH-4).
 * Never reads Tower entity fields directly; engine/projections/project-towers.ts
 * owns that surface.
 */
import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { TowerType, UNIT_PX } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { projectTowerScene } from '@/engine/projections/project-towers'
import type { TowerSceneView, TowerView } from '@/engine/projections/views'

const TOWER_RADIUS = 14
const BASE_DARK = '#17131d'
const BASE_MID = '#242031'
const HIGHLIGHT = 'rgba(255,255,255,0.82)'

export class TowerRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    const view = projectTowerScene(game)
    this._drawCursor(renderer, view)
    for (const t of view.towers) this._drawTower(renderer, view, t)
  }

  private _drawCursor(renderer: Renderer, view: TowerSceneView): void {
    // §19: keyboard focus cursor (WCAG 2.4.7). Drawn before towers so an
    // existing tower at the focused cell renders on top — the ring still
    // surrounds it. Only visible during BUILD per §19.4 (cursor invisible
    // during WAVE phase). Cleared by useKeyboardPlacement on phase exit.
    if (!view.showCoords || view.cursor === null) return
    const { ctx } = renderer
    const px = gameToCanvasX(view.cursor.gx)
    const py = gameToCanvasY(view.cursor.gy)
    const radius = UNIT_PX * 0.55

    ctx.save()
    // Dark outer halo gives the gold ring contrast against any tile fill,
    // satisfying the 3:1 focus-indicator contrast requirement of SC 1.4.11.
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.stroke()

    ctx.lineWidth = 2
    ctx.strokeStyle = '#ffd700'
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  private _drawTower(renderer: Renderer, view: TowerSceneView, tower: TowerView): void {
    const { ctx } = renderer
    const px = gameToCanvasX(tower.x)
    const py = gameToCanvasY(tower.y)
    const alpha = tower.disabled ? 0.35 : 1.0

    ctx.save()
    ctx.globalAlpha = alpha

    this._drawShadow(ctx, px, py)
    this._drawConfiguredGlow(ctx, px, py, tower)
    this._drawTowerBody(ctx, px, py, tower)
    this._drawGlyph(ctx, px, py, tower)

    if (tower.disabled) {
      this._drawDisabledMark(ctx, px, py)
    }

    ctx.restore()

    if (view.showCoords) {
      ctx.fillStyle = 'rgba(212,168,64,0.7)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(`(${tower.x},${tower.y})`, px, py - 18)
    }
  }

  private _drawShadow(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.38)'
    ctx.beginPath()
    ctx.ellipse(px, py + 7, 18, 7, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  private _drawConfiguredGlow(ctx: CanvasRenderingContext2D, px: number, py: number, tower: TowerView): void {
    if (!tower.configured) return
    ctx.save()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.globalAlpha *= 0.65
    ctx.beginPath()
    ctx.arc(px, py, 17, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = `${tower.color}99`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(px, py, 20, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  private _drawTowerBody(ctx: CanvasRenderingContext2D, px: number, py: number, tower: TowerView): void {
    this._drawBasePlate(ctx, px, py, tower.color)

    switch (tower.type) {
      case TowerType.MAGIC:
        this._drawMagicTower(ctx, px, py, tower.color)
        break
      case TowerType.RADAR_A:
        this._drawSweepRadar(ctx, px, py, tower.color)
        break
      case TowerType.RADAR_B:
        this._drawRapidRadar(ctx, px, py, tower.color)
        break
      case TowerType.RADAR_C:
        this._drawSniperRadar(ctx, px, py, tower.color)
        break
      case TowerType.MATRIX:
        this._drawMatrixTower(ctx, px, py, tower.color)
        break
      case TowerType.LIMIT:
        this._drawLimitTower(ctx, px, py, tower.color)
        break
      case TowerType.CALCULUS:
        this._drawCalculusTower(ctx, px, py, tower.color)
        break
    }
  }

  private _drawBasePlate(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    ctx.fillStyle = BASE_MID
    ctx.strokeStyle = `${color}cc`
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 8 + i * Math.PI / 4
      const x = px + Math.cos(a) * TOWER_RADIUS
      const y = py + Math.sin(a) * TOWER_RADIUS
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(px, py, 9.5, 0, Math.PI * 2)
    ctx.stroke()
  }

  private _drawMagicTower(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    this._drawOrbit(ctx, px, py, 11, -0.45, color)
    this._drawSpark(ctx, px - 8, py - 5, 2.5, color)
    this._drawSpark(ctx, px + 8, py + 4, 2, color)
    this._drawCrystal(ctx, px, py - 2, 8, color, true)
  }

  private _drawSweepRadar(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    this._drawDish(ctx, px, py, color)
    ctx.fillStyle = `${color}66`
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.arc(px, py, 12, -0.95, 0.35)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = HIGHLIGHT
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(px, py, 8, -0.95, 0.35)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(px, py, 12, -0.95, 0.35)
    ctx.stroke()
  }

  private _drawRapidRadar(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    ctx.fillStyle = BASE_DARK
    ctx.strokeStyle = color
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.roundRect(px - 9, py - 7, 14, 14, 4)
    ctx.fill()
    ctx.stroke()
    this._drawBarrel(ctx, px + 1, py - 4, 15, -0.22, color, 4)
    this._drawBarrel(ctx, px + 1, py + 4, 15, 0.22, color, 4)
    this._drawNode(ctx, px - 4, py, color, 3.5)
  }

  private _drawSniperRadar(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    this._drawBarrel(ctx, px - 1, py, 20, -0.28, color, 6)
    ctx.fillStyle = color
    ctx.strokeStyle = HIGHLIGHT
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.arc(px - 2, py, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    ctx.strokeStyle = HIGHLIGHT
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(px - 10, py + 8)
    ctx.lineTo(px + 10, py - 8)
    ctx.moveTo(px - 5, py - 9)
    ctx.lineTo(px + 5, py + 9)
    ctx.stroke()
  }

  private _drawMatrixTower(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    ctx.fillStyle = BASE_DARK
    ctx.strokeStyle = `${color}ee`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(px - 10, py - 10, 20, 20, 3)
    ctx.fill()
    ctx.stroke()

    ctx.strokeStyle = 'rgba(255,255,255,0.58)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px, py - 10)
    ctx.lineTo(px, py + 10)
    ctx.moveTo(px - 10, py)
    ctx.lineTo(px + 10, py)
    ctx.stroke()

    this._drawNode(ctx, px - 5, py - 5, color, 3)
    this._drawNode(ctx, px + 5, py - 5, '#ffffff', 2.5)
    this._drawNode(ctx, px - 5, py + 5, '#ffffff', 2.5)
    this._drawNode(ctx, px + 5, py + 5, color, 3)

    ctx.strokeStyle = `${color}aa`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(px - 5, py - 5)
    ctx.lineTo(px + 5, py + 5)
    ctx.moveTo(px + 5, py - 5)
    ctx.lineTo(px - 5, py + 5)
    ctx.stroke()
  }

  private _drawLimitTower(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    ctx.moveTo(px - 9, py + 8)
    ctx.lineTo(px - 9, py - 10)
    ctx.moveTo(px + 9, py + 8)
    ctx.lineTo(px + 9, py - 10)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.strokeStyle = color
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.moveTo(px - 11, py + 7)
    ctx.bezierCurveTo(px - 6, py - 9, px + 6, py - 9, px + 11, py + 7)
    ctx.stroke()

    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(px, py - 7, 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = HIGHLIGHT
    ctx.lineWidth = 1
    ctx.stroke()
  }

  private _drawCalculusTower(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    this._drawOrbit(ctx, px, py, 10, 0.75, color)
    ctx.strokeStyle = color
    ctx.lineWidth = 2.6
    ctx.beginPath()
    ctx.moveTo(px - 9, py + 8)
    ctx.bezierCurveTo(px - 2, py + 1, px - 3, py - 9, px + 7, py - 9)
    ctx.moveTo(px + 2, py - 6)
    ctx.bezierCurveTo(px - 6, py - 3, px + 6, py + 4, px - 2, py + 9)
    ctx.stroke()
    this._drawCrystal(ctx, px + 5, py + 3, 4, color, false)
  }

  private _drawDish(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    ctx.fillStyle = color
    ctx.strokeStyle = HIGHLIGHT
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.ellipse(px - 1, py + 1, 8, 6, -0.35, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = BASE_DARK
    ctx.beginPath()
    ctx.arc(px - 1, py + 1, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  private _drawOrbit(ctx: CanvasRenderingContext2D, px: number, py: number, radius: number, tilt: number, color: string): void {
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(tilt)
    ctx.scale(1, 0.48)
    ctx.strokeStyle = `${color}bb`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  private _drawSpark(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, color: string): void {
    ctx.strokeStyle = color
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(px - size, py)
    ctx.lineTo(px + size, py)
    ctx.moveTo(px, py - size)
    ctx.lineTo(px, py + size)
    ctx.stroke()
  }

  private _drawCrystal(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    color: string,
    facet: boolean,
  ): void {
    const g = ctx.createLinearGradient(px, py - size, px, py + size)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.22, color)
    g.addColorStop(1, BASE_DARK)
    ctx.fillStyle = g
    ctx.strokeStyle = HIGHLIGHT
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(px, py - size)
    ctx.lineTo(px + size * 0.75, py)
    ctx.lineTo(px, py + size)
    ctx.lineTo(px - size * 0.75, py)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    if (!facet) return
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px, py - size)
    ctx.lineTo(px, py + size)
    ctx.moveTo(px - size * 0.75, py)
    ctx.lineTo(px + size * 0.75, py)
    ctx.stroke()
  }

  private _drawBarrel(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    length: number,
    angle: number,
    color: string,
    width = 5,
  ): void {
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(angle)
    ctx.strokeStyle = BASE_DARK
    ctx.lineWidth = width + 2
    ctx.beginPath()
    ctx.moveTo(2, 0)
    ctx.lineTo(length, 0)
    ctx.stroke()
    ctx.strokeStyle = `${color}ee`
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(3, 0)
    ctx.lineTo(length, 0)
    ctx.stroke()
    ctx.fillStyle = HIGHLIGHT
    ctx.beginPath()
    ctx.arc(length + 1, 0, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private _drawNode(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    color: string,
    radius = 2.5,
  ): void {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  private _drawGlyph(ctx: CanvasRenderingContext2D, px: number, py: number, tower: TowerView): void {
    // Small hue-independent type cue for colour-blind support.
    ctx.font = 'bold 9px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(0,0,0,0.92)'
    ctx.strokeText(tower.glyph, px, py + 10)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(tower.glyph, px, py + 10)
  }

  private _drawDisabledMark(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    ctx.strokeStyle = '#cc4444'
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    ctx.moveTo(px - 8, py - 8)
    ctx.lineTo(px + 8, py + 8)
    ctx.moveTo(px + 8, py - 8)
    ctx.lineTo(px - 8, py + 8)
    ctx.stroke()
  }
}
