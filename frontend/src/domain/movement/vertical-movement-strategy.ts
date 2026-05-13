/**
 * Vertical-segment kinematics: `x` is constant at `params.x`; progression
 * is time-driven via `t` over `params.durationSec`, with `y` linearly
 * interpolated between `yStart` and `yEnd`. `t` clamps to 1 so a tick
 * larger than the remaining duration still emits a well-defined end state;
 * the hand-off to the next segment is driven by the tracker detecting the
 * x jump after the vertical segment completes (spec §6.6).
 */
import type { PathSegmentRuntime } from '@/domain/path/segmented-path'
import type { MovementContext, MovementState, MovementStrategy } from './movement-strategy'

export const verticalMovementStrategy: MovementStrategy = {
  advance(
    state: MovementState,
    segment: PathSegmentRuntime,
    dt: number,
    _ctx: MovementContext,
  ): MovementState {
    if (segment.params.kind !== 'vertical') {
      throw new Error(
        `verticalMovementStrategy received non-vertical segment "${segment.id}" (kind=${segment.params.kind}).`,
      )
    }
    const { x, yStart, yEnd, durationSec } = segment.params
    const dtNormalized = durationSec > 0 ? dt / durationSec : 1
    const nextT = Math.min(state.t + dtNormalized, 1)
    const nextY = yStart + (yEnd - yStart) * nextT
    return { x, y: nextY, t: nextT }
  },
}
