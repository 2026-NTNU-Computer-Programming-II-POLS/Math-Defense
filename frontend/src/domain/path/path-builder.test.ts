import { describe, expect, it } from 'vitest'
import type { PathLayout, PathSegmentDef } from '@/data/path-segment-types'
import { buildLevelPath } from './path-builder'

function layout(segments: PathSegmentDef[]): { path: PathLayout } {
  return { path: { segments } }
}

describe('buildLevelPath', () => {
  it('produces a horizontal segment whose evaluate returns the constant y', () => {
    const path = buildLevelPath(layout([{
      id: 'h1',
      kind: 'horizontal',
      xRange: [0, 5],
      params: { kind: 'horizontal', y: 7 },
    }]))
    for (const x of [0, 1.5, 3, 5]) {
      expect(path.evaluateAt(x)).toBe(7)
    }
    expect(path.startX).toBe(0)
    expect(path.targetX).toBe(5)
  })

  it('produces a linear segment whose evaluate matches slope*x + intercept', () => {
    const path = buildLevelPath(layout([{
      id: 'l1',
      kind: 'linear',
      xRange: [0, 10],
      params: { kind: 'linear', slope: -0.5, intercept: 8 },
    }]))
    for (const x of [0, 2, 4, 10]) {
      expect(path.evaluateAt(x)).toBeCloseTo(-0.5 * x + 8, 10)
    }
  })

  it('produces a quadratic segment matching a*x^2 + b*x + c', () => {
    const path = buildLevelPath(layout([{
      id: 'q1',
      kind: 'quadratic',
      xRange: [-2, 6],
      params: { kind: 'quadratic', a: 0.25, b: -1, c: 3 },
    }]))
    for (const x of [-2, -1, 0, 3, 6]) {
      expect(path.evaluateAt(x)).toBeCloseTo(0.25 * x * x - x + 3, 10)
    }
  })

  it('produces a trigonometric segment matching A*sin(Bx + phase) + offset', () => {
    const A = 2, B = 0.5, phase = 0.3, offset = 5
    const path = buildLevelPath(layout([{
      id: 't1',
      kind: 'trigonometric',
      xRange: [0, 12],
      params: { kind: 'trigonometric', amplitude: A, frequency: B, phase, offset },
    }]))
    for (const x of [0, 1, 4, 7, 12]) {
      expect(path.evaluateAt(x)).toBeCloseTo(A * Math.sin(B * x + phase) + offset, 10)
    }
  })

  it('produces a vertical segment reporting the exit y for any x in range', () => {
    const path = buildLevelPath(layout([{
      id: 'v1',
      kind: 'vertical',
      xRange: [5, 5],
      params: { kind: 'vertical', x: 5, yStart: 2, yEnd: 9, durationSec: 1.5 },
    }]))
    expect(path.evaluateAt(5)).toBe(9)
    expect(path.segments).toHaveLength(1)
    expect(path.segments[0]!.expr).toContain('x = 5')
  })

  it('sets startX/targetX from the outer xRange of first and last segments', () => {
    const path = buildLevelPath(layout([
      {
        id: 'a', kind: 'linear', xRange: [-3, 2],
        params: { kind: 'linear', slope: 1, intercept: 0 },
      },
      {
        id: 'b', kind: 'linear', xRange: [2, 10],
        params: { kind: 'linear', slope: -1, intercept: 4 },
      },
    ]))
    expect(path.startX).toBe(-3)
    expect(path.targetX).toBe(10)
    expect(path.segments).toHaveLength(2)
  })

  it('uses the caller-provided expr/label when present, otherwise a default', () => {
    const path = buildLevelPath(layout([{
      id: 's1', kind: 'horizontal', xRange: [0, 3],
      params: { kind: 'horizontal', y: 4 },
      expr: 'custom expr', label: 'Custom Label',
    }]))
    expect(path.segments[0]!.expr).toBe('custom expr')
    expect(path.segments[0]!.label).toBe('Custom Label')

    const fallback = buildLevelPath(layout([{
      id: 's2', kind: 'horizontal', xRange: [0, 3],
      params: { kind: 'horizontal', y: 4 },
    }]))
    expect(fallback.segments[0]!.label).toBe('s2')
    expect(fallback.segments[0]!.expr).toContain('y = 4')
  })
})
