/**
 * useReducedMotion — Visual Redesign Phase 7 composable.
 *
 * Reads `prefers-reduced-motion: reduce` once at composition and exposes a
 * reactive boolean. The media query's `change` event is wired so OS-level
 * preference flips propagate without a page reload; the listener is torn
 * down via `onScopeDispose` so component teardown doesn't leak handlers.
 *
 * Most callsites are CSS-driven (see `@media (prefers-reduced-motion: reduce)`
 * blocks in HUD.vue, PhaseFader.vue, etc.). This composable exists for the
 * cases where the gate must live in script — e.g., gating a `setTimeout`,
 * choosing between two child components, or passing the flag to a renderer.
 *
 * For engine-side (Vue-free) callers, import the plain `prefersReducedMotion()`
 * function from `@/utils/reducedMotion` instead.
 */
import { ref, onScopeDispose, type Ref } from 'vue'
import { prefersReducedMotion } from '@/utils/reducedMotion'

export function useReducedMotion(): Ref<boolean> {
  const reduced = ref(prefersReducedMotion())

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return reduced
  }
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
  const onChange = (e: MediaQueryListEvent): void => {
    reduced.value = e.matches
  }
  mql.addEventListener('change', onChange)
  onScopeDispose(() => mql.removeEventListener('change', onChange))

  return reduced
}
