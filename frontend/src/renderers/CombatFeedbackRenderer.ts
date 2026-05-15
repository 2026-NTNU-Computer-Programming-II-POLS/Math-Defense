/**
 * CombatFeedbackRenderer — the third telegraph layer (V3 Phase 4).
 *
 * Subscribes to DAMAGE_RESOLVED and paints short-lived floating combat text
 * above the enemy that was hit. This is the in-combat teaching surface: when a
 * Bulwark caps a hit the player sees `40 → 14`, when a Swarmling evades one
 * they see the reduced number greyed — the mechanic is learned without text.
 *
 * Self-contained per the Phase 4 SoC notes: own subscription, own state, own
 * draw pass. The event is rare (only modified discrete hits emit it), so the
 * text list never grows per-frame.
 */
import { Events } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import type { Game, GameSystem, DamageResolvedPayload } from '@/engine/Game'
import type { Renderer } from '@/engine/Renderer'

interface FloatingText {
  x: number
  y: number
  text: string
  kind: 'capped' | 'reduced'
  age: number
}

const LIFETIME = 0.6
const RISE_PX = 26
const CAPPED_COLOR = '#ffd24a'
const REDUCED_COLOR = '#b6b6b6'

export class CombatFeedbackRenderer implements GameSystem {
  private _texts: FloatingText[] = []
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.DAMAGE_RESOLVED, (p: DamageResolvedPayload) => {
        const applied = Math.round(p.applied)
        this._texts.push({
          x: p.x,
          y: p.y,
          // Capped hits teach the clamp by showing both numbers; evaded hits
          // just show the reduced number — the small figure is the lesson.
          text: p.kind === 'capped' ? `${Math.round(p.raw)} → ${applied}` : `${applied}`,
          kind: p.kind,
          age: 0,
        })
      }),

      game.eventBus.on(Events.LEVEL_START, () => {
        this._texts = []
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
    this._texts = []
  }

  update(dt: number, _game: Game): void {
    for (let i = this._texts.length - 1; i >= 0; i--) {
      this._texts[i].age += dt
      if (this._texts[i].age >= LIFETIME) this._texts.splice(i, 1)
    }
  }

  render(renderer: Renderer, _game: Game): void {
    const { ctx } = renderer
    for (const t of this._texts) {
      const p = t.age / LIFETIME
      const px = gameToCanvasX(t.x)
      const py = gameToCanvasY(t.y) - p * RISE_PX

      ctx.save()
      ctx.globalAlpha = 1 - p
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.78)'
      ctx.fillStyle = t.kind === 'capped' ? CAPPED_COLOR : REDUCED_COLOR
      ctx.strokeText(t.text, px, py)
      ctx.fillText(t.text, px, py)
      ctx.restore()
    }
  }
}
