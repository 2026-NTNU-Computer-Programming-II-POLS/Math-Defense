/**
 * curve-renderer snapshot tests for the §17 concrete-fading schedule.
 *
 * Captures the protocol calls (alpha, fillText invocations and stride) at
 * each opacity tier from the spec table, so a regression in the fade
 * algorithm shows up as a changed snapshot rather than as a silent visual
 * shift in-game.
 */
import { describe, expect, it } from 'vitest'
import { iaAccuracyToLabelOpacity, renderCurve, type CoordTransform } from './curve-renderer'
import type { CurveDefinition } from './curve-types'

interface CtxStub extends CanvasRenderingContext2D {
  alphas: number[]
  labels: string[]
}

function createCtxStub(): CtxStub {
  const noop = (..._args: unknown[]): void => {}
  const alphas: number[] = []
  const labels: string[] = []
  let _alpha = 1

  const ctx: Partial<CtxStub> = {
    alphas,
    labels,
    save: noop,
    restore: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    fillText: (text: string) => {
      // Capture the alpha live at the moment of label paint so we know which
      // tier the labels were drawn in.
      alphas.push(_alpha)
      labels.push(text)
    },
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineJoin: 'round',
    lineCap: 'round',
  }
  Object.defineProperty(ctx, 'globalAlpha', {
    get(): number { return _alpha },
    set(v: number) { _alpha = v },
  })
  return ctx as CtxStub
}

// y = x — coefficients are [slope, intercept] (see COEFFICIENT_BOUNDS in
// curve-types). Integer-x labels read off cleanly so each opacity tier
// produces a tractable snapshot.
const LINE_CURVE: CurveDefinition = {
  family: 'polynomial',
  degree: 1,
  coefficients: [1, 0],
}

const X_MIN = 0
const X_MAX = 5
const TO_CANVAS: CoordTransform = (gx, gy) => ({ x: gx, y: gy })

describe('renderCurve labelOpacity (spec §17.2)', () => {
  it('omits labels at opacity 0 (Star ≥ 2 / mastery)', () => {
    const ctx = createCtxStub()
    renderCurve(ctx, LINE_CURVE, X_MIN, X_MAX, TO_CANVAS, { labelOpacity: 0 })
    expect(ctx.labels).toEqual([])
    expect(ctx.alphas).toEqual([])
  })

  it('labels every integer x at full opacity (≤30% IA accuracy)', () => {
    const ctx = createCtxStub()
    renderCurve(ctx, LINE_CURVE, X_MIN, X_MAX, TO_CANVAS, { labelOpacity: 1.0 })
    expect(ctx.labels).toEqual(['y=0', 'y=1', 'y=2', 'y=3', 'y=4', 'y=5'])
    expect(ctx.alphas.every((a) => a === 1.0)).toBe(true)
  })

  it('labels every integer x at 0.6 opacity (30–60% IA accuracy)', () => {
    const ctx = createCtxStub()
    renderCurve(ctx, LINE_CURVE, X_MIN, X_MAX, TO_CANVAS, { labelOpacity: 0.6 })
    expect(ctx.labels).toEqual(['y=0', 'y=1', 'y=2', 'y=3', 'y=4', 'y=5'])
    expect(ctx.alphas.every((a) => a === 0.6)).toBe(true)
  })

  it('labels every other integer x at 0.3 opacity (60–80% IA accuracy)', () => {
    const ctx = createCtxStub()
    renderCurve(ctx, LINE_CURVE, X_MIN, X_MAX, TO_CANVAS, { labelOpacity: 0.3 })
    expect(ctx.labels).toEqual(['y=0', 'y=2', 'y=4'])
    expect(ctx.alphas.every((a) => a === 0.3)).toBe(true)
  })
})

describe('iaAccuracyToLabelOpacity', () => {
  it.each([
    [-0.1, 1.0],
    [0.0, 1.0],
    [0.3, 1.0],
    [0.31, 0.6],
    [0.6, 0.6],
    [0.61, 0.3],
    [0.8, 0.3],
    [0.81, 0],
    [1.0, 0],
  ])('accuracy=%s → opacity=%s', (acc, expected) => {
    expect(iaAccuracyToLabelOpacity(acc)).toBe(expected)
  })

  it('non-finite input falls back to fully labelled', () => {
    expect(iaAccuracyToLabelOpacity(Number.NaN)).toBe(1.0)
  })
})
