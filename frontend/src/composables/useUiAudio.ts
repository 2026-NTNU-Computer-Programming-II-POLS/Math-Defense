/**
 * useUiAudio — thin composable that exposes UI-bus SFX triggers to
 * presentation-layer components without forcing them to import the engine
 * audio surface directly.
 *
 * The composable is stateless: it just routes named gestures (`click`,
 * `hover`, `confirm`, `cancel`) to AssetManager.play(). Components call
 * the helpers as @click / @mouseenter handlers next to existing logic.
 *
 * Why a composable and not a directive: a directive would couple click
 * affordances to a global tag; some buttons (Cast Spell) should *not*
 * play the generic click because they have their own SFX. Explicit
 * composable call keeps the choice at the call site.
 */
import { assetManager } from '@/engine/audio/AssetManager'

export interface UiAudio {
  click(): void
  hover(): void
  confirm(): void
  cancel(): void
}

export function useUiAudio(): UiAudio {
  // Idempotent — if a game session has already preloaded the asset pool,
  // this resolves immediately. Necessary when UI-only screens (ProfileView,
  // MenuView) trigger SFX without ever entering a game session.
  void assetManager.load()
  return {
    click:   () => assetManager.play('ui-click'),
    hover:   () => assetManager.play('ui-hover'),
    confirm: () => assetManager.play('ui-confirm'),
    cancel:  () => assetManager.play('ui-cancel'),
  }
}
