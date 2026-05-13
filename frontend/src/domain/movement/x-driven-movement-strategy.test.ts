import { describe, expect, it } from 'vitest'
import type { PathSegmentRuntime } from '@/domain/path/segmented-path'
import { xDrivenMovementStrategy } from './x-driven-movement-strategy'

function horizontalSegment(): PathSegmentRuntime {
  return {
    id: 'h',
    kind: 'horizontal',
    xRange: [0, 10],
    params: { kind: 'horizontal', y: 4 },
    evaluate: () => 4,
    evaluateDerivative: () => 0,
    expr: 'y = 4',
    label: 'h',
  }
}

function linearSegment(): PathSegmentRuntime {
  const slope = -0.5
  const intercept = 8
  return {
    id: 'l',
    kind: 'linear',
    xRange: [0, 10],
    params: { kind: 'linear', slope, intercept },
    evaluate: (x) => slope * x + intercept,
    evaluateDerivative: () => slope,
    expr: 'y = -0.5x + 8',
    label: 'l',
  }
}

function quadraticSegment(): PathSegmentRuntime {
  const a = 0.25, b = -1, c = 3
  return {
    id: 'q',
    kind: 'quadratic',
    xRange: [-2, 6],
    params: { kind: 'quadratic', a, b, c },
    evaluate: (x) => a * x * x + b * x + c,
    evaluateDerivative: (x) => 2 * a * x + b,
    expr: 'y = 0.25x^2 - x + 3',
    label: 'q',
  }
}

function trigSegment(): PathSegmentRuntime {
  const amplitude = 2, frequency = 0.5, phase = 0.3, offset = 5
  return {
    id: 't',
    kind: 'trigonometric',
    xRange: [0, 12],
    params: { kind: 'trigonometric', amplitude, frequency, phase, offset },
    evaluate: (x) => amplitude * Math.sin(frequency * x + phase) + offset,
    evaluateDerivative: (x) => amplitude * frequency * Math.cos(frequency * x + phase),
    expr: 't',
    label: 't',
  }
}

describe('xDrivenMovementStrategy', () => {
  it('flat segment: dx equals ds (no arc-length correction)', () => {
    const next = xDrivenMovementStrategy.advance(
      { x: 6, y: 4, t: 0 },
      horizontalSegment(),
      0.5,
      { speed: 2, direction: -1 },
    )
    expect(next.x).toBeCloseTo(5, 10)
    expect(next.y).toBe(4)
    expect(next.t).toBe(0)
  })

  it('supports positive direction', () => {
    const next = xDrivenMovementStrategy.advance(
      { x: 1, y: 4, t: 0 },
      horizontalSegment(),
      1,
      { speed: 3, direction: 1 },
    )
    expect(next.x).toBeCloseTo(4, 10)
    expect(next.y).toBe(4)
  })

  it('sloped segment: dx reduced by arc-length correction', () => {
    const next = xDrivenMovementStrategy.advance(
      { x: 4, y: 6, t: 0 },
      linearSegment(),
      0.5,
      { speed: 2, direction: -1 },
    )
    const expectedX = 4 - 1 / Math.sqrt(1.25)
    expect(next.x).toBeCloseTo(expectedX, 10)
    expect(next.y).toBeCloseTo(-0.5 * expectedX + 8, 10)
    expect(next.t).toBe(0)
  })

  it('quadratic segment: arc-length correction varies with position', () => {
    const a = 0.25, b = -1, c = 3
    const next = xDrivenMovementStrategy.advance(
      { x: 4, y: 3, t: 0 },
      quadraticSegment(),
      1,
      { speed: 1, direction: -1 },
    )
    // derivative at x=4: 2*0.25*4 - 1 = 1; dx = 1/sqrt(1+1) = 1/sqrt(2)
    const expectedX = 4 - 1 / Math.sqrt(2)
    expect(next.x).toBeCloseTo(expectedX, 10)
    expect(next.y).toBeCloseTo(a * expectedX * expectedX + b * expectedX + c, 10)
    expect(next.t).toBe(0)
  })

  it('trig segment: arc-length correction uses cosine derivative', () => {
    const s = trigSegment()
    const next = xDrivenMovementStrategy.advance(
      { x: 4, y: s.evaluate(4), t: 0 },
      s,
      0.5,
      { speed: 2, direction: -1 },
    )
    const dydx = Math.cos(2.3)
    const dx = 1 / Math.sqrt(1 + dydx * dydx)
    const expectedX = 4 - dx
    expect(next.x).toBeCloseTo(expectedX, 10)
    expect(next.y).toBeCloseTo(2 * Math.sin(0.5 * expectedX + 0.3) + 5, 10)
    expect(next.t).toBe(0)
  })
})
