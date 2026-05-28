/**
 * Pure tile-style mapping.
 *
 * Maps a `TileClass` (from the domain layer) to a drawable style recipe. The
 * Renderer consumes the recipe; this helper never touches canvas, DOM, Vue,
 * or game state, which keeps the policy unit-testable and re-usable for
 * alternate renderers (e.g. DOM previews, tests). See spec §8.1.
 *
 * The board reads as a single light surface (one fill, `#DCE5ED`, the
 * board tone). Legality is encoded by exactly one signal: gray diagonal
 * hatching marks every cell where a tower is *prohibited*. Both `path`
 * (the enemy route) and `forbidden` carry that hatch; `buildable` is left
 * plain, so the absence of hatch is the "you may build here" cue. There
 * are no cell borders — placement legality on hover is shown separately by
 * the Renderer's `drawPlacementCursor` ring.
 */
import type { TileClass } from '@/domain/level/level-layout-service'

export interface TileStyle {
  /** Base fill colour painted across the cell. */
  readonly fill: string
  /** Optional border colour; omit to skip the stroke. */
  readonly border?: string
  /**
   * Border stroke style. Currently unused by any tile (cells are
   * borderless); retained so the Renderer's stroke path stays general.
   */
  readonly borderStyle?: 'solid' | 'dotted'
  /**
   * When true, the renderer overlays a gray diagonal hatch. Marks cells
   * where towers are prohibited (`path` and `forbidden`).
   */
  readonly hatching?: boolean
}

/**
 * Resolve the drawable style for a classified tile.
 *
 * Invariants asserted by `tile-style.test.ts`:
 *   - `forbidden` carries `hatching: true`.
 *   - `path` carries `hatching: true` (prohibited, same as forbidden).
 *   - `buildable` is plain: no border, no hatch.
 */
export function tileStyleFor(cls: TileClass): TileStyle {
  switch (cls) {
    case 'path':
      return {
        fill: '#DCE5ED',       // gray hatch (same as forbidden): towers prohibited
        hatching: true,
      }
    case 'buildable':
      return {
        fill: '#DCE5ED',       // plain board tone — buildable cells carry no border
      }
    case 'forbidden':
      return {
        fill: '#DCE5ED',       // blends with board; gray hatching is the primary signal
        hatching: true,
      }
  }
}
