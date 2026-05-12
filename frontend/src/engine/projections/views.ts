/**
 * Render-only view-models for engine entities (F-ARCH-4).
 *
 * Renderers consume these snapshots instead of reading entity internals
 * directly. Projection functions live alongside in `project-towers.ts` /
 * `project-enemies.ts` / `project-pets.ts` and run once per frame in the
 * renderer's render() pass — the cost is a flat object literal per entity,
 * well below the GC pressure of any of the per-frame canvas calls themselves.
 *
 * Rule of thumb for adding fields here: if a renderer needs to branch on
 * it or convert it to a pixel coordinate, expose it. If it would force
 * the renderer back into entity-internal logic, expand the projection
 * instead. See AUDIT_REPORT_2026-05-09.md F-ARCH-4 for the precedent.
 *
 * Appearance types (TowerAppearance, EnemyAppearance, PetTrait) are defined
 * here rather than imported from data/constants so renderers stay decoupled
 * from domain enums. The projection layer is responsible for the mapping.
 */
import type { GamePhase } from '@/data/constants'

// ── Appearance discriminants ─────────────────────────────────────────────────

export type TowerAppearance = 'magic' | 'radarA' | 'radarB' | 'radarC' | 'matrix' | 'limit' | 'calculus'
export type EnemyAppearance = 'general' | 'fast' | 'strong' | 'split' | 'helper' | 'bossA' | 'bossB'
export type PetTrait        = 'slow' | 'fast' | 'heavy' | 'basic'

// ── Tower views ──────────────────────────────────────────────────────────────

export interface TowerView {
  readonly x: number
  readonly y: number
  readonly type: TowerAppearance
  readonly color: string
  readonly configured: boolean
  readonly disabled: boolean
  /** Cached glyph from TOWER_DEFS — projection saves the renderer one lookup. */
  readonly glyph: string
}

// ── Enemy views ──────────────────────────────────────────────────────────────

export interface EnemyView {
  readonly x: number
  readonly y: number
  readonly type: EnemyAppearance
  readonly size: number
  readonly color: string
  /** 0..1 hp ratio, or null when full HP (renderer skips the bar). */
  readonly hpRatio: number | null
  /** 0..1 shield ratio, or null when there is no shield slot. */
  readonly shieldRatio: number | null
  /** Helper-aura radius in game units; 0 means no aura. */
  readonly helperRadius: number
}

// ── Pet views ────────────────────────────────────────────────────────────────

export interface PetView {
  readonly x: number
  readonly y: number
  readonly trait: PetTrait
  /** 0..1 hp ratio, or null when at full HP (renderer skips the bar). */
  readonly hpRatio: number | null
}

// ── Scene aggregates ─────────────────────────────────────────────────────────

export interface KeyboardCursorView {
  readonly gx: number
  readonly gy: number
}

export interface TowerSceneView {
  readonly phase: GamePhase
  readonly cursor: KeyboardCursorView | null
  readonly towers: ReadonlyArray<TowerView>
  /**
   * BUILD-phase coordinate label uses raw grid integers — renderers needed
   * tower.x / tower.y as ints. Kept on the view so renderer never reads the
   * entity directly.
   */
  readonly showCoords: boolean
}

export interface EnemySceneView {
  readonly enemies: ReadonlyArray<EnemyView>
}

export interface PetSceneView {
  readonly pets: ReadonlyArray<PetView>
}
