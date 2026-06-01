import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { UNIT_PX } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY, distance } from '@/math/MathUtils'
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

    const halfWidthPx = view.zoneHalfWidth * UNIT_PX

    // The hit region is a circular range centered on the tower (radius =
    // view.range), so only the curve arc whose points fall inside that circle
    // is drawn — matching MagicTowerSystem's radial gate. A steep curve leaves
    // the circle before the x-window ends, splitting the band into contiguous
    // in-range runs; each is drawn as its own band + centerline.
    for (const seg of this._inRangeSegments(view)) {
      // Filled band — dashed edge for a "function-on-paper" feel.
      ctx.beginPath()
      seg.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.px, p.py - halfWidthPx)
        else ctx.lineTo(p.px, p.py - halfWidthPx)
      })
      for (let i = seg.length - 1; i >= 0; i--) {
        ctx.lineTo(seg[i].px, seg[i].py + halfWidthPx)
      }
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = strokeColor
      ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.setLineDash([])

      // Centerline trace.
      ctx.beginPath()
      seg.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.px, p.py)
        else ctx.lineTo(p.px, p.py)
      })
      ctx.strokeStyle = centerColor
      ctx.lineWidth = 1.6
      ctx.stroke()
    }

    ctx.restore()
  }

  // Sample the curve across the x-window [x − range, x + range] and group the
  // samples into contiguous runs whose curve point lies within `range` of the
  // tower (Euclidean). Mirrors the radial gate in MagicTowerSystem so the band
  // never paints reach the tower does not actually have.
  private _inRangeSegments(view: MagicZoneView): { px: number; py: number }[][] {
    const xMin = view.x - view.range
    const xMax = view.x + view.range
    const step = 0.2
    const segments: { px: number; py: number }[][] = []
    let current: { px: number; py: number }[] = []
    for (let x = xMin; x <= xMax; x += step) {
      const y = view.curve(x)
      if (distance(view.x, view.y, x, y) <= view.range) {
        current.push({ px: gameToCanvasX(x), py: gameToCanvasY(y) })
      } else if (current.length > 0) {
        segments.push(current)
        current = []
      }
    }
    if (current.length > 0) segments.push(current)
    return segments
  }
}
