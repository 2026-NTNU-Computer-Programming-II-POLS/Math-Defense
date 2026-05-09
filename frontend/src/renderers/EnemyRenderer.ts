/**
 * EnemyRenderer — paints enemies from an EnemySceneView snapshot (F-ARCH-4).
 * Never reads Enemy entity fields directly; the projection layer in
 * engine/projections/project-enemies.ts owns that surface.
 */
import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { UNIT_PX } from '@/data/constants'
import { projectEnemyScene } from '@/engine/projections/project-enemies'
import type { EnemyView } from '@/engine/projections/views'

export class EnemyRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    const view = projectEnemyScene(game)
    for (const enemy of view.enemies) {
      this._drawEnemy(renderer, enemy)
    }
  }

  private _drawEnemy(renderer: Renderer, enemy: EnemyView): void {
    const { ctx } = renderer
    const px = gameToCanvasX(enemy.x)
    const py = gameToCanvasY(enemy.y)
    const half = enemy.size / 2

    if (enemy.helperRadius > 0) {
      ctx.save()
      const auraRadius = enemy.helperRadius * UNIT_PX
      ctx.globalAlpha = 0.12
      ctx.fillStyle = '#48c878'
      ctx.beginPath()
      ctx.arc(px, py, auraRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 0.4
      ctx.strokeStyle = '#48c878'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
    }

    ctx.fillStyle = enemy.color
    ctx.fillRect(px - half, py - half, enemy.size, enemy.size)

    const eyeSize = Math.max(2, enemy.size / 6)
    ctx.fillStyle = '#fff'
    ctx.fillRect(px - half + enemy.size * 0.25 - eyeSize / 2, py - half + enemy.size * 0.3 - eyeSize / 2, eyeSize, eyeSize)
    ctx.fillRect(px - half + enemy.size * 0.75 - eyeSize / 2, py - half + enemy.size * 0.3 - eyeSize / 2, eyeSize, eyeSize)

    let barY = -(half + 6)

    if (enemy.shieldRatio !== null) {
      const barPx = px - half
      const barPy = py + barY
      ctx.fillStyle = '#333'
      ctx.fillRect(barPx, barPy, enemy.size, 4)
      ctx.fillStyle = '#4488ee'
      ctx.fillRect(barPx, barPy, enemy.size * enemy.shieldRatio, 4)
      barY -= 6
    }

    if (enemy.hpRatio !== null) {
      renderer.drawHealthBar(enemy.x, enemy.y, enemy.size, enemy.hpRatio, barY)
    }
  }
}
