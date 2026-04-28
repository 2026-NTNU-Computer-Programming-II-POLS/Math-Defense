import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { TowerType, GamePhase, UNIT_PX } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'

export class RadarRangeRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE && game.state.phase !== GamePhase.BUILD) return
    const { ctx } = renderer

    for (const tower of game.towers) {
      if (tower.type !== TowerType.RADAR_A &&
          tower.type !== TowerType.RADAR_B &&
          tower.type !== TowerType.RADAR_C) continue
      if (!tower.configured) continue

      const px = gameToCanvasX(tower.x)
      const py = gameToCanvasY(tower.y)
      const radiusPx = tower.effectiveRange * tower.rangeBonus * UNIT_PX

      ctx.save()

      ctx.strokeStyle = `${tower.color}44`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(px, py, radiusPx, 0, Math.PI * 2)
      ctx.stroke()

      const arcStart = tower.arcStart ?? 0
      const arcEnd = tower.arcEnd ?? Math.PI / 2
      ctx.fillStyle = `${tower.color}22`
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.arc(px, py, radiusPx, -arcEnd, -arcStart)
      ctx.closePath()
      ctx.fill()

      ctx.strokeStyle = `${tower.color}88`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(px, py, radiusPx, -arcEnd, -arcStart)
      ctx.stroke()

      ctx.restore()
    }
  }
}
