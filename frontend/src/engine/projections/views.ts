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
export type EnemyAppearance =
  | 'general' | 'fast' | 'strong' | 'split' | 'helper' | 'bossA' | 'bossB'
  | 'regenerator' | 'bulwark' | 'swarmling'
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
  /**
   * Muzzle-flash age in seconds since the last TOWER_FIRED for this tower.
   * 0 at the instant of firing; renderer paints a fade while value is
   * below ANIM.TOWER_FIRE_FLASH. Defaults to a large number (no flash).
   */
  readonly firingFlashAge: number
  /**
   * Upgrade tier. Mirrors `tower.level` (1, 2, 3+). Renderer draws T2 gold rim
   * on the baseplate at >= 2 and a rotating outer rune ring at >= 3.
   * Visual Redesign Phase 3.
   */
  readonly level: number
  /**
   * Stable per-tower seed for idle-animation phase, so adjacent towers do not
   * pulse in unison. Derived once in the projection from `seedFor(tower.id)`.
   */
  readonly idleSeed: number
  /**
   * Radar arc bounds in radians. 0 / π/2 default for non-radar towers; the
   * RadarRangeRenderer / instrument body reads these to draw the player's
   * configured arc. Visual Redesign Phase 5b.
   */
  readonly arcStart: number
  readonly arcEnd: number
  /**
   * Angle (radians) to the nearest in-range enemy. Populated for Radar B
   * (rapid) and Radar C (sniper) so the brass-telescope body can visibly
   * track its target, and for the Calculus tower so its `dx`/`dy` shed
   * particles fly along the aim vector on fire. Null when no enemy is in
   * range or for tower types whose silhouette does not rotate / aim.
   * Visual Redesign Phase 5b, extended in 5e.
   */
  readonly aimAngle: number | null
  /**
   * Four scrolling-digit values (0..9) for the Matrix tower's 2×2 bracket
   * cells, laid out [NW, NE, SW, SE]. Populated only for MATRIX towers;
   * null for all other types. Derived deterministically from game.time and
   * seedFor(tower.id) inside the projection — no system tick needed.
   * Visual Redesign Phase 5c.
   */
  readonly matrixCells: readonly number[] | null
  /**
   * 0..1 charge progress for towers that gate their fire behind a cooldown
   * "charge" window. Populated for LIMIT (Phase 6 Q8 burst design): 0 right
   * after a burst, 1 just before the next burst. Null for tower types that
   * do not telegraph charge state — those keep their time-driven idle anim.
   *
   * Derived from `1 - cooldownTimer / cooldown`, clamped to [0, 1]. Only
   * populated when the tower is configured and active; unconfigured LIMIT
   * towers project null so the renderer can keep its hint sawtooth.
   */
  readonly chargeProgress: number | null
}

// ── Enemy views ──────────────────────────────────────────────────────────────

export interface EnemyView {
  readonly x: number
  readonly y: number
  readonly type: EnemyAppearance
  readonly size: number
  readonly color: string
  /** 0..1 frost visual intensity while speed-reduction effects are active. */
  readonly frostRatio: number
  /** 0..1 hp ratio, or null when full HP (renderer skips the bar). */
  readonly hpRatio: number | null
  /** 0..1 shield ratio, or null when there is no shield slot. */
  readonly shieldRatio: number | null
  /** Helper-aura radius in game units; 0 means no aura. */
  readonly helperRadius: number
  /** True while a Regenerator is below max HP and actively healing. */
  readonly regenerating: boolean
  /**
   * Death-animation progress in [0, 1]. 0 means the enemy is alive and being
   * rendered normally; > 0 means the enemy is in the post-kill display
   * window and the renderer should paint it as a fading corpse. The
   * EnemyView still includes dying enemies so the corpse is drawn until the
   * window expires (Visual Redesign Phase 0).
   */
  readonly dyingProgress: number
  /** 0..1 hit-flash intensity (1 at the moment of impact). 0 when idle. */
  readonly hitFlashAge: number
}

// ── Pet views ────────────────────────────────────────────────────────────────

export interface PetView {
  readonly x: number
  readonly y: number
  readonly trait: PetTrait
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

// ── Matrix laser views ───────────────────────────────────────────────────────

export interface MatrixLaserPairView {
  readonly towerX: number
  readonly towerY: number
  readonly pairX: number
  readonly pairY: number
  readonly color: string
  /** null when the laser is idle (no active targets or invalid pair geometry). */
  readonly laser: {
    readonly rampTime: number
    readonly targets: ReadonlyArray<{ readonly x: number; readonly y: number }>
  } | null
}

// ── Magic zone views ─────────────────────────────────────────────────────────

export interface MagicZoneView {
  readonly x: number
  readonly y: number
  readonly range: number
  readonly mode: 'debuff' | 'buff'
  /** Tower identity colour — the zone is tinted with the tower's own hue. */
  readonly color: string
  /** Evaluated curve function for the tower's expression. */
  readonly curve: (x: number) => number
  /**
   * Half-thickness of the influence band along the y-axis, in game units.
   * Mirrors the system-side `zoneWidth * (BUFF_ZONE_MULTIPLIER on buff)` so
   * the rendered band matches the actual hit region (including talent mods).
   */
  readonly zoneHalfWidth: number
}
