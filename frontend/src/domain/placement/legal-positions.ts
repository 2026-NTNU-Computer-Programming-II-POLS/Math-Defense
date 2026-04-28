import {
  GRID_MIN_X, GRID_MAX_X,
  GRID_MIN_Y, GRID_MAX_Y,
  GRID_POINT_SPACING, GRID_PATH_CLEARANCE,
} from '@/data/constants'
import type { SegmentedPath } from '@/domain/path/segmented-path'

export interface LegalPositionSet {
  has(gx: number, gy: number): boolean
  readonly positions: ReadonlyArray<readonly [number, number]>
}

export interface LegalPositionsInput {
  /** One or more SegmentedPaths — towers cannot sit on/near any of them. */
  readonly paths: ReadonlyArray<SegmentedPath>
  /** Decoy cells: not on a real path but still forbidden for placement. */
  readonly decoyCells?: ReadonlyArray<readonly [number, number]>
}

export function computeLegalPositions(
  input: SegmentedPath | LegalPositionsInput,
): LegalPositionSet {
  const { paths, decoyCells } = normalizeInput(input)
  const decoySet = new Set<string>()
  if (decoyCells) {
    for (const [gx, gy] of decoyCells) decoySet.add(`${gx},${gy}`)
  }

  const legal: [number, number][] = []
  const keySet = new Set<string>()

  for (let gx = GRID_MIN_X; gx <= GRID_MAX_X; gx += GRID_POINT_SPACING) {
    for (let gy = GRID_MIN_Y; gy <= GRID_MAX_Y; gy += GRID_POINT_SPACING) {
      if (decoySet.has(`${gx},${gy}`)) continue
      let blocked = false
      for (const p of paths) {
        if (isTooCloseToPath(gx, gy, p)) { blocked = true; break }
      }
      if (blocked) continue
      legal.push([gx, gy])
      keySet.add(`${gx},${gy}`)
    }
  }

  return {
    has: (gx, gy) => keySet.has(`${gx},${gy}`),
    positions: legal,
  }
}

function normalizeInput(input: SegmentedPath | LegalPositionsInput): LegalPositionsInput {
  if ('paths' in input) return input
  return { paths: [input] }
}

function isTooCloseToPath(px: number, py: number, path: SegmentedPath): boolean {
  const clearance = GRID_PATH_CLEARANCE
  for (const seg of path.segments) {
    if (seg.params.kind === 'vertical') {
      const vx = seg.params.x
      const yStart = Math.min(seg.params.yStart, seg.params.yEnd)
      const yEnd = Math.max(seg.params.yStart, seg.params.yEnd)
      if (py >= yStart - clearance && py <= yEnd + clearance) {
        if (Math.abs(px - vx) < clearance) return true
      }
      continue
    }
    const [lo, hi] = seg.xRange
    const sampleStep = 0.5
    for (let x = lo; x <= hi; x += sampleStep) {
      const y = seg.evaluate(x)
      const dx = px - x
      const dy = py - y
      if (dx * dx + dy * dy < clearance * clearance) return true
    }
  }
  return false
}
