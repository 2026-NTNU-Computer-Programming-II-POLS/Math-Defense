/**
 * EnemyRenderer — 渲染敵人（只讀 Enemy 資料，只寫 Canvas）
 * Entity 不再有 render 方法，此 System 統一負責繪製。
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

      // 隱身效果
      ctx.globalAlpha = enemy.isStealthed ? 0.15 : 1.0

      // 敵人主體（像素風方塊）
      ctx.fillStyle = enemy.color
      ctx.fillRect(px - half, py - half, enemy.size, enemy.size)

      // 眼睛
      const eyeSize = Math.max(2, enemy.size / 6)
      ctx.fillStyle = '#fff'
      ctx.fillRect(px - half + enemy.size * 0.25 - eyeSize / 2, py - half + enemy.size * 0.3 - eyeSize / 2, eyeSize, eyeSize)
      ctx.fillRect(px - half + enemy.size * 0.75 - eyeSize / 2, py - half + enemy.size * 0.3 - eyeSize / 2, eyeSize, eyeSize)

      ctx.globalAlpha = 1.0

      // 血條（HP 不滿時顯示）
      if (enemy.hp < enemy.maxHp) {
        const hpRatio = enemy.hp / enemy.maxHp
        renderer.drawHealthBar(enemy.x, enemy.y, enemy.size, hpRatio, -(half + 6))
      }
    }
  }
}
