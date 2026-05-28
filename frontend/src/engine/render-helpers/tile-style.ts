/**
 * Pure tile-style mapping.
 *
 * Maps a `TileClass` (from the domain layer) to a drawable style recipe. The
 * Renderer consumes the recipe; this helper never touches canvas, DOM, Vue,
 * or game state, which keeps the policy unit-testable and re-usable for
 * alternate renderers (e.g. DOM previews, tests). See spec §8.1.
 *
 * Fills migrated to the Morandi light board palette to match the surrounding
 * HUD / panel surfaces (`styles/variables.css`). The categorical signal now
 * lives in the borders + hatching, not the fills — fills are intentionally
 * close in luminance so the board reads as one cohesive light surface.
 *
 * Phase 8 accessibility pass (see `docs/playtest-notes-piecewise.md`):
 * the buildable border was retuned from amber (`#c89848`) to blue
 * (`#4a82c8`) — the same blue already used as the FunctionPanel curve
 * stroke, so this is palette-cohesive rather than a new colour — so it
 * remains distinguishable from the path's green border under deuteranopia
 * and protanopia, where the old green + amber pair converged toward the
 * same olive hue. These borders are load-bearing for CVD accessibility:
 * do not change `path` green or `buildable` blue without re-verifying the
 * deuteranopia/protanopia distinction. Forbidden cells rely on the gray
 * diagonal hatching (drawn by the Renderer) rather than the fill — the
 * fill is intentionally light to match the rest of the board.
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
        fill: '#E3EAE0',       // --correct-bg : pale sage
        border: '#4aab6e',     // CVD-tuned green — DO NOT change without re-verification
        borderStyle: 'solid',
      }
    case 'buildable':
      return {
        fill: '#E8EFF5',       // --cream-soft : pale cool-blue
        border: '#4a82c8',     // CVD-tuned blue — DO NOT change without re-verification
        borderStyle: 'dotted',
      }
    case 'forbidden':
      return {
        fill: '#DCE5ED',       // blends with board; gray hatching is the primary signal
        hatching: true,
      }
  }
}
