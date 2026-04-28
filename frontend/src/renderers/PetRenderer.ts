import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { GamePhase } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'

const TRAIT_COLORS: Record<string, string> = {
  slow: '#60a5fa',
  fast: '#facc15',
  heavy: '#ef4444',
  basic: '#a3a3a3',
}

export class PetRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return
    const { ctx } = renderer

    for (const pet of game.pets) {
      if (!pet.active) continue
      const px = gameToCanvasX(pet.x)
      const py = gameToCanvasY(pet.y)
      const color = TRAIT_COLORS[pet.trait] ?? TRAIT_COLORS.basic

      ctx.save()

      ctx.fillStyle = color
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.arc(px, py, 6, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.5
      ctx.stroke()

      if (pet.hp < pet.maxHp) {
        const barW = 12
        const barH = 2
        const ratio = pet.hp / pet.maxHp
        ctx.globalAlpha = 0.8
        ctx.fillStyle = '#333'
        ctx.fillRect(px - barW / 2, py + 8, barW, barH)
        ctx.fillStyle = '#4ade80'
        ctx.fillRect(px - barW / 2, py + 8, barW * ratio, barH)
      }

      ctx.restore()
    }
  }
}
