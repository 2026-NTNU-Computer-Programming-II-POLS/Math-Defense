import { describe, expect, it } from 'vitest'
import type { PathSegmentRuntime } from './segmented-path'
import { createSegmentedPath } from './segmented-path'

function stub(
  id: string,
  xRange: [number, number],
  evaluate: (x: number) => number = () => 0,
): PathSegmentRuntime {
  return {
    id,
    kind: 'horizontal',
    xRange,
    params: { kind: 'horizontal', y: 0 },
    evaluate,
    evaluateDerivative: () => 0,
    expr: id,
    label: id,
  }
}

describe('createSegmentedPath', () => {
  it('throws when given no runtimes', () => {
    expect(() => createSegmentedPath([])).toThrow()
  })

  it('exposes startX (spawn=rightmost) and targetX (goal=leftmost) per game convention', () => {
    const path = createSegmentedPath([
      stub('a', [-3, 5]),
      stub('b', [5, 12]),
    ])
    // Segments are authored in ascending x order; startX is the spawn
    // side (highest x = last.xRange[1]) and targetX is the goal side
    // (lowest x = first.xRange[0]).
    expect(path.startX).toBe(12)
    expect(path.targetX).toBe(-3)
  })

  it('findSegmentAt returns the enclosing segment for in-range x', () => {
    const path = createSegmentedPath([
      stub('a', [0, 5]),
      stub('b', [5, 10]),
    ])
    expect(path.findSegmentAt(2)!.id).toBe('a')
    expect(path.findSegmentAt(8)!.id).toBe('b')
  })

  it('findSegmentAt returns null when x is outside the path', () => {
    const path = createSegmentedPath([stub('only', [0, 5])])
    expect(path.findSegmentAt(-1)).toBeNull()
    expect(path.findSegmentAt(5.1)).toBeNull()
  })

  it('findSegmentAt resolves an interior boundary to the right-hand segment', () => {
    const path = createSegmentedPath([
      stub('left', [0, 5]),
      stub('right', [5, 10]),
    ])
    expect(path.findSegmentAt(5)!.id).toBe('right')
  })

  it('findSegmentAt resolves the last segment at its closing boundary', () => {
    const path = createSegmentedPath([
      stub('a', [0, 5]),
      stub('b', [5, 10]),
    ])
    expect(path.findSegmentAt(10)!.id).toBe('b')
  })

  it('evaluateAt delegates to the resolved segment', () => {
    const path = createSegmentedPath([
      stub('a', [0, 5], (x) => x + 1),
      stub('b', [5, 10], (x) => x * 2),
    ])
    expect(path.evaluateAt(2)).toBe(3)
    // boundary resolves to the right-hand segment: 5 * 2 = 10
    expect(path.evaluateAt(5)).toBe(10)
    expect(path.evaluateAt(7)).toBe(14)
  })

  it('evaluateAt throws a RangeError when x is out of range', () => {
    const path = createSegmentedPath([stub('only', [0, 5], () => 1)])
    expect(() => path.evaluateAt(-1)).toThrow(RangeError)
    expect(() => path.evaluateAt(6)).toThrow(RangeError)
  })

  it('returns a frozen object whose segment array cannot be mutated', () => {
    const path = createSegmentedPath([stub('a', [0, 5])])
    expect(Object.isFrozen(path)).toBe(true)
    expect(() => {
      ;(path.segments as unknown as PathSegmentRuntime[]).push(stub('x', [0, 0]))
    }).toThrow()
  })
})
