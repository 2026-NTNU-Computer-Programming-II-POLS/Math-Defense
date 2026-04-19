/**
 * Level layout service.
 *
 * Precomputes a grid-cell classification once per level so renderer and
 * placement-policy lookups are O(1). `classify(gx, gy)` is the single
 * authority for tile categories (path / buildable / forbidden); the
 * renderer never re-derives these classes inline. See spec §6.4.
 *
 * The service is pure domain: it takes a `SegmentedPath` and a
 * `buildablePositions` list and knows nothing of Vue, Pinia, or the
 * engine. Overlap between path and buildable is the validator's concern
 * (`path-validator.ts` emits `buildable-overlaps-path`); at runtime the
 * path classification wins for determinism if an overlap slipped through.
 */
import {
  GRID_MAX_X,
  GRID_MAX_Y,
  GRID_MIN_X,
  GRID_MIN_Y,
} from '@/data/constants'
import type { SegmentedPath, PathSegmentRuntime } from '@/domain/path/segmented-path'

export type TileClass = 'path' | 'buildable' | 'forbidden'

export interface LevelLayoutSource {
  readonly buildablePositions: ReadonlyArray<readonly [number, number]>
}

export interface LevelLayoutService {
  classify(gx: number, gy: number): TileClass
  readonly pathCellCount: number
  readonly buildableCellCount: number
}

const SAMPLE_STEP = 1

/**
 * Build an immutable layout service from a level source + resolved path.
 *
 * Path cells are sampled at integer grid resolution. For x-parameterized
 * segments we step `x` across `xRange` and round `evaluate(x)` to the
 * nearest grid cell. Vertical segments are x-constant, so we sample along
 * `y` between `yStart` and `yEnd` at the segment's fixed integer `x`.
 *
 * Path classification wins over buildable when a cell lands in both
 * sets — at runtime we surface a deterministic answer rather than rely
 * on the validator having run.
 */
export function createLevelLayoutService(
  level: LevelLayoutSource,
  path: SegmentedPath,
): LevelLayoutService {
  const pathCells = derivePathCells(path.segments)
  const buildableCells = deriveBuildableCells(level.buildablePositions)

  function classify(gx: number, gy: number): TileClass {
    const key = cellKey(gx, gy)
    if (pathCells.has(key)) return 'path'
    if (buildableCells.has(key)) return 'buildable'
    return 'forbidden'
  }

  return Object.freeze({
    classify,
    pathCellCount: pathCells.size,
    buildableCellCount: buildableCells.size,
  })
}

function derivePathCells(
  segments: ReadonlyArray<PathSegmentRuntime>,
): Set<string> {
  const cells = new Set<string>()
  for (const s of segments) {
    if (s.params.kind === 'vertical') {
      const { x, yStart, yEnd } = s.params
      const gx = Math.round(x)
      if (gx < GRID_MIN_X || gx >= GRID_MAX_X) continue
      const lo = Math.min(yStart, yEnd)
      const hi = Math.max(yStart, yEnd)
      const loGy = Math.max(Math.floor(lo), GRID_MIN_Y)
      const hiGy = Math.min(Math.ceil(hi), GRID_MAX_Y - 1)
      for (let gy = loGy; gy <= hiGy; gy++) {
        cells.add(cellKey(gx, gy))
      }
      continue
    }
    const [lo, hi] = s.xRange
    const loGx = Math.max(Math.ceil(lo), GRID_MIN_X)
    const hiGx = Math.min(Math.floor(hi), GRID_MAX_X - 1)
    for (let gx = loGx; gx <= hiGx; gx += SAMPLE_STEP) {
      const gy = Math.round(s.evaluate(gx))
      if (gy < GRID_MIN_Y || gy >= GRID_MAX_Y) continue
      cells.add(cellKey(gx, gy))
    }
  }
  return cells
}

function deriveBuildableCells(
  buildable: ReadonlyArray<readonly [number, number]>,
): Set<string> {
  const cells = new Set<string>()
  for (const [gx, gy] of buildable) {
    if (gx < GRID_MIN_X || gx >= GRID_MAX_X) continue
    if (gy < GRID_MIN_Y || gy >= GRID_MAX_Y) continue
    cells.add(cellKey(gx, gy))
  }
  return cells
}

function cellKey(gx: number, gy: number): string {
  return `${gx},${gy}`
}
