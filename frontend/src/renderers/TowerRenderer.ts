/**
 * TowerRenderer — renders towers (reads Tower data, writes to Canvas only)
 */
import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { GamePhase } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'

export class TowerRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    const { ctx } = renderer

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
