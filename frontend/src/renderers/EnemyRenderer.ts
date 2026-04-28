import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { UNIT_PX } from '@/data/constants'

export class EnemyRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    const { ctx } = renderer

    for (const enemy of game.enemies) {
      if (!enemy.alive) continue

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

      if (enemy.shieldMax > 0) {
        const shieldRatio = enemy.shield / enemy.shieldMax
        const barPx = px - half
        const barPy = py + barY
        ctx.fillStyle = '#333'
        ctx.fillRect(barPx, barPy, enemy.size, 4)
        ctx.fillStyle = '#4488ee'
        ctx.fillRect(barPx, barPy, enemy.size * shieldRatio, 4)
        barY -= 6
      }

      if (enemy.hp < enemy.maxHp) {
        renderer.drawHealthBar(enemy.x, enemy.y, enemy.size, enemy.hp / enemy.maxHp, barY)
      }
    }
  }
}
