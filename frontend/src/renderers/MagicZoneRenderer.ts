import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { TowerType, GamePhase, UNIT_PX } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import type { MagicTowerSystem } from '@/systems/MagicTowerSystem'

const ZONE_WIDTH_PX = 1.5 * UNIT_PX

export class MagicZoneRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE && game.state.phase !== GamePhase.BUILD) return

    const magicSystem = game.getSystem<MagicTowerSystem>('magicTower')
    if (!magicSystem) return

    const { ctx } = renderer

    for (const tower of game.towers) {
      if (tower.type !== TowerType.MAGIC || !tower.configured) continue

      const fn = magicSystem.getTowerCurve(tower)
      if (!fn) continue

      const color = tower.magicMode === 'debuff'
        ? 'rgba(168, 85, 247, 0.25)'
        : 'rgba(64, 184, 144, 0.25)'

      ctx.save()
      ctx.strokeStyle = tower.magicMode === 'debuff'
        ? 'rgba(168, 85, 247, 0.6)'
        : 'rgba(64, 184, 144, 0.6)'
      ctx.lineWidth = 2
      ctx.fillStyle = color

      ctx.beginPath()
      const xMin = tower.x - tower.effectiveRange
      const xMax = tower.x + tower.effectiveRange
      const step = 0.2

      for (let x = xMin; x <= xMax; x += step) {
        const y = fn(x)
        const px = gameToCanvasX(x)
        const py = gameToCanvasY(y)
        if (x === xMin) ctx.moveTo(px, py - ZONE_WIDTH_PX)
        else ctx.lineTo(px, py - ZONE_WIDTH_PX)
      }
      for (let x = xMax; x >= xMin; x -= step) {
        const y = fn(x)
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
}
