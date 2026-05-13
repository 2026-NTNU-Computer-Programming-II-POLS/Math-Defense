/**
 * Movement strategy registry.
 *
 * Dispatches `PathSegmentKind -> MovementStrategy`. Populated at module
 * load with the five built-in strategies; `registerStrategy` exists so a
 * test harness or future path kind can swap/extend without touching the
 * core table. `getStrategy` throws on an unknown kind — forgetting to
 * register a new kind should be a loud, early failure, not a silent
 * freeze (spec §6.6).
 */
import type { PathSegmentKind } from '@/data/path-segment-types'
import type { MovementStrategy } from './movement-strategy'
import { xDrivenMovementStrategy } from './x-driven-movement-strategy'
import { verticalMovementStrategy } from './vertical-movement-strategy'

const _registry = new Map<PathSegmentKind, MovementStrategy>()

export function registerStrategy(
  kind: PathSegmentKind,
  strategy: MovementStrategy,
): void {
  _registry.set(kind, strategy)
}

export function getStrategy(kind: PathSegmentKind): MovementStrategy {
  const s = _registry.get(kind)
  if (!s) {
    throw new Error(`No movement strategy registered for kind "${kind}".`)
  }
  return s
}

/** Test-only: restore the default table after a swap. */
export function resetStrategyRegistry(): void {
  _registry.clear()
  _populateDefaults()
}

function _populateDefaults(): void {
  _registry.set('horizontal', xDrivenMovementStrategy)
  _registry.set('linear', xDrivenMovementStrategy)
  _registry.set('quadratic', xDrivenMovementStrategy)
  _registry.set('trigonometric', xDrivenMovementStrategy)
  _registry.set('vertical', verticalMovementStrategy)
  _registry.set('curve', xDrivenMovementStrategy)
}

_populateDefaults()
