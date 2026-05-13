/**
 * Unit tests for `createLevelContext`.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  createLevelContext,
  LevelValidationError,
  type LevelContextEmitter,
} from './level-context'
import { Events } from '@/data/constants'
import type { PathLayout } from '@/data/path-segment-types'

function makeEmitter() {
  const emit = vi.fn()
  const bus: LevelContextEmitter = { emit }
  return { bus, emit }
}

function validLevel(): { path: PathLayout; buildablePositions: ReadonlyArray<readonly [number, number]> } {
  return {
    path: {
      segments: [
        {
          id: 's1',
          kind: 'linear',
          xRange: [0, 10],
          params: { kind: 'linear', slope: 0, intercept: 5 },
        },
      ],
    },
    buildablePositions: [[1, 1], [2, 2]],
  }
}

describe('createLevelContext', () => {
  it('wires up path, layout, and tracker for a valid level', () => {
    const { bus } = makeEmitter()
    const ctx = createLevelContext(validLevel(), bus)
    expect(ctx.path.segments).toHaveLength(1)
    expect(ctx.layout.classify(1, 1)).toBe('buildable')
    expect(ctx.layout.classify(5, 5)).toBe('path')
    expect(typeof ctx.tracker.update).toBe('function')
    expect(typeof ctx.dispose).toBe('function')
  })

  it('tracker emits SEGMENT_CHANGED through the event bus', () => {
    const { bus, emit } = makeEmitter()
    const ctx = createLevelContext(validLevel(), bus)
    ctx.tracker.update(5)
    expect(emit).toHaveBeenCalledWith(
      Events.SEGMENT_CHANGED,
      expect.objectContaining({ fromId: null, toId: 's1' }),
    )
  })

  it('in dev mode throws LevelValidationError for invalid levels', () => {
    const { bus } = makeEmitter()
    const bad: ReturnType<typeof validLevel> = {
      path: {
        segments: [
          {
            id: 'a',
            kind: 'linear',
            xRange: [0, 5],
            params: { kind: 'linear', slope: 0, intercept: 5 },
          },
          {
            id: 'b',
            kind: 'linear',
            // non-contiguous gap between 5 and 6
            xRange: [6, 10],
            params: { kind: 'linear', slope: 0, intercept: 5 },
          },
        ],
      },
      buildablePositions: [],
    }
    expect(() => createLevelContext(bad, bus)).toThrow(LevelValidationError)
  })

  it('dispose() stops further tracker emissions', () => {
    const { bus, emit } = makeEmitter()
    const ctx = createLevelContext(validLevel(), bus)
    ctx.dispose()
    emit.mockClear()
    ctx.tracker.update(5)
    expect(emit).not.toHaveBeenCalled()
  })

  it('dispose() is idempotent', () => {
    const { bus } = makeEmitter()
    const ctx = createLevelContext(validLevel(), bus)
    expect(() => {
      ctx.dispose()
      ctx.dispose()
    }).not.toThrow()
  })
})
