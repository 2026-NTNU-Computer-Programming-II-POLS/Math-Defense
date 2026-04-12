/**
 * EnemyRenderer — renders enemies (reads Enemy data, writes to Canvas only)
 * Entities no longer have render methods; this system handles all drawing.
 */
import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'

export class EnemyRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    const { ctx } = renderer

    for (const enemy of game.enemies) {
      if (!enemy.alive) continue

      const px = gameToCanvasX(enemy.x)
      const py = gameToCanvasY(enemy.y)
      const half = enemy.size / 2

      // stealth effect
      ctx.globalAlpha = enemy.isStealthed ? 0.15 : 1.0

      // enemy body (pixel-art square)
      ctx.fillStyle = enemy.color
      ctx.fillRect(px - half, py - half, enemy.size, enemy.size)

      // eyes
      const eyeSize = Math.max(2, enemy.size / 6)
      ctx.fillStyle = '#fff'
      ctx.fillRect(px - half + enemy.size * 0.25 - eyeSize / 2, py - half + enemy.size * 0.3 - eyeSize / 2, eyeSize, eyeSize)
      ctx.fillRect(px - half + enemy.size * 0.75 - eyeSize / 2, py - half + enemy.size * 0.3 - eyeSize / 2, eyeSize, eyeSize)

      ctx.globalAlpha = 1.0

      // health bar (shown only when HP is below maximum)
      if (enemy.hp < enemy.maxHp) {
        const hpRatio = enemy.hp / enemy.maxHp
        renderer.drawHealthBar(enemy.x, enemy.y, enemy.size, hpRatio, -(half + 6))
      }
    }
  }
}
