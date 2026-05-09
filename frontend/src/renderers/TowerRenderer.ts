/**
 * TowerRenderer — paints towers from a TowerSceneView snapshot (F-ARCH-4).
 * Never reads Tower entity fields directly; engine/projections/project-towers.ts
 * owns that surface.
 */
import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { UNIT_PX } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { projectTowerScene } from '@/engine/projections/project-towers'
import type { TowerSceneView, TowerView } from '@/engine/projections/views'

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

    ctx.globalAlpha = alpha

    // drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.arc(px, py + 3, 14, 0, Math.PI * 2)
    ctx.fill()

    // tower body
    ctx.fillStyle = tower.color
    ctx.beginPath()
    ctx.arc(px, py, 14, 0, Math.PI * 2)
    ctx.fill()

    // Color-blind glyph overlay (WCAG 2.2 SC 1.4.1): a per-type Unicode mark
    // so towers stay distinguishable when hue is unreliable / in greyscale.
    ctx.font = 'bold 16px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.strokeText(tower.glyph, px, py)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(tower.glyph, px, py)

    // bright border for towers that have been configured
    if (tower.configured) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.globalAlpha = alpha * 0.6
      ctx.beginPath()
      ctx.arc(px, py, 16, 0, Math.PI * 2)
      ctx.stroke()
    }

    // disabled overlay (X mark)
    if (tower.disabled) {
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

    ctx.globalAlpha = 1.0

    if (view.showCoords) {
      ctx.fillStyle = 'rgba(212,168,64,0.7)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(`(${tower.x},${tower.y})`, px, py - 18)
    }
  }
}
