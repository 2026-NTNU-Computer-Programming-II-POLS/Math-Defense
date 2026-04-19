import { describe, expect, it } from 'vitest'
import type { PathSegmentRuntime } from './segmented-path'
import { createSegmentedPath } from './segmented-path'
import { createPathProgressTracker, type SegmentChangedPayload } from './path-progress-tracker'

function stub(id: string, xRange: [number, number]): PathSegmentRuntime {
  return {
    id,
    kind: 'horizontal',
    xRange,
    params: { kind: 'horizontal', y: 0 },
    evaluate: () => 0,
    expr: id,
    label: id,
  }
}

function threeSegmentPath() {
  return createSegmentedPath([
    stub('a', [0, 5]),
    stub('b', [5, 10]),
    stub('c', [10, 15]),
  ])
}

describe('createPathProgressTracker', () => {
  it('emits the initial transition from null to the first observed segment', () => {
    const events: SegmentChangedPayload[] = []
    const t = createPathProgressTracker(threeSegmentPath(), (p) => events.push(p))
    t.update(2)
    expect(events).toEqual([{ fromId: null, toId: 'a' }])
  })

  it('does not emit while leadX stays inside one segment', () => {
    const events: SegmentChangedPayload[] = []
    const t = createPathProgressTracker(threeSegmentPath(), (p) => events.push(p))
    t.update(2)
    t.update(3)
    t.update(4.99)
    expect(events).toHaveLength(1)
  })

  it('emits exactly once when leadX crosses a single boundary', () => {
    const events: SegmentChangedPayload[] = []
    const t = createPathProgressTracker(threeSegmentPath(), (p) => events.push(p))
    t.update(2) // null -> a
    t.update(6) // a -> b
    expect(events).toEqual([
      { fromId: null, toId: 'a' },
      { fromId: 'a', toId: 'b' },
    ])
  })

  it('emits one transition per boundary when leadX spans multiple segments in one tick', () => {
    const events: SegmentChangedPayload[] = []
    const t = createPathProgressTracker(threeSegmentPath(), (p) => events.push(p))
    t.update(2)  // null -> a
    t.update(13) // a -> b, then b -> c
    expect(events).toEqual([
      { fromId: null, toId: 'a' },
      { fromId: 'a', toId: 'b' },
      { fromId: 'b', toId: 'c' },
    ])
  })

  it('dispose halts subsequent emits', () => {
    const events: SegmentChangedPayload[] = []
    const t = createPathProgressTracker(threeSegmentPath(), (p) => events.push(p))
    t.update(2)
    t.dispose()
    t.update(7)
    t.update(13)
    expect(events).toHaveLength(1)
  })

  it('emits a single transition when leadX moves out of the path bounds', () => {
    const events: SegmentChangedPayload[] = []
    const t = createPathProgressTracker(threeSegmentPath(), (p) => events.push(p))
    t.update(2)   // null -> a
    t.update(-1) // a -> null (outside)
    expect(events).toEqual([
      { fromId: null, toId: 'a' },
      { fromId: 'a', toId: null },
    ])
  })
})
