import { describe, expect, it } from 'vitest'
import type { PathSegmentRuntime } from '@/domain/path/segmented-path'
import { horizontalMovementStrategy } from './horizontal-movement-strategy'

function segment(): PathSegmentRuntime {
  return {
    id: 'h',
    kind: 'horizontal',
    xRange: [0, 10],
    params: { kind: 'horizontal', y: 4 },
    evaluate: () => 4,
    expr: 'y = 4',
    label: 'h',
  }
}

describe('horizontalMovementStrategy', () => {
  it('advances x by direction * speed * dt and pins y from segment.evaluate', () => {
    const next = horizontalMovementStrategy.advance(
      { x: 6, y: 4, t: 0 },
      segment(),
      0.5,
      { speed: 2, direction: -1 },
    )
    expect(next.x).toBeCloseTo(5, 10)
    expect(next.y).toBe(4)
    expect(next.t).toBe(0)
  })

  it('supports positive direction', () => {
    const next = horizontalMovementStrategy.advance(
      { x: 1, y: 4, t: 0 },
      segment(),
      1,
      { speed: 3, direction: 1 },
    )
    expect(next.x).toBeCloseTo(4, 10)
    expect(next.y).toBe(4)
  })
})
