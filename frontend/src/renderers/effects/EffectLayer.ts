/**
 * EffectLayer — shared base for transient visual effect renderers.
 *
 * Every per-effect renderer introduced by the Visual Redesign plan follows
 * the same shape: an array of `{ age, maxAge, ... }` entries spawned in
 * response to game events, aged by dt, rendered each frame, and dropped
 * once `age >= maxAge`. This base formalises that pattern so subclasses
 * only have to declare the spawn-event subscriptions and the per-effect
 * paint routine.
 *
 * Pause-safe: `update(dt, game)` advances ages from the engine-provided dt,
 * which is zero (or the system is skipped) when paused. Renderers must not
 * reach for `performance.now()` for timing.
 *
 * LEVEL_START contract: the base subscribes to LEVEL_START and clears the
 * effect array. Subclasses MUST call `super.init(game)` so the subscription
 * is wired, and MUST register their additional subscriptions in
 * `engine/event-handlers/registry.ts` (CI-gated).
 */
import { Events } from '@/data/constants'
import type { Game, GameSystem } from '@/engine/Game'
import type { Renderer } from '@/engine/Renderer'

export interface Effect {
  age: number
  maxAge: number
  dead?: boolean
}

export abstract class EffectLayer<E extends Effect> implements GameSystem {
  protected readonly effects: E[] = []
  protected readonly unsubs: (() => void)[] = []

  init(game: Game): void {
    // Drop active effects on level restart so replays / retries don't leave
    // stale particles painted over a fresh level.
    this.unsubs.push(
      game.eventBus.on(Events.LEVEL_START, () => this.clear()),
    )
  }

  update(dt: number, _game: Game): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]
      e.age += dt
      if (e.age >= e.maxAge || e.dead) this.effects.splice(i, 1)
    }
  }

  abstract render(renderer: Renderer, game: Game): void

  destroy(): void {
    this.unsubs.forEach((fn) => fn())
    this.unsubs.length = 0
    this.effects.length = 0
  }

  protected spawn(e: E): void {
    this.effects.push(e)
  }

  protected clear(): void {
    this.effects.length = 0
  }
}
