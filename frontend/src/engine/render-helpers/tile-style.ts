/**
 * Pure tile-style mapping.
 *
 * Maps a `TileClass` (from the domain layer) to a drawable style recipe. The
 * Renderer consumes the recipe; this helper never touches canvas, DOM, Vue,
 * or game state, which keeps the policy unit-testable and re-usable for
 * alternate renderers (e.g. DOM previews, tests). See spec §8.1.
 *
 * The palette deliberately mirrors `Colors` in `@/data/constants` so the
 * mages-tower art direction stays consistent when the renderer lays tiles
 * over the stone-floor checkerboard backdrop.
 *
 * Phase 8 accessibility pass (see `docs/playtest-notes-piecewise.md`):
 * the buildable border was retuned from amber (`#c89848`) to blue
 * (`#4a82c8`) — the same blue already used as the FunctionPanel curve
 * stroke, so this is palette-cohesive rather than a new colour — so it
 * remains distinguishable from the path's green border under deuteranopia
 * and protanopia, where the old green + amber pair converged toward the
 * same olive hue. The amber `#c89848` is the shared theme accent for
 * Probability Shrine, Fourier tower, and mid-zone HP bars; reusing it
 * for buildable borders overloaded the token. The buildable fill was
 * also lifted to widen the luminance gap against `forbidden`, since tile
 * fills are the primary legibility signal when the border is occluded
 * by a tower sprite.
 */
import type { TileClass } from '@/domain/level/level-layout-service'

export interface TileStyle {
  /** Base fill colour painted across the cell. */
  readonly fill: string
  /** Optional border colour; omit to skip the stroke. */
  readonly border?: string
  /**
   * Border stroke style. `'dotted'` is used for buildable cells to signal
   * "click here to place"; `'solid'` for path; omitted when there is no
   * border at all.
   */
  readonly borderStyle?: 'solid' | 'dotted'
  /**
   * When true, the renderer overlays a diagonal hatching pattern. Used for
   * forbidden cells so legality reads at a glance even in colour-blind modes.
   */
  readonly hatching?: boolean
}

/**
 * Resolve the drawable style for a classified tile.
 *
 * Invariants asserted by `tile-style.test.ts`:
 *   - `forbidden` carries `hatching: true`.
 *   - `buildable` carries `borderStyle: 'dotted'`.
 *   - `path` carries `borderStyle: 'solid'`.
 */
export function tileStyleFor(cls: TileClass): TileStyle {
  switch (cls) {
    case 'path':
      return {
        fill: '#2a3426',
        border: '#4aab6e',
        borderStyle: 'solid',
      }
    case 'buildable':
      return {
        fill: '#2f2a44',
        border: '#4a82c8',
        borderStyle: 'dotted',
      }
    case 'forbidden':
      return {
        fill: '#1a1520',
        hatching: true,
      }
  }
}
