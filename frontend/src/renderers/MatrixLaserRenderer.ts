import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { TowerType, GamePhase } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import type { MatrixTowerSystem } from '@/systems/MatrixTowerSystem'

export class MatrixLaserRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    const matrixSystem = game.getSystem<MatrixTowerSystem>('matrixTower')
    if (!matrixSystem) return

    const { ctx } = renderer
    const drawn = new Set<string>()

    for (const tower of game.towers) {
      if (tower.type !== TowerType.MATRIX || !tower.matrixPairId) continue
      const pairKey = [tower.id, tower.matrixPairId].sort().join(':')
      if (drawn.has(pairKey)) continue
      drawn.add(pairKey)

      const pair = game.towers.find((t) => t.id === tower.matrixPairId)
      if (!pair) continue

      const laser = matrixSystem.getLaserState(tower.id)
      if (!laser || laser.targetIds.length === 0) {
        ctx.save()
        ctx.strokeStyle = `${tower.color}44`
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(gameToCanvasX(tower.x), gameToCanvasY(tower.y))
        ctx.lineTo(gameToCanvasX(pair.x), gameToCanvasY(pair.y))
        ctx.stroke()
        ctx.restore()
        continue
      }

      const intensity = Math.min(1, 0.3 + laser.rampTime * 0.15)
      const width = 2 + laser.rampTime * 0.5

      ctx.save()
      ctx.strokeStyle = tower.color
      ctx.globalAlpha = intensity
      ctx.lineWidth = width
      ctx.shadowColor = tower.color
      ctx.shadowBlur = 8

      for (const tid of laser.targetIds) {
        const target = game.enemies.find((e) => e.id === tid && e.alive)
        if (!target) continue
        const tx = gameToCanvasX(target.x)
        const ty = gameToCanvasY(target.y)
        ctx.beginPath()
        ctx.moveTo(gameToCanvasX(tower.x), gameToCanvasY(tower.y))
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(gameToCanvasX(pair.x), gameToCanvasY(pair.y))
        ctx.lineTo(tx, ty)
        ctx.stroke()
      }

      ctx.restore()
    }
  }
}
