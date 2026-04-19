/**
 * Validate a level's piecewise-path layout and its buildable cells.
 *
 * Pure and stateless. Returns an array of error records (empty = valid).
 * Error codes mirror spec §6.2 one-for-one. This module does not construct
 * a runtime `SegmentedPath`; it reads the declarative data directly so
 * validation errors reference `PathSegmentDef` ids and coordinates
 * without a detour through `buildLevelPath`.
 *
 * Callers: `scripts/validate-levels.ts` in CI (Phase 6) and, in dev
 * builds only, `createLevelContext` as a defensive assert (Phase 3).
 */
import {
  GRID_MAX_X,
  GRID_MAX_Y,
  GRID_MIN_X,
  GRID_MIN_Y,
} from '@/data/constants'
import type {
  PathLayout,
  PathSegmentDef,
  PathSegmentParams,
} from '@/data/path-segment-types'
import {
  makeHorizontal,
  makeLinear,
  makeQuadratic,
  makeTrigonometric,
} from './segment-factories'

/** Error shapes emitted by `validateLevelPath`. */
export type PathValidationError =
  | { code: 'non-contiguous';          gapAt: number }
  | { code: 'out-of-world';            segmentId: string; sampledY: number }
  | { code: 'buildable-overlaps-path'; cell: [number, number] }
  | { code: 'buildable-out-of-bounds'; cell: [number, number] }
  | { code: 'duplicate-segment-id';    id: string }

/**
 * Structural shape `validateLevelPath` reads from a level definition.
 * `LevelDef` gains these fields in Phase 6; the structural type here
 * lets the validator land in Phase 1 without touching `data/level-defs.ts`.
 */
export interface ValidatableLevel {
  readonly path: PathLayout
  readonly buildablePositions: ReadonlyArray<readonly [number, number]>
}

/**
 * Floating-point tolerance for boundary contiguity (`seg[i].xRange[1]`
 * vs `seg[i+1].xRange[0]`). Authors write integer coordinates today, so
 * this cushions against accidental decimal drift without masking real
 * gaps (smallest deliberate gap is 1 unit = grid cell).
 */
const CONTIGUITY_EPS = 1e-9

/** Grid sample step when searching for out-of-world y values. */
const SAMPLE_STEP = 1

export function validateLevelPath(level: ValidatableLevel): PathValidationError[] {
  const errors: PathValidationError[] = []
  const segments = level.path.segments

  collectDuplicateIds(segments, errors)
  collectContiguityErrors(segments, errors)
  collectOutOfWorldErrors(segments, errors)

  const pathCells = derivePathCells(segments)
  collectBuildableErrors(level.buildablePositions, pathCells, errors)

  return errors
}

function collectDuplicateIds(
  segments: ReadonlyArray<PathSegmentDef>,
  errors: PathValidationError[],
): void {
  const seen = new Set<string>()
  const reported = new Set<string>()
  for (const s of segments) {
    if (seen.has(s.id) && !reported.has(s.id)) {
      errors.push({ code: 'duplicate-segment-id', id: s.id })
      reported.add(s.id)
    }
    seen.add(s.id)
  }
}

function collectContiguityErrors(
  segments: ReadonlyArray<PathSegmentDef>,
  errors: PathValidationError[],
): void {
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1]!
    const curr = segments[i]!
    const prevEnd = prev.xRange[1]
    const currStart = curr.xRange[0]
    if (Math.abs(prevEnd - currStart) > CONTIGUITY_EPS) {
      errors.push({ code: 'non-contiguous', gapAt: prevEnd })
    }
  }
}

function collectOutOfWorldErrors(
  segments: ReadonlyArray<PathSegmentDef>,
  errors: PathValidationError[],
): void {
  for (const s of segments) {
    const reported = reportFirstOutOfWorld(s)
    if (reported !== null) {
      errors.push({ code: 'out-of-world', segmentId: s.id, sampledY: reported })
    }
  }
}

function reportFirstOutOfWorld(s: PathSegmentDef): number | null {
  if (s.params.kind === 'vertical') {
    const { yStart, yEnd } = s.params
    const lo = Math.min(yStart, yEnd)
    const hi = Math.max(yStart, yEnd)
    if (lo < GRID_MIN_Y) return lo
    if (hi > GRID_MAX_Y) return hi
    return null
  }
  const fn = makeNonVerticalEvaluator(s.params)
  const [lo, hi] = s.xRange
  // Endpoints first — that is where authors most often introduce out-of-world y.
  for (const x of [lo, hi]) {
    const y = fn(x)
    if (y < GRID_MIN_Y || y > GRID_MAX_Y) return y
  }
  for (let x = Math.ceil(lo); x <= Math.floor(hi); x += SAMPLE_STEP) {
    const y = fn(x)
    if (y < GRID_MIN_Y || y > GRID_MAX_Y) return y
  }
  return null
}

function makeNonVerticalEvaluator(params: PathSegmentParams): (x: number) => number {
  switch (params.kind) {
    case 'horizontal':    return makeHorizontal(params)
    case 'linear':        return makeLinear(params)
    case 'quadratic':     return makeQuadratic(params)
    case 'trigonometric': return makeTrigonometric(params)
    case 'vertical':
      throw new Error('makeNonVerticalEvaluator: vertical kind passed to non-vertical sampler.')
  }
}

function derivePathCells(segments: ReadonlyArray<PathSegmentDef>): Set<string> {
  const cells = new Set<string>()
  for (const s of segments) {
    if (s.params.kind === 'vertical') {
      const gx = Math.round(s.params.x)
      const lo = Math.min(s.params.yStart, s.params.yEnd)
      const hi = Math.max(s.params.yStart, s.params.yEnd)
      for (let gy = Math.floor(lo); gy <= Math.ceil(hi); gy++) {
        cells.add(cellKey(gx, gy))
      }
      continue
    }
    const fn = makeNonVerticalEvaluator(s.params)
    const [lo, hi] = s.xRange
    for (let gx = Math.ceil(lo); gx <= Math.floor(hi); gx += SAMPLE_STEP) {
      cells.add(cellKey(gx, Math.round(fn(gx))))
    }
  }
  return cells
}

function collectBuildableErrors(
  buildable: ReadonlyArray<readonly [number, number]>,
  pathCells: ReadonlySet<string>,
  errors: PathValidationError[],
): void {
  for (const [gx, gy] of buildable) {
    if (gx < GRID_MIN_X || gx >= GRID_MAX_X || gy < GRID_MIN_Y || gy >= GRID_MAX_Y) {
      errors.push({ code: 'buildable-out-of-bounds', cell: [gx, gy] })
      continue
    }
    if (pathCells.has(cellKey(gx, gy))) {
      errors.push({ code: 'buildable-overlaps-path', cell: [gx, gy] })
    }
  }
}

function cellKey(gx: number, gy: number): string {
  return `${gx},${gy}`
}
