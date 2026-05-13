import { describe, expect, it } from 'vitest'
import type { PathSegmentDef } from '@/data/path-segment-types'
import type { ValidatableLevel } from './path-validator'
import { validateLevelPath } from './path-validator'

function level(
  segments: PathSegmentDef[],
  buildable: ReadonlyArray<readonly [number, number]> = [],
): ValidatableLevel {
  return { path: { segments }, buildablePositions: buildable }
}

// A safely in-world horizontal baseline segment reused by buildable tests.
const SAFE_BASE: PathSegmentDef = {
  id: 'base', kind: 'horizontal', xRange: [0, 20],
  params: { kind: 'horizontal', y: 5 },
}

describe('validateLevelPath', () => {
  describe('happy path', () => {
    it('returns no errors for a contiguous in-world path with disjoint buildable cells', () => {
      const errors = validateLevelPath(level(
        [
          { id: 's1', kind: 'horizontal', xRange: [0, 5],  params: { kind: 'horizontal', y: 5 } },
          { id: 's2', kind: 'vertical',   xRange: [5, 5],  params: { kind: 'vertical', x: 5, yStart: 5, yEnd: 8, durationSec: 1 } },
          { id: 's3', kind: 'horizontal', xRange: [5, 10], params: { kind: 'horizontal', y: 8 } },
        ],
        [[2, 2], [7, 10], [3, 11]],
      ))
      expect(errors).toEqual([])
    })
  })

  describe('duplicate-segment-id', () => {
    it('emits the code exactly once per repeated id', () => {
      const errors = validateLevelPath(level([
        { id: 'dup', kind: 'horizontal', xRange: [0, 5],  params: { kind: 'horizontal', y: 5 } },
        { id: 'dup', kind: 'horizontal', xRange: [5, 10], params: { kind: 'horizontal', y: 5 } },
      ]))
      const dup = errors.filter((e) => e.code === 'duplicate-segment-id')
      expect(dup).toEqual([{ code: 'duplicate-segment-id', id: 'dup' }])
    })
  })

  describe('non-contiguous', () => {
    it('emits gapAt at the trailing edge where the gap opens', () => {
      const errors = validateLevelPath(level([
        { id: 'a', kind: 'horizontal', xRange: [0, 5],  params: { kind: 'horizontal', y: 5 } },
        { id: 'b', kind: 'horizontal', xRange: [6, 10], params: { kind: 'horizontal', y: 5 } },
      ]))
      expect(errors).toContainEqual({ code: 'non-contiguous', gapAt: 5 })
    })

    it('accepts contiguity across a zero-width vertical segment', () => {
      const errors = validateLevelPath(level([
        { id: 'a', kind: 'horizontal', xRange: [0, 5],  params: { kind: 'horizontal', y: 5 } },
        { id: 'v', kind: 'vertical',   xRange: [5, 5],  params: { kind: 'vertical', x: 5, yStart: 5, yEnd: 9, durationSec: 1 } },
        { id: 'b', kind: 'horizontal', xRange: [5, 10], params: { kind: 'horizontal', y: 9 } },
      ]))
      expect(errors.filter((e) => e.code === 'non-contiguous')).toEqual([])
    })
  })

  describe('out-of-world', () => {
    it('emits the code with the offending sampled y at a segment endpoint', () => {
      const errors = validateLevelPath(level([
        // At x=0 the linear segment evaluates to y=-20, below GRID_MIN_Y (-14).
        { id: 's', kind: 'linear', xRange: [0, 10], params: { kind: 'linear', slope: 0, intercept: -20 } },
      ]))
      expect(errors).toContainEqual({ code: 'out-of-world', segmentId: 's', sampledY: -20 })
    })

    it('flags a vertical whose yEnd pokes above GRID_MAX_Y (14)', () => {
      const errors = validateLevelPath(level([
        { id: 'v', kind: 'vertical', xRange: [5, 5], params: { kind: 'vertical', x: 5, yStart: 5, yEnd: 20, durationSec: 1 } },
      ]))
      expect(errors.some((e) => e.code === 'out-of-world' && e.segmentId === 'v')).toBe(true)
    })
  })

  describe('buildable-out-of-bounds', () => {
    it('emits the code when a buildable cell is outside the grid on any axis', () => {
      const errors = validateLevelPath(level([SAFE_BASE], [[-50, 3], [100, 3], [3, -50], [3, 100]]))
      const bad = errors.filter((e) => e.code === 'buildable-out-of-bounds')
      expect(bad.map((e) => e.code === 'buildable-out-of-bounds' ? e.cell : null))
        .toEqual([[-50, 3], [100, 3], [3, -50], [3, 100]])
    })
  })

  describe('buildable-overlaps-path', () => {
    it('emits the code when a buildable cell coincides with a sampled path cell', () => {
      // SAFE_BASE is y=5 over x in [0,20]; (10,5) is directly on the path.
      const errors = validateLevelPath(level([SAFE_BASE], [[10, 5]]))
      expect(errors).toContainEqual({ code: 'buildable-overlaps-path', cell: [10, 5] })
    })

    it('flags cells covered by a vertical segment along its y range', () => {
      const errors = validateLevelPath(level(
        [
          { id: 'v', kind: 'vertical', xRange: [5, 5], params: { kind: 'vertical', x: 5, yStart: 2, yEnd: 6, durationSec: 1 } },
        ],
        [[5, 4]],
      ))
      expect(errors).toContainEqual({ code: 'buildable-overlaps-path', cell: [5, 4] })
    })
  })
})
