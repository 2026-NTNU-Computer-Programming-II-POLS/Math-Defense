import { Events } from '@/data/constants'
import { SPELL_MAP } from '@/data/spell-defs'
import { UNIT_PX } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import type { Game, GameSystem } from '@/engine/Game'
import type { Renderer } from '@/engine/Renderer'

interface SpellVfx {
  spellId: string
  x: number
  y: number
  radius: number
  age: number
  maxAge: number
  color: string
}

export class SpellEffectRenderer implements GameSystem {
  private _effects: SpellVfx[] = []
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.SPELL_EFFECT, ({ spellId, x, y, radius }) => {
        const def = SPELL_MAP.get(spellId)
        this._effects.push({
          spellId,
          x,
          y,
          radius: radius ?? 2,
          age: 0,
          maxAge: 0.6,
          color: def?.color ?? '#ffffff',
        })
      }),

      game.eventBus.on(Events.LEVEL_START, () => {
        this._effects = []
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
    this._effects = []
  }

  update(dt: number, _game: Game): void {
    for (let i = this._effects.length - 1; i >= 0; i--) {
      this._effects[i].age += dt
      if (this._effects[i].age >= this._effects[i].maxAge) {
        this._effects.splice(i, 1)
      }
    }
  }

  render(renderer: Renderer, _game: Game): void {
    const ctx = renderer.ctx
    for (const vfx of this._effects) {
      const progress = vfx.age / vfx.maxAge
      const alpha = 1 - progress
      const scale = 0.5 + progress * 0.5

      const px = gameToCanvasX(vfx.x)
      const py = gameToCanvasY(vfx.y)
      const pr = vfx.radius * UNIT_PX * scale

      ctx.save()
      ctx.globalAlpha = alpha * 0.6
      ctx.beginPath()
      ctx.arc(px, py, pr, 0, Math.PI * 2)
      ctx.fillStyle = vfx.color
      ctx.fill()

      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(px, py, pr * 0.3, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.restore()
    }
  }
}
