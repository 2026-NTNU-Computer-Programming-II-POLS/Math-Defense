import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { UNIT_PX } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { projectMagicZones } from '@/engine/projections/project-magic-zones'
import type { MagicZoneView } from '@/engine/projections/views'

export class MagicZoneRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    const { ctx } = renderer
    for (const view of projectMagicZones(game)) {
      this._drawZone(ctx, view)
    }
  }

  private _drawZone(ctx: CanvasRenderingContext2D, view: MagicZoneView): void {
    const fillColor = view.mode === 'debuff'
      ? 'rgba(168, 85, 247, 0.22)'
      : 'rgba(64, 184, 144, 0.22)'
    const strokeColor = view.mode === 'debuff'
      ? 'rgba(168, 85, 247, 0.6)'
      : 'rgba(64, 184, 144, 0.6)'
    // Visual Redesign Phase 5a: a brighter centerline traces the actual
    // function curve so the band reads as "f(x) plotted on a parchment scroll"
    // — matching the new Magic instrument body.
    const centerColor = view.mode === 'debuff'
      ? 'rgba(228, 192, 255, 0.95)'
      : 'rgba(168, 240, 208, 0.95)'

    ctx.save()
    ctx.lineWidth = 2
    ctx.fillStyle = fillColor

    const xMin = view.x - view.range
    const xMax = view.x + view.range
    const step = 0.2
    const halfWidthPx = view.zoneHalfWidth * UNIT_PX

    // Filled band — dashed edge for a "function-on-paper" feel.
    ctx.beginPath()
    for (let x = xMin; x <= xMax; x += step) {
      const y = view.curve(x)
      const px = gameToCanvasX(x)
      const py = gameToCanvasY(y)
      if (x === xMin) ctx.moveTo(px, py - halfWidthPx)
      else ctx.lineTo(px, py - halfWidthPx)
    }
    for (let x = xMax; x >= xMin; x -= step) {
      const y = view.curve(x)
      const px = gameToCanvasX(x)
      const py = gameToCanvasY(y)
      ctx.lineTo(px, py + halfWidthPx)
    }
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = strokeColor
    ctx.setLineDash([4, 3])
    ctx.stroke()
    ctx.setLineDash([])

    // Centerline trace.
    ctx.beginPath()
    for (let x = xMin; x <= xMax; x += step) {
      const y = view.curve(x)
      const px = gameToCanvasX(x)
      const py = gameToCanvasY(y)
      if (x === xMin) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.strokeStyle = centerColor
    ctx.lineWidth = 1.6
    ctx.stroke()

    ctx.restore()
  }
}
