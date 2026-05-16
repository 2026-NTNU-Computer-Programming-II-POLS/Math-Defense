/**
 * ShakeController — tracks active screen-shake events and produces a
 * per-frame `{ dx, dy }` offset that `Game._render()` translates the
 * canvas by before any system renders.
 *
 * Ages via dt from `Game._update`, NOT `performance.now()`, so pause
 * freezes shake with the rest of the simulation.
 *
 * Phase 0 wires the controller in with zero amplitude. Phase 1 will start
 * issuing `shake()` calls on boss hits and origin breaches.
 *
 * Determinism: the per-frame jitter direction is a pure function of the
 * shake's age, not of `Math.random()` — replays of shake-triggering events
 * produce identical offsets. The visual offset never feeds back into game
 * state (it lives entirely on the canvas transform).
 *
 * Reduced-motion (Visual Redesign Phase 7): when the user opts into
 * `prefers-reduced-motion: reduce`, `shake()` becomes a no-op so the
 * canvas never translates. The signal is read at construction (and
 * re-evaluated lazily on each `shake()` call) so an OS-level flip mid-run
 * starts taking effect on the very next event.
 */
import { prefersReducedMotion } from '@/utils/reducedMotion'

interface ShakeEntry {
  amplitude: number
  age: number
  maxAge: number
}

export class ShakeController {
  private _active: ShakeEntry | null = null

  /**
   * Schedule a shake. If a stronger shake is already in progress it is
   * preserved; otherwise the new one replaces it. This prevents a stream
   * of small hits from masking a single large breach shake.
   */
  shake(amplitude: number, duration: number): void {
    if (amplitude <= 0 || duration <= 0) return
    if (prefersReducedMotion()) return
    if (this._active && this._active.amplitude > amplitude && this._active.age < this._active.maxAge) {
      return
    }
    this._active = { amplitude, age: 0, maxAge: duration }
  }

  update(dt: number): void {
    if (!this._active) return
    this._active.age += dt
    if (this._active.age >= this._active.maxAge) this._active = null
  }

  /**
   * Current canvas offset in pixels. Deterministic in the shake's age so
   * the same shake event always produces the same visual trajectory.
   */
  getOffset(): { dx: number; dy: number } {
    if (!this._active) return { dx: 0, dy: 0 }
    const { amplitude, age, maxAge } = this._active
    const decay = Math.max(0, 1 - age / maxAge)
    const a = amplitude * decay
    const dx = Math.sin(age * 73.1) * a
    const dy = Math.cos(age * 91.7) * a
    return { dx, dy }
  }

  /**
   * Zero amplitude — used by the reduced-motion gate (Phase 7) and by tests.
   */
  cancel(): void {
    this._active = null
  }
}
