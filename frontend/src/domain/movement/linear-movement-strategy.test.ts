import { describe, expect, it } from 'vitest'
import type { PathSegmentRuntime } from '@/domain/path/segmented-path'
import { linearMovementStrategy } from './linear-movement-strategy'

function segment(): PathSegmentRuntime {
  const slope = -0.5
  const intercept = 8
  return {
    id: 'l',
    kind: 'linear',
    xRange: [0, 10],
    params: { kind: 'linear', slope, intercept },
    evaluate: (x) => slope * x + intercept,
    expr: 'y = -0.5x + 8',
    label: 'l',
  }
}

describe('linearMovementStrategy', () => {
  it('advances x and pins y to slope*x + intercept', () => {
    const next = linearMovementStrategy.advance(
      { x: 4, y: 6, t: 0 },
      segment(),
      0.5,
      { speed: 2, direction: -1 },
    )
    expect(next.x).toBeCloseTo(3, 10)
    // y = -0.5 * 3 + 8 = 6.5
    expect(next.y).toBeCloseTo(6.5, 10)
    expect(next.t).toBe(0)
  })
})
