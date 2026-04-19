/**
 * Placement policy.
 *
 * Encodes the rules that decide whether a tower may be placed on a given
 * grid cell. `TowerPlacementSystem` is the mechanism that executes the
 * placement; `PlacementPolicy` is the policy that decides. Keeping the
 * two apart means a future level or mode can swap in a different policy
 * without touching the system's click-handling code (spec §6.5).
 *
 * Checks are ordered cheapest → most context-dependent:
 *   1. `not-buildable`     — layout classifier says the cell is not a
 *                            legal build site (path or forbidden).
 *   2. `occupied`          — a tower already stands on the cell.
 *   3. `insufficient-gold` — the player lacks the tower's cost.
 *
 * The order matters: when a cell is both non-buildable *and* unaffordable,
 * the cheapest check wins and the reason reported is `not-buildable`.
 * Authors of UI feedback can rely on this ordering.
 */
import type { LevelLayoutService } from './level-layout-service'

export type PlacementRejectionReason =
  | 'not-buildable'
  | 'occupied'
  | 'insufficient-gold'

export type PlacementDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: PlacementRejectionReason }

/**
 * Minimal context the policy reads when evaluating a click.
 *
 * The policy never reads from `Game` directly — callers compose this
 * object from the game state, which keeps the domain module free of
 * engine-layer imports.
 */
export interface PlacementContext {
  readonly layout: LevelLayoutService
  readonly isOccupied: (gx: number, gy: number) => boolean
  readonly gold: number
  readonly cost: number
}

export interface PlacementPolicy {
  canPlace(gx: number, gy: number, ctx: PlacementContext): PlacementDecision
}

/** Default policy implementing the three rejection reasons in spec order. */
export function createPlacementPolicy(): PlacementPolicy {
  return Object.freeze({
    canPlace(gx: number, gy: number, ctx: PlacementContext): PlacementDecision {
      if (ctx.layout.classify(gx, gy) !== 'buildable') {
        return { ok: false, reason: 'not-buildable' }
      }
      if (ctx.isOccupied(gx, gy)) {
        return { ok: false, reason: 'occupied' }
      }
      if (ctx.gold < ctx.cost) {
        return { ok: false, reason: 'insufficient-gold' }
      }
      return { ok: true }
    },
  })
}
