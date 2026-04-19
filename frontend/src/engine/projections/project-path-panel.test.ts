/**
 * Unit tests for `projectPathPanel` (construction plan P5-T4).
 */
import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '@/engine/EventBus'
import { Events } from '@/data/constants'
import type { GameEvents } from '@/engine/Game'
import type { LevelContext } from '@/engine/level-context'
import type { PathSegmentRuntime } from '@/domain/path/segmented-path'
import {
  projectPathPanel,
  type PathPanelStoreWriter,
  type PathSegmentView,
} from './project-path-panel'

function makeSegment(id: string, lo: number, hi: number): PathSegmentRuntime {
  return {
    id,
    kind: 'linear',
    xRange: [lo, hi],
    params: { kind: 'linear', slope: 0, intercept: 0 },
    evaluate: () => 0,
    expr: `expr:${id}`,
    label: `label:${id}`,
  }
}

const linearZeroParams = { kind: 'linear', slope: 0, intercept: 0 } as const

function makeContext(segments: ReadonlyArray<PathSegmentRuntime>): LevelContext {
  return {
    path: {
      segments,
      startX: segments[segments.length - 1]!.xRange[1],
      targetX: segments[0]!.xRange[0],
      evaluateAt: () => 0,
      findSegmentAt: () => null,
    },
    // Layout + tracker are not consulted by the projection; stub them.
    layout: { classify: () => 'forbidden' } as unknown as LevelContext['layout'],
    tracker: { update: () => {}, dispose: () => {} },
    dispose: () => {},
  }
}

function makeStore(): {
  store: PathPanelStoreWriter
  segments: { value: ReadonlyArray<PathSegmentView> }
  current: { value: string | null }
} {
  const segments = { value: [] as ReadonlyArray<PathSegmentView> }
  const current = { value: null as string | null }
  const store: PathPanelStoreWriter = {
    setPathPanelSegments: (v) => { segments.value = v },
    setCurrentSegment: (id) => { current.value = id },
  }
  return { store, segments, current }
}

describe('projectPathPanel', () => {
  it('seeds segments and the initial current segment', () => {
    const bus = new EventBus<GameEvents>()
    const ctx = makeContext([makeSegment('s1', 0, 5), makeSegment('s2', 5, 10)])
    const { store, segments, current } = makeStore()

    projectPathPanel(ctx, bus, store)

    expect(segments.value).toHaveLength(2)
    expect(segments.value[0]).toMatchObject({
      id: 's1', label: 'label:s1', expr: 'expr:s1',
      xRange: [0, 5], params: linearZeroParams,
    })
    // Samples are uniformly distributed across xRange, endpoints inclusive.
    const samples0 = segments.value[0]!.samples
    expect(samples0.length).toBeGreaterThan(1)
    expect(samples0[0]!.x).toBe(0)
    expect(samples0[samples0.length - 1]!.x).toBe(5)
    expect(samples0.every((p) => p.y === 0)).toBe(true)
    expect(current.value).toBe('s1')
  })

  it('views survive JSON.stringify round-trip (no closures)', () => {
    const bus = new EventBus<GameEvents>()
    const ctx = makeContext([makeSegment('s1', 0, 5)])
    const { store, segments } = makeStore()

    projectPathPanel(ctx, bus, store)
    const roundTrip = JSON.parse(JSON.stringify(segments.value))
    expect(roundTrip).toHaveLength(1)
    expect(roundTrip[0]).toMatchObject({
      id: 's1', label: 'label:s1', expr: 'expr:s1',
      xRange: [0, 5], params: linearZeroParams,
    })
    expect(Array.isArray(roundTrip[0].samples)).toBe(true)
  })

  it('vertical segments collapse to a single-sample view', () => {
    const bus = new EventBus<GameEvents>()
    const vertical: PathSegmentRuntime = {
      id: 'v1',
      kind: 'vertical',
      xRange: [8, 8],
      params: { kind: 'vertical', x: 8, yStart: 2, yEnd: 6, durationSec: 1 },
      evaluate: () => 2,
      expr: 'vertical',
      label: 'V',
    }
    const ctx = makeContext([vertical])
    const { store, segments } = makeStore()
    projectPathPanel(ctx, bus, store)
    expect(segments.value[0]!.samples).toEqual([{ x: 8, y: 4 }])
  })

  it('updates currentSegmentId on SEGMENT_CHANGED', () => {
    const bus = new EventBus<GameEvents>()
    const ctx = makeContext([makeSegment('s1', 0, 5), makeSegment('s2', 5, 10)])
    const { store, current } = makeStore()

    projectPathPanel(ctx, bus, store)
    bus.emit(Events.SEGMENT_CHANGED, { fromId: 's1', toId: 's2' })
    expect(current.value).toBe('s2')
    bus.emit(Events.SEGMENT_CHANGED, { fromId: 's2', toId: null })
    expect(current.value).toBe(null)
  })

  it('unsubscribe stops further updates', () => {
    const bus = new EventBus<GameEvents>()
    const ctx = makeContext([makeSegment('s1', 0, 5), makeSegment('s2', 5, 10)])
    const { store, current } = makeStore()
    const spy = vi.spyOn(store, 'setCurrentSegment')

    const off = projectPathPanel(ctx, bus, store)
    spy.mockClear()
    off()
    bus.emit(Events.SEGMENT_CHANGED, { fromId: 's1', toId: 's2' })
    expect(spy).not.toHaveBeenCalled()
    expect(current.value).toBe('s1')
    // idempotent
    expect(() => off()).not.toThrow()
  })
})
