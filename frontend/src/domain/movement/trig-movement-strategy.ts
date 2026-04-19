/**
 * Trigonometric-segment kinematics:
 * `y = amplitude*sin(frequency*x + phase) + offset` is computed by the
 * segment's own `evaluate` closure; the strategy advances `x` by
 * `direction * speed * dt`. See `segment-factories.makeTrigonometric`.
 */
import type { PathSegmentRuntime } from '@/domain/path/segmented-path'
import type { MovementContext, MovementState, MovementStrategy } from './movement-strategy'

export const trigMovementStrategy: MovementStrategy = {
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
