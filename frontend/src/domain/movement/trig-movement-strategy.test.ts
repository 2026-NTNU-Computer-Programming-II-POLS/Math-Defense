import { describe, expect, it } from 'vitest'
import type { PathSegmentRuntime } from '@/domain/path/segmented-path'
import { trigMovementStrategy } from './trig-movement-strategy'

function segment(): PathSegmentRuntime {
  const amplitude = 2, frequency = 0.5, phase = 0.3, offset = 5
  return {
    id: 't',
    kind: 'trigonometric',
    xRange: [0, 12],
    params: { kind: 'trigonometric', amplitude, frequency, phase, offset },
    evaluate: (x) => amplitude * Math.sin(frequency * x + phase) + offset,
    expr: 't',
    label: 't',
  }
}

describe('trigMovementStrategy', () => {
  it('advances x and pins y to A*sin(Bx + phase) + offset', () => {
    const s = segment()
    const next = trigMovementStrategy.advance(
      { x: 4, y: s.evaluate(4), t: 0 },
      s,
      0.5,
      { speed: 2, direction: -1 },
    )
    expect(next.x).toBeCloseTo(3, 10)
    expect(next.y).toBeCloseTo(2 * Math.sin(0.5 * 3 + 0.3) + 5, 10)
    expect(next.t).toBe(0)
  })
})
