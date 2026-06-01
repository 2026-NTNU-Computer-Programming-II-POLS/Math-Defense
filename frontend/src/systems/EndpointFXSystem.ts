/**
 * EndpointFXSystem — transient hit FX for the level endpoint marker (P*).
 *
 * When an enemy reaches the endpoint, EconomySystem applies damage and
 * CombatSystem triggers a screen shake. This system adds the visual answer
 * that lands on the marker itself: a star-fragment burst by default, with
 * `crying` and `angry` emoji bursts as alternates. The choice is sourced
 * from `game.endpointFx.style` (uiStore preference → useGameLoop → engine);
 * `'random'` resolves to one of the three concrete kinds via `game.rng` so
 * replays reproduce the same sequence.
 *
 * The marker is hidden when the player skipped the pre-game P* question
 * (`state.pathsVisible === false`), so we drop FX spawns in that case too —
 * a flash on an invisible marker would just give the location away.
 */
import { Events } from '@/data/constants'
import { EffectLayer, type Effect } from '@/renderers/effects/EffectLayer'
import { isGeneratedLevelContext } from '@/engine/generated-level-context'
import type { Game } from '@/engine/Game'
import type { Renderer } from '@/engine/Renderer'

type HitFxKind = 'fragments' | 'crying' | 'angry'

interface EndpointHitFx extends Effect {
  kind: HitFxKind
  x: number
  y: number
}

// Lifetime of the endpoint burst FX. The three draw routines are driven by
// normalised progress (age / maxAge), so raising this slows/lingers the whole
// animation rather than extending its spatial reach. Tune here only.
const HIT_FX_MAX_AGE = 1.1
const HIT_FX_KINDS: ReadonlyArray<HitFxKind> = ['fragments', 'crying', 'angry']

export class EndpointFXSystem extends EffectLayer<EndpointHitFx> {
  init(game: Game): void {
    super.init(game)
    this.unsubs.push(
      game.eventBus.on(Events.ENEMY_REACHED_ORIGIN, () => {
        this._spawnHit(game)
      }),
    )
  }

  private _spawnHit(game: Game): void {
    // Marker hidden → suppress FX too. Same gate the Renderer uses.
    if (!game.state.pathsVisible) return
    const ctx = game.levelContext
    if (!ctx || !isGeneratedLevelContext(ctx)) return

    const kind = this._resolveKind(game)
    this.spawn({
      kind,
      x: ctx.endpoint.x,
      y: ctx.endpoint.y,
      age: 0,
      maxAge: HIT_FX_MAX_AGE,
    })
  }

  private _resolveKind(game: Game): HitFxKind {
    const style = game.endpointFx.style
    if (style === 'random') {
      // Use game.rng so replays reproduce the same FX sequence.
      const idx = Math.min(HIT_FX_KINDS.length - 1, Math.floor(game.rng() * HIT_FX_KINDS.length))
      return HIT_FX_KINDS[idx]
    }
    return style
  }

  render(renderer: Renderer, _game: Game): void {
    for (const e of this.effects) {
      const p = e.age / e.maxAge
      switch (e.kind) {
        case 'fragments':
          renderer.drawEndpointFragments(e.x, e.y, p)
          break
        case 'crying':
          renderer.drawEndpointTears(e.x, e.y, p)
          break
        case 'angry':
          renderer.drawEndpointAngry(e.x, e.y, p)
          break
      }
    }
  }
}
