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

    ctx.save()
    ctx.strokeStyle = view.color
    ctx.globalAlpha = intensity
    ctx.lineWidth = width
    ctx.shadowColor = view.color
    ctx.shadowBlur = 8

    for (const target of targets) {
      const tx = gameToCanvasX(target.x)
      const ty = gameToCanvasY(target.y)
      ctx.beginPath()
      ctx.moveTo(gameToCanvasX(view.towerX), gameToCanvasY(view.towerY))
      ctx.lineTo(tx, ty)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(gameToCanvasX(view.pairX), gameToCanvasY(view.pairY))
      ctx.lineTo(tx, ty)
      ctx.stroke()
    }

    ctx.restore()
  }
}
