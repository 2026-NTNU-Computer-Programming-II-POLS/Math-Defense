/**
 * Movement strategy interface and shared state shape.
 *
 * A `MovementStrategy` integrates one enemy's position one tick along a
 * single `PathSegmentRuntime`. The strategy is pure: given the same inputs
 * it yields the same output. The per-enemy `MovementState` lives in a side
 * table owned by `MovementSystem` — never on the `Enemy` entity.
 *
 * Game-direction convention (see `createSegmentedPath` JSDoc): enemies
 * travel from the path's right end (`startX`) toward its left end
 * (`targetX`), so `direction = -1` decreases `x`. The strategies respect
 * `ctx.direction` without encoding a direction assumption of their own.
 */
import type { PathSegmentRuntime } from '@/domain/path/segmented-path'

/**
 * Per-enemy kinematic state, kept outside the `Enemy` entity.
 *
 * - `x`, `y` — world coordinates at the end of the previous tick.
 * - `t` — progress within the current segment. Used by kinds whose
 *   kinematics are time-driven rather than x-driven (currently `vertical`;
 *   other kinds leave it at 0).
 */
export interface MovementState {
  readonly x: number
  readonly y: number
  readonly t: number
}

/**
 * Context passed to `advance` each tick. Kept narrow on purpose — strategies
 * must not reach into the broader `Game` object.
 */
export interface MovementContext {
  readonly speed: number
  readonly direction: 1 | -1
}

/**
 * Pure per-tick integrator for one kind of segment.
 *
 * Returns a fresh `MovementState`; never mutates the input. When the
 * returned state leaves the segment's `xRange` (horizontal-family) or
 * clamps `t >= 1` (vertical), the caller is responsible for detecting the
 * boundary crossing — strategies themselves are oblivious to segment
 * succession.
 */
export interface MovementStrategy {
  advance(
    state: MovementState,
    segment: PathSegmentRuntime,
    dt: number,
    ctx: MovementContext,
  ): MovementState
}
