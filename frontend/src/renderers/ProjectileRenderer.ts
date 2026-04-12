/**
 * ProjectileRenderer — renders projectiles
 */
import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'

export class ProjectileRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    for (const proj of game.projectiles) {
      if (!proj.active) continue
      renderer.drawCircle(proj.x, proj.y, 3, proj.color)
    }
  }
}
