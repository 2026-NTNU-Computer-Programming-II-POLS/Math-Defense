/**
 * Engine → presentation projection for the Function Panel HUD (spec §5.5,
 * §9 / construction plan P5-T3).
 *
 * Takes a `LevelContext` and a store-shaped writer, maps the path's
 * segments to closure-free `PathSegmentView` records, seeds the initial
 * current-segment, and subscribes to `SEGMENT_CHANGED` so the store stays
 * in sync as the lead enemy crosses boundaries. Returns an `unsubscribe`
 * that the composable calls on `LEVEL_END` (or when the tracker is
 * replaced) to detach the subscription.
 *
 * The store dependency is expressed as a structural interface so this
 * module does not import from `src/stores/` — the engine layer stays
 * decoupled from Pinia (plan §2 SoC matrix).
 */
import { Events } from '@/data/constants'
import type { PathSegmentParams } from '@/data/path-segment-types'
import type { GameEventBus } from '@/engine/Game'
import type { LevelContext } from '@/engine/level-context'

/**
 * Presentation-only view of one segment. Pure data — no closures — so the
 * array survives `JSON.stringify` (SoC rule 6). `params` is forwarded
 * verbatim from the declarative `PathSegmentDef` for callers that key
 * display behavior off of `params.kind`. `samples` is a pre-sampled set
 * of `(x, y)` points produced by invoking the domain closure at
 * projection time — letting the Function Panel render the curve shape
 * without importing any math itself.
 */
export interface PathSegmentSample {
  readonly x: number
  readonly y: number
}

export interface PathSegmentView {
  readonly id: string
  readonly label: string
  readonly expr: string
  readonly xRange: readonly [number, number]
  readonly params: PathSegmentParams
  readonly samples: ReadonlyArray<PathSegmentSample>
}

const PLOT_SAMPLE_STEPS = 48

/**
 * Minimal write surface the projection needs. Concrete stores (e.g.
 * `useGameStore()`) satisfy this structurally without an import here.
 */
export interface PathPanelStoreWriter {
  setPathPanelSegments(views: ReadonlyArray<PathSegmentView>): void
  setCurrentSegment(id: string | null): void
}

/**
 * Seed the store's `pathPanel` slice from `ctx` and keep it in sync with
 * segment-boundary transitions. Returns an `unsubscribe` that detaches
 * the event subscription; calling it is idempotent.
 */
export function projectPathPanel(
  ctx: LevelContext,
  eventBus: GameEventBus,
  store: PathPanelStoreWriter,
): () => void {
  const views: PathSegmentView[] = ctx.path.segments.map((s) => {
    const [lo, hi] = s.xRange
    const samples: PathSegmentSample[] = []
    // Vertical segments collapse to xRange [x, x]; sampling degenerates to
    // the midpoint of [yStart, yEnd] which is an acceptable visual
    // stand-in for a curve that can't be plotted against x.
    if (s.kind === 'vertical' && s.params.kind === 'vertical') {
      const yMid = (s.params.yStart + s.params.yEnd) / 2
      samples.push({ x: lo, y: yMid })
    } else {
      for (let i = 0; i <= PLOT_SAMPLE_STEPS; i++) {
        const t = i / PLOT_SAMPLE_STEPS
        const x = lo + (hi - lo) * t
        samples.push({ x, y: s.evaluate(x) })
      }
    }
    return {
      id: s.id,
      label: s.label,
      expr: s.expr,
      xRange: [lo, hi] as const,
      params: s.params,
      samples,
    }
  })
  store.setPathPanelSegments(views)
  store.setCurrentSegment(views[0]?.id ?? null)

  const off = eventBus.on(Events.SEGMENT_CHANGED, ({ toId }) => {
    store.setCurrentSegment(toId)
  })

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    off()
  }
}
