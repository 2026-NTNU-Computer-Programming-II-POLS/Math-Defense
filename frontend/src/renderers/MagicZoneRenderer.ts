import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { UNIT_PX } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { projectMagicZones } from '@/engine/projections/project-magic-zones'
import type { MagicZoneView } from '@/engine/projections/views'

const ZONE_WIDTH_PX = 1.5 * UNIT_PX

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
      ? 'rgba(168, 85, 247, 0.25)'
      : 'rgba(64, 184, 144, 0.25)'
    const strokeColor = view.mode === 'debuff'
      ? 'rgba(168, 85, 247, 0.6)'
      : 'rgba(64, 184, 144, 0.6)'

    ctx.save()
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 2
    ctx.fillStyle = fillColor

    ctx.beginPath()
    const xMin = view.x - view.range
    const xMax = view.x + view.range
    const step = 0.2

    for (let x = xMin; x <= xMax; x += step) {
      const y = view.curve(x)
      const px = gameToCanvasX(x)
      const py = gameToCanvasY(y)
      if (x === xMin) ctx.moveTo(px, py - ZONE_WIDTH_PX)
      else ctx.lineTo(px, py - ZONE_WIDTH_PX)
    }
    for (let x = xMax; x >= xMin; x -= step) {
      const y = view.curve(x)
      const px = gameToCanvasX(x)
      const py = gameToCanvasY(y)
      ctx.lineTo(px, py + ZONE_WIDTH_PX)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.restore()
  }
}
