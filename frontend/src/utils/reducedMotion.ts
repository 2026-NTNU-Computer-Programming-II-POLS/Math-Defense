/**
 * Plain (Vue-free) accessor for the `prefers-reduced-motion` media query.
 *
 * Visual Redesign Phase 7. The engine-side renderers (ShakeController,
 * DeathParticleRenderer, TowerLifecycleRenderer) cannot import Vue, so the
 * reduced-motion signal is split into two surfaces:
 *
 *   - `prefersReducedMotion()` (here) — boolean snapshot at call time. Used
 *     inside renderer hot paths where allocating a reactive ref would be
 *     wasteful.
 *   - `useReducedMotion()` (`composables/useReducedMotion.ts`) — Vue ref
 *     wrapping the same media query so component templates can react to OS
 *     preference flips at runtime.
 *
 * SSR / non-browser guard: `matchMedia` is undefined in test runners that
 * stub out `window`. Returning `false` keeps motion enabled which matches
 * default behaviour and avoids breaking the snapshot suite.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
