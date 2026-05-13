/**
 * Unit tests for LevelLayoutService.
 */
import { describe, it, expect } from 'vitest'
import { createLevelLayoutService } from './level-layout-service'
import { buildLevelPath } from '@/domain/path/path-builder'
import type { PathLayout } from '@/data/path-segment-types'

function horizontalLevel(y: number, xLo: number, xHi: number): PathLayout {
  return {
    segments: [
      {
        id: 'h',
        kind: 'horizontal',
        xRange: [xLo, xHi],
        params: { kind: 'horizontal', y },
      },
    ],
  }
}

describe('LevelLayoutService', () => {
  it('classifies sampled path cells as "path"', () => {
    const path = buildLevelPath({ path: horizontalLevel(5, 0, 10) })
    const svc = createLevelLayoutService({ buildablePositions: [] }, path)
    for (let gx = 0; gx <= 10; gx++) {
      expect(svc.classify(gx, 5)).toBe('path')
    }
  })

  it('classifies whitelisted cells as "buildable"', () => {
    const path = buildLevelPath({ path: horizontalLevel(5, 0, 10) })
    const svc = createLevelLayoutService(
      { buildablePositions: [[2, 2], [3, 3]] },
      path,
    )
    expect(svc.classify(2, 2)).toBe('buildable')
    expect(svc.classify(3, 3)).toBe('buildable')
  })

  it('classifies unclassified cells as "forbidden"', () => {
    const path = buildLevelPath({ path: horizontalLevel(5, 0, 10) })
    const svc = createLevelLayoutService(
      { buildablePositions: [[2, 2]] },
      path,
    )
    expect(svc.classify(7, 7)).toBe('forbidden')
    expect(svc.classify(0, 0)).toBe('forbidden')
  })

  it('resolves path/buildable overlap to "path" deterministically', () => {
    const path = buildLevelPath({ path: horizontalLevel(5, 0, 10) })
    const svc = createLevelLayoutService(
      { buildablePositions: [[4, 5]] },
      path,
    )
    expect(svc.classify(4, 5)).toBe('path')
  })

  it('handles vertical segments by sampling y between yStart and yEnd', () => {
    const path = buildLevelPath({
      path: {
        segments: [
          {
            id: 'v',
            kind: 'vertical',
            xRange: [3, 3],
            params: {
              kind: 'vertical',
              x: 3,
              yStart: 2,
              yEnd: 6,
              durationSec: 1,
            },
          },
        ],
      },
    })
    const svc = createLevelLayoutService({ buildablePositions: [] }, path)
    for (let gy = 2; gy <= 6; gy++) {
      expect(svc.classify(3, gy)).toBe('path')
    }
    expect(svc.classify(3, 1)).toBe('forbidden')
    expect(svc.classify(3, 7)).toBe('forbidden')
  })
})
