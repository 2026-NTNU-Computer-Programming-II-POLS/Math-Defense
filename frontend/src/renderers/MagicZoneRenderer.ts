import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { UNIT_PX } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { clipToBoard } from '@/engine/render-helpers/clip-to-board'
import { projectMagicZones } from '@/engine/projections/project-magic-zones'
import type { MagicZoneView } from '@/engine/projections/views'

export class MagicZoneRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    const views = projectMagicZones(game)
    if (views.length === 0) return
    const { ctx } = renderer
    ctx.save()
    clipToBoard(ctx)
    for (const view of views) {
      this._drawZone(ctx, view)
    }
    ctx.restore()
  }

  private _drawZone(ctx: CanvasRenderingContext2D, view: MagicZoneView): void {
    // The zone is tinted with the tower's own colour (hex-alpha suffixes, the
    // same convention TowerRenderer / RadarRangeRenderer use) so the band
    // matches the Magic instrument body and tower button. Debuff vs buff is
    // still distinguished by the band width, not by hue.
    const fillColor = `${view.color}38`
    const strokeColor = `${view.color}99`
    // Visual Redesign Phase 5a: a brighter centerline traces the actual
    // function curve so the band reads as "f(x) plotted on a parchment scroll"
    // — matching the new Magic instrument body.
    const centerColor = view.color

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
