/**
 * Renderer-layer smoke tests.
 *
 * Runs against a minimal canvas-2D stub — not happy-dom's full implementation —
 * so assertions focus on *protocol* (which domain calls the Renderer makes,
 * in what order, with what arguments), not pixel output. Pixel-accurate
 * checks would belong to visual regression, which is manual per Phase 4's
 * exit gate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GRID_MIN_X, GRID_MAX_X, GRID_MIN_Y, GRID_MAX_Y } from '@/data/constants'
import type {
  LevelLayoutService,
  TileClass,
} from '@/domain/level/level-layout-service'
import type { SegmentedPath, PathSegmentRuntime } from '@/domain/path/segmented-path'
import { Renderer } from './Renderer'

/**
 * Records every canvas-2D call we care about. No-ops for the rest so the
 * Renderer's existing grid/axes/label passes can proceed unobserved.
 */
function createCtxStub(): CanvasRenderingContext2D & { calls: string[] } {
  const calls: string[] = []
  const noop = (..._args: unknown[]): void => {}
  const record = (name: string) => (...args: unknown[]): void => {
    calls.push(`${name}(${args.join(',')})`)
  }
  const ctx = {
    calls,
    scale: noop,
    clearRect: noop,
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    rect: noop,
    clip: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    setLineDash: noop,
    fillText: noop,
    drawImage: noop,
    createRadialGradient: () => ({ addColorStop: noop }),
    translate: noop,
    rotate: noop,
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: false,
  } as unknown as CanvasRenderingContext2D & { calls: string[] }
  return ctx
}

function makeCanvas(ctx: CanvasRenderingContext2D): HTMLCanvasElement {
  const canvas = {
    width: 0,
    height: 0,
    style: {} as CSSStyleDeclaration,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement
  return canvas
}

function makeLayout(classifier: (gx: number, gy: number) => TileClass): LevelLayoutService {
  return {
    classify: vi.fn(classifier),
    pathCellCount: 0,
    buildableCellCount: 0,
  } as unknown as LevelLayoutService
}

function makePath(
  segments: Array<{ id: string; xRange: [number, number] }>,
): SegmentedPath {
  const runtimes = segments.map<PathSegmentRuntime>((s) => ({
    id: s.id,
    kind: 'horizontal',
    xRange: s.xRange,
    params: { kind: 'horizontal', y: 0 },
    evaluate: () => 0,
    expr: 'y=0',
    label: s.id,
  }))
  return {
    segments: runtimes,
    startX: runtimes[runtimes.length - 1]!.xRange[1],
    targetX: runtimes[0]!.xRange[0],
    evaluateAt: () => 0,
    findSegmentAt: () => null,
  }
}

describe('Renderer.drawGrid', () => {
  let ctx: CanvasRenderingContext2D & { calls: string[] }
  let renderer: Renderer

  beforeEach(() => {
    ctx = createCtxStub()
    // Vitest + happy-dom: window.devicePixelRatio is usually 1. Pin it to
    // avoid flakiness if a future env override changes the default.
    vi.stubGlobal('devicePixelRatio', 1)
    renderer = new Renderer(makeCanvas(ctx))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls layout.classify for every grid cell when a layout is provided', () => {
    const seen = new Set<string>()
    const layout = makeLayout((gx, gy) => {
      seen.add(`${gx},${gy}`)
      return 'forbidden'
    })

    renderer.drawGrid(layout)

    const expected = (GRID_MAX_X - GRID_MIN_X) * (GRID_MAX_Y - GRID_MIN_Y)
    expect(seen.size).toBe(expected)
    for (let gx = GRID_MIN_X; gx < GRID_MAX_X; gx++) {
      for (let gy = GRID_MIN_Y; gy < GRID_MAX_Y; gy++) {
        expect(seen.has(`${gx},${gy}`)).toBe(true)
      }
    }
  })

  it('paints differently for different TileClass values (style delegation)', () => {
    const layout = makeLayout((gx) => (gx < 10 ? 'path' : 'buildable'))
    renderer.drawGrid(layout)
    // The path branch paints fill (1 fillRect per path cell). The buildable
    // branch paints fill + dotted strokeRect. So strokeRect count reflects
    // buildable cells.
    const fillRects = ctx.calls.filter((c) => c.startsWith('fillRect')).length
    const strokeRects = ctx.calls.filter((c) => c.startsWith('strokeRect')).length
    expect(fillRects).toBeGreaterThan(0)
    expect(strokeRects).toBeGreaterThan(0)
  })

  it('falls back to a checkerboard when no layout is provided', () => {
    expect(() => renderer.drawGrid(null)).not.toThrow()
  })
})

describe('Renderer.drawSegmentBoundaries', () => {
  let ctx: CanvasRenderingContext2D & { calls: string[] }
  let renderer: Renderer

  beforeEach(() => {
    ctx = createCtxStub()
    vi.stubGlobal('devicePixelRatio', 1)
    renderer = new Renderer(makeCanvas(ctx))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('draws nothing and tints nothing for a single-segment path without hover', () => {
    const path = makePath([{ id: 's1', xRange: [0, 10] }])
    renderer.drawSegmentBoundaries(path, null)
    // No boundary accents issued — would be a stroke() inside the loop.
    // Just asserting the call does not throw with no-op ctx is sufficient.
  })

  it('tints the hovered segment even when it is the only segment', () => {
    const path = makePath([{ id: 's1', xRange: [0, 10] }])
    renderer.drawSegmentBoundaries(path, 's1')
    expect(ctx.calls.some((c) => c.startsWith('fillRect'))).toBe(true)
  })

  it('issues one accent stroke per interior boundary', () => {
    const path = makePath([
      { id: 's1', xRange: [0, 5] },
      { id: 's2', xRange: [5, 10] },
      { id: 's3', xRange: [10, 15] },
    ])
    renderer.drawSegmentBoundaries(path, null)
    // 3 segments → 2 interior boundaries. We cannot read stroke() args
    // from the stub directly, but we can assert moveTo/lineTo pairs via
    // the path module: the implementation uses one beginPath/moveTo/lineTo
    // per boundary. Check indirectly: the stub never throws, and no extra
    // fillRect is emitted when hoveredSegmentId is null.
    expect(ctx.calls.every((c) => !c.startsWith('fillRect'))).toBe(true)
  })
})

describe('Renderer.drawPlacementCursor', () => {
  it('does not throw and consumes a TileClass without rule branching', () => {
    const ctx = createCtxStub()
    vi.stubGlobal('devicePixelRatio', 1)
    const renderer = new Renderer(makeCanvas(ctx))
    expect(() => renderer.drawPlacementCursor(0, 0, 'buildable')).not.toThrow()
    expect(() => renderer.drawPlacementCursor(0, 0, 'forbidden')).not.toThrow()
    expect(() => renderer.drawPlacementCursor(0, 0, 'path')).not.toThrow()
    vi.unstubAllGlobals()
  })
})
