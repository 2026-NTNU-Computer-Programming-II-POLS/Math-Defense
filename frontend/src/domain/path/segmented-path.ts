/**
 * Runtime piecewise path.
 *
 * `SegmentedPath` is an immutable view over an ordered list of runtime
 * segments, each carrying its own `(x) => y` closure. It is produced by
 * `buildLevelPath` from a `PathLayout` and is never persisted — closures
 * cannot cross a serialization boundary (see spec §2.3 rule 6).
 */
import type { PathSegmentKind, PathSegmentParams } from '@/data/path-segment-types'

/**
 * One runtime segment: the declarative data plus a resolved math closure.
 *
 * `params` is forwarded verbatim from the source `PathSegmentDef` so that
 * per-kind movement strategies (see `domain/movement/`) can read kind-specific
 * configuration (e.g. the vertical strategy needs `yStart`, `yEnd`,
 * `durationSec`) without re-resolving the declarative layer. `evaluate`
 * remains the single x-indexed closure — strategies read `params` for
 * non-`x` kinematics only.
 */
export interface PathSegmentRuntime {
  readonly id: string
  readonly kind: PathSegmentKind
  readonly xRange: readonly [number, number]
  readonly params: PathSegmentParams
  readonly evaluate: (x: number) => number
  readonly evaluateDerivative: (x: number) => number
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
 * (higher-x) one. Implementation: scan segments right-to-left and return
 * the first whose inclusive `xRange` contains `x`.
 *
 * `startX` and `targetX` match the game's existing convention
 * (`EnemyFactory`: `startX = 20`, `targetX = 0`):
 *   - `startX` is the enemy **spawn** x — the rightmost edge of the path.
 *   - `targetX` is the enemy **goal** x — the leftmost edge of the path.
 *
 * Segments are authored in ascending x order (spec §10.4: Level 1 runs
 * `[-3, 8]` → `[8, 17]` → `[17, 25]`), so:
 *   - `startX = segments[last].xRange[1]`
 *   - `targetX = segments[0].xRange[0]`
 *
 * The enemy travels from `startX` toward `targetX`, which in this game
 * means decreasing x. Reversing game direction would require revisiting
 * these assignments (and `findSegmentAt`'s right-hand convention).
 */
export function createSegmentedPath(
  runtimes: ReadonlyArray<PathSegmentRuntime>,
): SegmentedPath {
  if (runtimes.length === 0) {
    throw new Error('createSegmentedPath requires at least one segment.')
  }
  const segments = Object.freeze(runtimes.slice()) as ReadonlyArray<PathSegmentRuntime>
  const startX = segments[segments.length - 1]!.xRange[1]
  const targetX = segments[0]!.xRange[0]

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
        `SegmentedPath.evaluateAt: x=${x} is outside [${targetX}, ${startX}].`,
      )
    }
    return s.evaluate(x)
  }

  return Object.freeze({ segments, startX, targetX, evaluateAt, findSegmentAt })
}
