import type { PathSegmentRuntime } from '@/domain/path/segmented-path'

/**
 * Convert an arc-length distance `ds` into the corresponding x-displacement
 * at position `x` on the given segment.
 *
 * From the arc-length differential: ds = sqrt(1 + (dy/dx)^2) * dx
 * Therefore: dx = ds / sqrt(1 + (dy/dx)^2)
 */
export function arcLengthDx(
  segment: PathSegmentRuntime,
  x: number,
  ds: number,
): number {
  const dydx = segment.evaluateDerivative(x)
  return ds / Math.sqrt(1 + dydx * dydx)
}
