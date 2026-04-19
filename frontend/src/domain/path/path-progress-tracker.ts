/**
 * Path progress tracker.
 *
 * Owns segment-boundary detection for a single `SegmentedPath`. The caller
 * feeds the "lead enemy" x each tick; the tracker compares the resolved
 * segment against the previously-resolved one and emits exactly one
 * `SEGMENT_CHANGED` per boundary crossed — including the case where a
 * very-large `dt` skips over intermediate segments (one emit per
 * boundary; see spec §6.3).
 *
 * The tracker is domain-layer: it does not import from `systems/` or
 * `engine/`. It takes a plain callback as its event sink so the engine
 * layer adapts a game-specific event bus at wiring time.
 */
import type { SegmentedPath } from './segmented-path'

export interface SegmentChangedPayload {
  readonly fromId: string | null
  readonly toId: string | null
}

export type SegmentChangedSink = (payload: SegmentChangedPayload) => void

export interface PathProgressTracker {
  /** Feed the lead enemy's current x; emits once per boundary crossed. */
  update(leadX: number): void
  /** Stop emitting. Idempotent; subsequent `update` calls are no-ops. */
  dispose(): void
}

/**
 * Build a tracker over `path`, forwarding transitions to `onSegmentChanged`.
 *
 * Transition detection is prev-vs-current lookup: we resolve the current
 * segment by index and walk from the previous segment's index toward it,
 * emitting one payload per step. A null prev (first tick) or null current
 * (leadX outside the path) collapses to a single emit — there is no
 * meaningful "intermediate" boundary in that case.
 */
export function createPathProgressTracker(
  path: SegmentedPath,
  onSegmentChanged: SegmentChangedSink,
): PathProgressTracker {
  const segments = path.segments
  let lastSegmentId: string | null = null
  let disposed = false

  function indexOfId(id: string | null): number {
    if (id === null) return -1
    for (let i = 0; i < segments.length; i++) {
      if (segments[i]!.id === id) return i
    }
    return -1
  }

  function update(leadX: number): void {
    if (disposed) return
    const cur = path.findSegmentAt(leadX)
    const curId = cur?.id ?? null
    if (curId === lastSegmentId) return

    const prevIdx = indexOfId(lastSegmentId)
    const curIdx = cur ? indexOfId(curId) : -1

    // Crossing into/out of the path bounds, or initial entry: single emit.
    // There is no natural "intermediate" segment to interpolate across.
    if (prevIdx === -1 || curIdx === -1) {
      onSegmentChanged({ fromId: lastSegmentId, toId: curId })
      lastSegmentId = curId
      return
    }

    // Both indices known: emit once per adjacency step so skipping
    // segments at very-large dt still reports every boundary crossed.
    const step = curIdx > prevIdx ? 1 : -1
    for (let i = prevIdx; i !== curIdx; i += step) {
      const fromId = segments[i]!.id
      const toId = segments[i + step]!.id
      onSegmentChanged({ fromId, toId })
    }
    lastSegmentId = curId
  }

  function dispose(): void {
    disposed = true
  }

  return { update, dispose }
}
