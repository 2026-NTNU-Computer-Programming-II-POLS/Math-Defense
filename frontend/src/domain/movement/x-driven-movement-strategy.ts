import type { PathSegmentRuntime } from '@/domain/path/segmented-path'
import type { MovementContext, MovementState, MovementStrategy } from './movement-strategy'
import { arcLengthDx } from './arc-length'

/**
 * Shared strategy for all x-driven segment kinds (horizontal, linear,
 * quadratic, trigonometric, curve). Per-kind math is encapsulated in
 * the segment's `evaluate` / `evaluateDerivative` closures; the
 * strategy only handles arc-length-corrected advancement.
 */
export const xDrivenMovementStrategy: MovementStrategy = {
  advance(
    state: MovementState,
    segment: PathSegmentRuntime,
    dt: number,
    ctx: MovementContext,
  ): MovementState {
    const dx = arcLengthDx(segment, state.x, ctx.speed * dt)
    const nextX = state.x + ctx.direction * dx
    const nextY = segment.evaluate(nextX)
    return { x: nextX, y: nextY, t: 0 }
  },
}
