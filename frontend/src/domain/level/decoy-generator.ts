/**
 * Decoy cell generator.
 *
 * A "decoy" is a grid lattice point that is not on (or near) any real path
 * but is presented to the player as if it were — same visual class, same
 * placement rule (towers cannot sit there). Decoys make the forbidden-tile
 * pattern non-revealing: the player cannot deduce the curves' shapes simply
 * by looking at where towers are blocked.
 *
 * Constraints:
 *   • A decoy must be at least `clearance` units away from every real path,
 *     otherwise it is indistinguishable from the surrounding path cells.
 *   • Decoys must not lie inside the disclosure region — that rectangle is
 *     dedicated to the "P* lives here" hint.
 *   • Decoys must be at least `MIN_DECOY_GAP` apart from each other so they
 *     do not visually clump into pseudo-paths.
 *
 * This module is pure domain: it reads SegmentedPath (its math closure only)
 * plus the disclosure rectangle, and emits cell coordinates. It does not
 * touch the engine, the renderer, or Vue.
 */
import {
  GRID_MAX_X, GRID_MAX_Y,
  GRID_MIN_X, GRID_MIN_Y,
  GRID_PATH_CLEARANCE,
} from '@/data/constants'
import type { DisclosureRegion } from '@/math/curve-types'
import type { SegmentedPath } from '@/domain/path/segmented-path'

const DECOY_PATH_FRACTION = 0.4
const DECOY_HARD_CAP = 35
const MIN_DECOY_GAP = 1.5
const DECOY_PATH_CLEARANCE = GRID_PATH_CLEARANCE + 0.5
const PATH_SAMPLE_STEP = 0.5

export interface DecoyGenerationInput {
  readonly paths: ReadonlyArray<SegmentedPath>
  readonly region: DisclosureRegion
  /** Defaults to `Math.random` — pass a seeded RNG to make decoys deterministic. */
  readonly rng?: () => number
}

/**
 * Pick a set of decoy lattice points. Quantity scales with the real-path cell
 * count (up to a hard cap) so densely-routed levels get more visual cover.
 */
export function generateDecoyCells(
  input: DecoyGenerationInput,
): ReadonlyArray<readonly [number, number]> {
  const { paths, region, rng = Math.random } = input

  const realPathCellCount = countRealPathCells(paths)
  const target = Math.min(DECOY_HARD_CAP, Math.round(realPathCellCount * DECOY_PATH_FRACTION))
  if (target <= 0) return []

  const candidates = collectCandidates(paths, region)
  shuffleInPlace(candidates, rng)
  return pickWithMinGap(candidates, target)
}

function countRealPathCells(paths: ReadonlyArray<SegmentedPath>): number {
  const cells = new Set<string>()
  for (const path of paths) {
    for (const seg of path.segments) {
      const [lo, hi] = seg.xRange
      for (let gx = Math.ceil(lo); gx <= Math.floor(hi); gx++) {
        const y = seg.evaluate(gx)
        if (!isFinite(y)) continue
        const gy = Math.round(y)
        if (gy < GRID_MIN_Y || gy >= GRID_MAX_Y) continue
        cells.add(`${gx},${gy}`)
      }
    }
  }
  return cells.size
}

function collectCandidates(
  paths: ReadonlyArray<SegmentedPath>,
  region: DisclosureRegion,
): [number, number][] {
  const out: [number, number][] = []
  for (let gx = GRID_MIN_X; gx < GRID_MAX_X; gx++) {
    for (let gy = GRID_MIN_Y; gy < GRID_MAX_Y; gy++) {
      if (insideRegion(gx, gy, region)) continue
      if (tooCloseToAnyPath(gx, gy, paths)) continue
      out.push([gx, gy])
    }
  }
  return out
}

function pickWithMinGap(
  shuffled: ReadonlyArray<readonly [number, number]>,
  target: number,
): ReadonlyArray<readonly [number, number]> {
  const picked: [number, number][] = []
  const minSquared = MIN_DECOY_GAP * MIN_DECOY_GAP
  for (const c of shuffled) {
    if (picked.length >= target) break
    let ok = true
    for (const p of picked) {
      const dx = p[0] - c[0]
      const dy = p[1] - c[1]
      if (dx * dx + dy * dy < minSquared) { ok = false; break }
    }
    if (ok) picked.push([c[0], c[1]])
  }
  return picked
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = arr[i]!
    arr[i] = arr[j]!
    arr[j] = tmp
  }
}

function insideRegion(gx: number, gy: number, region: DisclosureRegion): boolean {
  return gx >= region.xMin - 0.5
    && gx <= region.xMax + 0.5
    && gy >= region.yMin - 0.5
    && gy <= region.yMax + 0.5
}

function tooCloseToAnyPath(
  px: number,
  py: number,
  paths: ReadonlyArray<SegmentedPath>,
): boolean {
  const c2 = DECOY_PATH_CLEARANCE * DECOY_PATH_CLEARANCE
  for (const path of paths) {
    for (const seg of path.segments) {
      const [lo, hi] = seg.xRange
      for (let x = lo; x <= hi; x += PATH_SAMPLE_STEP) {
        const y = seg.evaluate(x)
        if (!isFinite(y)) continue
        const dx = px - x
        const dy = py - y
        if (dx * dx + dy * dy < c2) return true
      }
    }
  }
  return false
}
