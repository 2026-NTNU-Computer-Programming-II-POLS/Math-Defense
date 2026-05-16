import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { projectMatrixLasers } from '@/engine/projections/project-matrix-lasers'
import type { MatrixLaserPairView } from '@/engine/projections/views'

export class MatrixLaserRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    const { ctx } = renderer
    for (const view of projectMatrixLasers(game)) {
      this._drawPair(ctx, view)
    }
  }

  private _drawPair(ctx: CanvasRenderingContext2D, view: MatrixLaserPairView): void {
    if (!view.laser) {
      ctx.save()
      ctx.strokeStyle = `${view.color}44`
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(gameToCanvasX(view.towerX), gameToCanvasY(view.towerY))
      ctx.lineTo(gameToCanvasX(view.pairX), gameToCanvasY(view.pairY))
      ctx.stroke()
      ctx.restore()
      return
    }

    const { rampTime, targets } = view.laser
    const intensity = Math.min(1, 0.3 + rampTime * 0.15)
    const width = 2 + rampTime * 0.5
    const ax = gameToCanvasX(view.towerX)
    const ay = gameToCanvasY(view.towerY)
    const bx = gameToCanvasX(view.pairX)
    const by = gameToCanvasY(view.pairY)

    ctx.save()
    ctx.strokeStyle = view.color
    ctx.globalAlpha = intensity
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.shadowColor = view.color
    ctx.shadowBlur = 8

    for (const target of targets) {
      const tx = gameToCanvasX(target.x)
      const ty = gameToCanvasY(target.y)
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(tx, ty)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(tx, ty)
      ctx.stroke()
      // Visual Redesign Phase 5c — bracket end-caps at the target so the
      // beam visually terminates in the same `[ ]` motif as the Matrix
      // tower body. Drawn without shadow so the small marks stay crisp.
      this._drawBracketCap(ctx, tx, ty, ax, ay, view.color)
      this._drawBracketCap(ctx, tx, ty, bx, by, view.color)
    }

    ctx.restore()
  }

  private _drawBracketCap(
    ctx: CanvasRenderingContext2D,
    tx: number,
    ty: number,
    fromX: number,
    fromY: number,
    color: string,
  ): void {
    const dx = tx - fromX
    const dy = ty - fromY
    const len = Math.hypot(dx, dy)
    if (len < 0.001) return
    // Perpendicular unit vector across the beam direction.
    const nx = -dy / len
    const ny = dx / len
    // Pull the cap back from the impact point so it brackets the hit.
    const px = tx - (dx / len) * 2
    const py = ty - (dy / len) * 2
    const half = 4
    const serif = 2
    ctx.save()
    ctx.shadowBlur = 0
    ctx.strokeStyle = color
    ctx.lineWidth = 1.4
    ctx.beginPath()
    // Cross-beam stroke at the cap.
    ctx.moveTo(px + nx * half, py + ny * half)
    ctx.lineTo(px - nx * half, py - ny * half)
    // Short serifs pointing back along the beam (toward the tower) so the
    // shape reads as a `]` bracket rather than just a tick.
    ctx.moveTo(px + nx * half, py + ny * half)
    ctx.lineTo(px + nx * half - (dx / len) * serif, py + ny * half - (dy / len) * serif)
    ctx.moveTo(px - nx * half, py - ny * half)
    ctx.lineTo(px - nx * half - (dx / len) * serif, py - ny * half - (dy / len) * serif)
    ctx.stroke()
    ctx.restore()
  }
}
