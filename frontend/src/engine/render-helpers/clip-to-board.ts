/**
 * Apply a clip path matching the painted grid extent (see `Renderer.drawGrid`
 * — `gameToCanvasX(gx) ± UNIT_PX/2` per cell).
 *
 * Range / AoE renderers — `MagicZoneRenderer` curve band, `RadarRangeRenderer`
 * range ring + focus arc, `LimitBurstRenderer` shockwave — call this between
 * `ctx.save()` and `ctx.restore()` so geometry that exceeds the grid stops at
 * the board edge instead of bleeding onto the cream backdrop. Two independent
 * sources produce this overflow:
 *
 *  * x-axis — `tower.effectiveRange` (Magic = 10, Radar C = 12) exceeds the
 *    distance to ±GRID_MAX_X (= 14) whenever a tower is placed off-centre.
 *  * y-axis (Magic only) — `f(x)` is player-typed and unbounded, so curves as
 *    plain as `x^2` or `2x` produce y-values past the grid before any
 *    halfWidth contribution.
 *
 * Enemies and towers never exist beyond the grid, so nothing real is hidden
 * by this clip — it's a pure visual correction.
 */
import {
  UNIT_PX,
  GRID_MIN_X, GRID_MAX_X, GRID_MIN_Y, GRID_MAX_Y,
} from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'

export function clipToBoard(ctx: CanvasRenderingContext2D): void {
  const half = UNIT_PX / 2
  const x = gameToCanvasX(GRID_MIN_X) - half
  const y = gameToCanvasY(GRID_MAX_Y) - half
  const w = gameToCanvasX(GRID_MAX_X) + half - x
  const h = gameToCanvasY(GRID_MIN_Y) + half - y
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
}
