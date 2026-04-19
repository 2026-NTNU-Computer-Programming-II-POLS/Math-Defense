/**
 * Level context — per-level runtime holder.
 *
 * `LevelContext` is the single owner of everything derived from a
 * `LevelDef` once a level starts: the resolved `SegmentedPath`, the
 * precomputed `LevelLayoutService`, and the `PathProgressTracker` that
 * broadcasts segment-boundary transitions. `useGameLoop` creates one on
 * `LEVEL_START` and disposes it on `LEVEL_END` (spec §5.4 / §7.2).
 *
 * The engine layer owns this module because the context wires domain
 * services to the engine-level event bus. Domain modules never import
 * the eventBus directly; they communicate through the sink the context
 * hands them.
 */
import { Events } from '@/data/constants'
import { buildLevelPath } from '@/domain/path/path-builder'
import {
  validateLevelPath,
  type PathValidationError,
  type ValidatableLevel,
} from '@/domain/path/path-validator'
import type { SegmentedPath } from '@/domain/path/segmented-path'
import {
  createPathProgressTracker,
  type PathProgressTracker,
  type SegmentChangedPayload,
} from '@/domain/path/path-progress-tracker'
import {
  createLevelLayoutService,
  type LevelLayoutService,
} from '@/domain/level/level-layout-service'

/**
 * Minimal event-sink interface the context needs. Declared structurally
 * so this module does not import from `./Game` at runtime (breaks the
 * Game ↔ LevelContext type cycle cleanly).
 */
export interface LevelContextEmitter {
  emit(event: typeof Events.SEGMENT_CHANGED, payload: SegmentChangedPayload): void
}

export interface LevelContext {
  readonly path: SegmentedPath
  readonly layout: LevelLayoutService
  readonly tracker: PathProgressTracker
  dispose(): void
}

/**
 * Thrown by `createLevelContext` in dev builds when the level fails
 * `validateLevelPath`. Production builds skip the defensive assert and
 * assume CI (see `scripts/validate-levels.ts` from Phase 6) has already
 * caught structural issues.
 */
export class LevelValidationError extends Error {
  readonly errors: PathValidationError[]
  constructor(errors: PathValidationError[]) {
    super(
      `LevelContext: ${errors.length} validation error(s): ${errors
        .map((e) => e.code)
        .join(', ')}`,
    )
    this.errors = errors
    this.name = 'LevelValidationError'
  }
}

/**
 * Build a `LevelContext` for `level`, wiring `SEGMENT_CHANGED` emissions
 * into `eventBus`. Returns an object whose `dispose()` detaches the
 * tracker; subsequent `tracker.update` calls become no-ops.
 *
 * Dev-mode validation is a defensive assert — it runs once at level
 * start, not on every tick. `import.meta.env.DEV` is true during Vite
 * dev and in vitest runs; production `vite build` strips the branch.
 */
export function createLevelContext(
  level: ValidatableLevel,
  eventBus: LevelContextEmitter,
): LevelContext {
  if (import.meta.env.DEV) {
    const errors = validateLevelPath(level)
    if (errors.length > 0) throw new LevelValidationError(errors)
  }

  const path = buildLevelPath(level)
  const layout = createLevelLayoutService(level, path)
  const tracker = createPathProgressTracker(path, (payload) => {
    eventBus.emit(Events.SEGMENT_CHANGED, payload)
  })

  let disposed = false
  function dispose(): void {
    if (disposed) return
    disposed = true
    tracker.dispose()
  }

  return { path, layout, tracker, dispose }
}
