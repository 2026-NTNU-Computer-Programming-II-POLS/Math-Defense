/**
 * TowerRenderer — renders towers (reads Tower data, writes to Canvas only)
 */
import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { GamePhase, UNIT_PX } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { TOWER_DEFS } from '@/data/tower-defs'

export class TowerRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    const { ctx } = renderer

    // §19: keyboard focus cursor (WCAG 2.4.7). Drawn before towers so an
    // existing tower at the focused cell renders on top — the ring still
    // surrounds it. Only visible during BUILD per §19.4 (cursor invisible
    // during WAVE phase). Cleared by useKeyboardPlacement on phase exit.
    if (game.state.phase === GamePhase.BUILD && game.keyboardCursor !== null) {
      const { gx, gy } = game.keyboardCursor
      const px = gameToCanvasX(gx)
      const py = gameToCanvasY(gy)
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

    for (const tower of game.towers) {
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
      // Stroked in dark and filled in white for contrast on any body colour.
      const glyph = TOWER_DEFS[tower.type].glyph
      ctx.font = 'bold 16px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.strokeText(glyph, px, py)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(glyph, px, py)

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

      // Build Phase: show grid coordinates
      if (game.state.phase === GamePhase.BUILD) {
        ctx.fillStyle = 'rgba(212,168,64,0.7)'
        ctx.font = '9px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(`(${tower.x},${tower.y})`, px, py - 18)
      }
    }
  }
}
