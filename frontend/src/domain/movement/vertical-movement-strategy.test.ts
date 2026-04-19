import { describe, expect, it } from 'vitest'
import type { PathSegmentRuntime } from '@/domain/path/segmented-path'
import { verticalMovementStrategy } from './vertical-movement-strategy'

function segment(durationSec = 2): PathSegmentRuntime {
  return {
    id: 'v',
    kind: 'vertical',
    xRange: [5, 5],
    params: { kind: 'vertical', x: 5, yStart: 2, yEnd: 8, durationSec },
    evaluate: () => 8,
    expr: 'x = 5',
    label: 'v',
  }
}

describe('verticalMovementStrategy', () => {
  it('pins x to params.x and interpolates y over t', () => {
    const next = verticalMovementStrategy.advance(
      { x: 5, y: 2, t: 0 },
      segment(2),
      0.5,
      { speed: 0, direction: -1 },
    )
    expect(next.x).toBe(5)
    expect(next.t).toBeCloseTo(0.25, 10)
    expect(next.y).toBeCloseTo(2 + (8 - 2) * 0.25, 10)
  })

  it('reaches t = 1 exactly when the cumulative dt equals durationSec', () => {
    const seg = segment(1.5)
    let state = { x: 5, y: 2, t: 0 }
    const dt = 0.5
    for (let i = 0; i < 3; i++) {
      state = verticalMovementStrategy.advance(state, seg, dt, { speed: 0, direction: -1 })
    }
    expect(state.t).toBeCloseTo(1, 10)
    expect(state.y).toBeCloseTo(8, 10)
  })

  it('clamps t to 1 when dt overshoots the remaining duration', () => {
    const next = verticalMovementStrategy.advance(
      { x: 5, y: 2, t: 0 },
      segment(1),
      5,
      { speed: 0, direction: -1 },
    )
    expect(next.t).toBe(1)
    expect(next.y).toBe(8)
  })
})
