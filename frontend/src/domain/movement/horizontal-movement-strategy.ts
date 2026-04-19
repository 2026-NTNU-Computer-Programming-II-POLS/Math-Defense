/**
 * Horizontal-segment kinematics: `y` is constant, `x` advances by
 * `direction * speed * dt`. `t` is unused for x-driven kinds and stays 0.
 */
import type { PathSegmentRuntime } from '@/domain/path/segmented-path'
import type { MovementContext, MovementState, MovementStrategy } from './movement-strategy'

export const horizontalMovementStrategy: MovementStrategy = {
  advance(
    state: MovementState,
    segment: PathSegmentRuntime,
    dt: number,
    ctx: MovementContext,
  ): MovementState {
    const nextX = state.x + ctx.direction * ctx.speed * dt
    const nextY = segment.evaluate(nextX)
    return { x: nextX, y: nextY, t: 0 }
  },
}
