/**
 * Runtime piecewise path.
 *
 * `SegmentedPath` is an immutable view over an ordered list of runtime
 * segments, each carrying its own `(x) => y` closure. It is produced by
 * `buildLevelPath` from a `PathLayout` and is never persisted — closures
 * cannot cross a serialization boundary (see spec §2.3 rule 6).
 */
import type { PathSegmentKind } from '@/data/path-segment-types'

/** One runtime segment: the declarative data plus a resolved math closure. */
export interface PathSegmentRuntime {
  readonly id: string
  readonly kind: PathSegmentKind
  readonly xRange: readonly [number, number]
  readonly evaluate: (x: number) => number
  readonly expr: string
  readonly label: string
}

/**
 * Immutable runtime-only path object.
 *
 * @remarks `evaluateAt` throws when `x` lies outside the path. Callers that
 * sample across `[startX, targetX]` are always in-range by construction.
 */
export interface SegmentedPath {
  readonly segments: ReadonlyArray<PathSegmentRuntime>
  readonly startX: number
  readonly targetX: number
  evaluateAt(x: number): number
  findSegmentAt(x: number): PathSegmentRuntime | null
}

/**
 * Assemble a frozen `SegmentedPath` from a non-empty list of runtimes.
 *
 * Boundary semantics (spec §14.1): when `x` sits on an interior boundary
 * shared by two adjacent segments, `findSegmentAt` returns the right-hand
 * one. Implementation: scan segments right-to-left and return the first
 * whose inclusive `xRange` contains `x`.
 *
 * `startX` and `targetX` are taken from the outer edges of the first and
 * last segments' `xRange`s. The path runs from `startX` (rightmost: enemy
 * spawn) toward `targetX` (leftmost: origin) in the game's coordinate
 * system, but this module makes no direction assumption: `startX` is
 * whatever the first segment's `xRange[0]` is, and `targetX` is the last
 * segment's `xRange[1]`. Authors order segments in traversal order; the
 * level definition owns direction.
 */
export function createSegmentedPath(
  runtimes: ReadonlyArray<PathSegmentRuntime>,
): SegmentedPath {
  if (runtimes.length === 0) {
    throw new Error('createSegmentedPath requires at least one segment.')
  }
  const segments = Object.freeze(runtimes.slice()) as ReadonlyArray<PathSegmentRuntime>
  const startX = segments[0]!.xRange[0]
  const targetX = segments[segments.length - 1]!.xRange[1]

  function findSegmentAt(x: number): PathSegmentRuntime | null {
    for (let i = segments.length - 1; i >= 0; i--) {
      const s = segments[i]!
      const [lo, hi] = s.xRange
      if (x >= lo && x <= hi) return s
    }
    return null
  }

  function evaluateAt(x: number): number {
    const s = findSegmentAt(x)
    if (!s) {
      throw new RangeError(
        `SegmentedPath.evaluateAt: x=${x} is outside [${startX}, ${targetX}].`,
      )
    }
    return s.evaluate(x)
  }

  return Object.freeze({ segments, startX, targetX, evaluateAt, findSegmentAt })
}
