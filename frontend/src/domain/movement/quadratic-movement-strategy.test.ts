import { describe, expect, it } from 'vitest'
import type { PathSegmentRuntime } from '@/domain/path/segmented-path'
import { quadraticMovementStrategy } from './quadratic-movement-strategy'

function segment(): PathSegmentRuntime {
  const a = 0.25, b = -1, c = 3
  return {
    id: 'q',
    kind: 'quadratic',
    xRange: [-2, 6],
    params: { kind: 'quadratic', a, b, c },
    evaluate: (x) => a * x * x + b * x + c,
    expr: 'y = 0.25x^2 - x + 3',
    label: 'q',
  }
}

describe('quadraticMovementStrategy', () => {
  it('advances x and pins y to a*x^2 + b*x + c', () => {
    const next = quadraticMovementStrategy.advance(
      { x: 4, y: 3, t: 0 },
      segment(),
      1,
      { speed: 1, direction: -1 },
    )
    expect(next.x).toBeCloseTo(3, 10)
    // y = 0.25*9 - 3 + 3 = 2.25
    expect(next.y).toBeCloseTo(2.25, 10)
    expect(next.t).toBe(0)
  })
})
