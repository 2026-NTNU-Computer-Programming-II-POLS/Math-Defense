/**
 * Renderer — Canvas rendering primitives (TypeScript)
 * Responsible only for low-level drawing; holds no game state.
 */
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, UNIT_PX,
  GRID_MIN_X, GRID_MAX_X, GRID_MIN_Y, GRID_MAX_Y,
} from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import type { LevelLayoutService, TileClass } from '@/domain/level/level-layout-service'
import type { SegmentedPath } from '@/domain/path/segmented-path'
import { tileStyleFor, type TileStyle } from './render-helpers/tile-style'

/**
 * Which edges of a single tile should be stroked. Set when the neighbour
 * across that edge is a different `TileClass` (or off-grid). Building this
 * once per cell and passing it to `_applyTileStyle` lets contiguous regions
 * read as one clean outline instead of a noisy grid of per-cell rectangles.
 */
interface TileEdges {
  readonly top: boolean
  readonly bottom: boolean
  readonly left: boolean
  readonly right: boolean
}

/**
 * Renderer palette. Two concerns live here:
 *
 *  1. Board ink (`boardBase` / `boardBaseAlt` / `boardAxis` / `gridLine` /
 *     `forbiddenFill`) — Morandi cool-blue light theme. Aligns the canvas
 *     backdrop with the surrounding HUD / panel surfaces in
 *     `styles/variables.css` so the game board reads as the same visual
 *     system instead of a separate dark dungeon.
 *
 *  2. Tower ink (`stoneDark` / `stoneLight` / `axis`) — medium-tone values
 *     read by `TowerRenderer` for instrument structure strokes, base-plate
 *     fill, and the keyboard-focus halo. These are kept on the historical
 *     dungeon-era hex values so the tower silhouettes still register against
 *     their tower-type colour. The legacy names are preserved because
 *     touching `TowerRenderer` is out of scope for the board re-skin pass;
 *     do not assume `stoneDark` is the board's dark stone any more.
 *
 * Bright accents that encode categorical meaning (path green, buildable
 * blue, enemy red) live in `tile-style.ts` and the entity factories — not
 * here.
 */
export interface RendererPalette {
  /** Tower instrument structure stroke (legacy name; not the board's base). */
  readonly stoneDark: string
  /** Tower base-plate fill + soft accents (legacy name; not the board's alt). */
  readonly stoneLight: string
  /** Tower keyboard-focus halo (legacy name; not the board axis colour). */
  readonly axis: string
  /** Board checkerboard base — canvas clear + dark-cell stone fill. */
  readonly boardBase: string
  /** Board checkerboard alt — light-cell stone fill. */
  readonly boardBaseAlt: string
  /** Board coordinate axes + tick labels. */
  readonly boardAxis: string
  /** Board grid lines (low-alpha charcoal — graph-paper feel). */
  readonly gridLine: string
  /** Forbidden-cell base fill (gray hatching from `_applyTileStyle` overlays). */
  readonly forbiddenFill: string
  /** Forbidden-cell diagonal hatch stroke (slate gray — the primary signal). */
  readonly forbiddenHatch: string
}

const BOARD_PALETTE: RendererPalette = Object.freeze({
  // Tower ink — restored to legacy values so TowerRenderer keeps its bite.
  stoneDark: '#7a8da8',
  stoneLight: '#8ea1bd',
  axis: '#ffd700',
  // Board ink — Morandi light re-skin.
  boardBase: '#DCE5ED',      // --cream      : checkerboard base
  boardBaseAlt: '#E8EFF5',   // --cream-soft : checkerboard alt
  boardAxis: '#ADA284',      // --gold       : muted khaki axes / ticks
  gridLine: 'rgba(79, 74, 72, 0.18)', // --divider : graph-paper thin lines
  forbiddenFill: '#DCE5ED',  // blends with board; gray hatch is the signal
  forbiddenHatch: 'rgba(122, 141, 168, 0.55)', // stoneDark hue — diagonal stripes
})

export class Renderer {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D

  /** Single board palette — Morandi light theme. No per-star variation. */
  readonly palette: RendererPalette = BOARD_PALETTE

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get 2D context')
    this.ctx = ctx

    this._applyDpr()
  }

  /** Build the backing buffer at the current devicePixelRatio. */
  private _applyDpr(): void {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    this.canvas.width = CANVAS_WIDTH * dpr
    this.canvas.height = CANVAS_HEIGHT * dpr
    this.canvas.style.width = `${CANVAS_WIDTH}px`
    this.canvas.style.height = `${CANVAS_HEIGHT}px`
    // `setTransform` (rather than a second `scale`) keeps the transform
    // stack idempotent across repeated calls — consecutive resyncs would
    // otherwise compound the scale on each monitor hop. Test doubles that
    // omit `setTransform` fall through to `scale`, which is fine under
    // construction but inaccurate after a subsequent resync (acceptable for
    // unit tests — browsers always have setTransform).
    if (typeof this.ctx.setTransform === 'function') {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    } else {
      this.ctx.scale(dpr, dpr)
    }
    this.ctx.imageSmoothingEnabled = false
  }

  /** K-1: rebuild the backing store when DPR changes (monitor switch).
   * CSS size stays pinned to 1280×720; only the pixel buffer is resized. */
  resyncDpr(): void {
    this._applyDpr()
  }

  clear(): void {
    this.ctx.fillStyle = this.palette.boardBase
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  }

  drawGrid(layout: LevelLayoutService | null = null): void {
    const { ctx } = this

    // Tile fills. When a LevelLayoutService is available we delegate every
    // cell's category to `layout.classify` — the Renderer never re-derives
    // path/buildable/forbidden inline (spec §8, plan §6.3 SoC Gate). Without
    // a layout (pre-level-start, or flag-off legacy path) we fall back to
    // the stone checkerboard so the grid never renders as an empty void.
    // Tiles are centred on lattice points, not anchored to a cell corner.
    // Towers stand on grid-line intersections (see `drawPlacementCursor`), so
    // a tile must mark the *point* a tower will occupy. Corner-anchoring
    // offset every tile half a unit from its tower, so a 'buildable' fill
    // visually covered a different lattice point than the one a click in its
    // centre resolved to. Iterating GRID_MIN..GRID_MAX inclusive keeps the
    // edge points (which `classify` now answers for) painted.
    const half = UNIT_PX / 2
    for (let gx = GRID_MIN_X; gx <= GRID_MAX_X; gx++) {
      for (let gy = GRID_MIN_Y; gy <= GRID_MAX_Y; gy++) {
        const px = gameToCanvasX(gx) - half
        const py = gameToCanvasY(gy) - half
        if (layout) {
          this._paintTile(px, py, gx, gy, layout.classify(gx, gy), layout)
        } else {
          ctx.fillStyle = (gx + gy) % 2 === 0 ? this.palette.boardBase : this.palette.boardBaseAlt
          ctx.fillRect(px, py, UNIT_PX, UNIT_PX)
        }
      }
    }

    // Grid lines (thin charcoal — graph-paper feel on the Morandi board)
    ctx.strokeStyle = this.palette.gridLine
    ctx.lineWidth = 0.5
    ctx.beginPath()
    for (let gx = GRID_MIN_X; gx <= GRID_MAX_X; gx++) {
      const px = gameToCanvasX(gx)
      ctx.moveTo(px, gameToCanvasY(GRID_MAX_Y))
      ctx.lineTo(px, gameToCanvasY(GRID_MIN_Y))
    }
    for (let gy = GRID_MIN_Y; gy <= GRID_MAX_Y; gy++) {
      const py = gameToCanvasY(gy)
      ctx.moveTo(gameToCanvasX(GRID_MIN_X), py)
      ctx.lineTo(gameToCanvasX(GRID_MAX_X), py)
    }
    ctx.stroke()

    // Coordinate axes (muted Morandi gold)
    ctx.strokeStyle = this.palette.boardAxis
    ctx.lineWidth = 2
    ctx.beginPath()
    const xAxisY = gameToCanvasY(0)
    ctx.moveTo(gameToCanvasX(GRID_MIN_X), xAxisY)
    ctx.lineTo(gameToCanvasX(GRID_MAX_X), xAxisY)
    const yAxisX = gameToCanvasX(0)
    ctx.moveTo(yAxisX, gameToCanvasY(GRID_MIN_Y))
    ctx.lineTo(yAxisX, gameToCanvasY(GRID_MAX_Y))
    ctx.stroke()

    // Tick labels
    ctx.fillStyle = this.palette.boardAxis
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let gx = GRID_MIN_X; gx <= GRID_MAX_X; gx += 2) {
      if (gx === 0) continue
      ctx.fillText(String(gx), gameToCanvasX(gx), xAxisY + 4)
    }
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let gy = GRID_MIN_Y; gy <= GRID_MAX_Y; gy += 2) {
      if (gy === 0) continue
      ctx.fillText(String(gy), yAxisX - 6, gameToCanvasY(gy))
    }
    ctx.fillStyle = this.palette.boardAxis
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillText('O', yAxisX - 6, xAxisY + 4)
  }

  /**
   * Paint a single classified tile at canvas `(px, py)` (top-left corner,
   * cell size = `UNIT_PX`). The style recipe comes from `tileStyleFor`;
   * this method owns the canvas-specific translation (hatching → diagonal
   * strokes, dotted borders → dashed `stroke`). Private so tests can stub
   * `drawGrid` end-to-end without re-implementing the paint protocol.
   *
   * Borders are drawn one edge at a time, and only on edges whose neighbour
   * is a different `TileClass`. Without this, adjacent same-class cells each
   * stroke their full rectangle, producing a noisy grid of dotted/solid
   * boxes; with it, contiguous regions read as a single clean perimeter.
   */
  private _paintTile(
    px: number, py: number,
    gx: number, gy: number,
    cls: TileClass,
    layout: LevelLayoutService,
  ): void {
    const style = tileStyleFor(cls)
    // Forbidden cells source their base fill from the board palette so the
    // backdrop colour has a single source of truth. Path/buildable carry
    // categorical meaning and keep their tile-style fills.
    const effective = cls === 'forbidden'
      ? { ...style, fill: this.palette.forbiddenFill }
      : style

    // Game y increases upward; canvas y increases downward. Hence the
    // visually-top edge of a canvas cell faces game (gx, gy + 1).
    const sameClass = (ngx: number, ngy: number): boolean => {
      if (ngx < GRID_MIN_X || ngx > GRID_MAX_X) return false
      if (ngy < GRID_MIN_Y || ngy > GRID_MAX_Y) return false
      return layout.classify(ngx, ngy) === cls
    }
    const edges: TileEdges = {
      top:    !sameClass(gx, gy + 1),
      bottom: !sameClass(gx, gy - 1),
      left:   !sameClass(gx - 1, gy),
      right:  !sameClass(gx + 1, gy),
    }

    this._applyTileStyle(px, py, effective, edges)
  }

  private _applyTileStyle(
    px: number, py: number,
    style: TileStyle,
    edges: TileEdges,
  ): void {
    const { ctx } = this
    ctx.fillStyle = style.fill
    ctx.fillRect(px, py, UNIT_PX, UNIT_PX)

    if (style.hatching) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(px, py, UNIT_PX, UNIT_PX)
      ctx.clip()
      ctx.strokeStyle = this.palette.forbiddenHatch
      ctx.lineWidth = 1
      const step = 4
      for (let off = -UNIT_PX; off < UNIT_PX; off += step) {
        ctx.beginPath()
        ctx.moveTo(px + off, py + UNIT_PX)
        ctx.lineTo(px + off + UNIT_PX, py)
        ctx.stroke()
      }
      ctx.restore()
    }

    const anyEdge = edges.top || edges.bottom || edges.left || edges.right
    if (style.border && style.borderStyle && anyEdge) {
      ctx.save()
      ctx.strokeStyle = style.border
      ctx.lineWidth = 1
      // Inset by 0.5 so the 1px stroke renders crisply on integer pixel rows.
      const x0 = px + 0.5
      const y0 = py + 0.5
      const x1 = px + UNIT_PX - 0.5
      const y1 = py + UNIT_PX - 0.5

      if (style.borderStyle === 'dotted') {
        // Phase-align dashes to absolute canvas coords so adjacent cells'
        // dotted outlines stitch together cleanly instead of resetting the
        // dash rhythm every UNIT_PX. Canvas resets the dash phase on each
        // moveTo, so horizontal and vertical edges need separate strokes
        // with their own `lineDashOffset`.
        const DASH = [2, 3] as const
        const PERIOD = 5
        ctx.setLineDash([...DASH])
        if (edges.top || edges.bottom) {
          ctx.lineDashOffset = x0 % PERIOD
          ctx.beginPath()
          if (edges.top)    { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0) }
          if (edges.bottom) { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1) }
          ctx.stroke()
        }
        if (edges.left || edges.right) {
          ctx.lineDashOffset = y0 % PERIOD
          ctx.beginPath()
          if (edges.left)  { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1) }
          if (edges.right) { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1) }
          ctx.stroke()
        }
      } else {
        ctx.setLineDash([])
        ctx.beginPath()
        if (edges.top)    { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0) }
        if (edges.bottom) { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1) }
        if (edges.left)   { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1) }
        if (edges.right)  { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1) }
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  /**
   * Draw an overlay highlight for the cell at game coordinate `(gx, gy)`
   * using the `TileClass` legality cue. Called by `TowerPlacementSystem`
   * while a tower type is selected so the classification shown under the
   * cursor agrees with `drawGrid` — the single authority stays
   * `LevelLayoutService.classify`. Intentionally NOT a rule check; the
   * caller passes in the already-classified value.
   */
  /**
   * Highlight the grid-line intersection at lattice point (gx, gy). Towers
   * sit on intersections, not inside cells, so the cursor is a ring centered
   * on the point — not a cell-sized rectangle.
   */
  drawPlacementCursor(gx: number, gy: number, cls: TileClass): void {
    const { ctx } = this
    const px = gameToCanvasX(gx)
    const py = gameToCanvasY(gy)
    const color = cls === 'buildable' ? '#6adf8a' : '#b84040'
    const radius = UNIT_PX * 0.42

    ctx.save()
    // Soft fill to make legal/illegal status pop without obscuring the grid.
    ctx.globalAlpha = 0.25
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = 1
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.stroke()

    // Crosshair at the exact lattice point — the bullseye where the tower
    // will land.
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px - radius * 0.4, py)
    ctx.lineTo(px + radius * 0.4, py)
    ctx.moveTo(px, py - radius * 0.4)
    ctx.lineTo(px, py + radius * 0.4)
    ctx.stroke()
    ctx.restore()
  }

  /**
   * Draw thin accent lines at each interior segment boundary of `path`, and
   * (optionally) tint the `xRange` of the hovered segment. Interior means
   * boundaries between consecutive segments — the path's outer `startX` /
   * `targetX` are drawn as the axes, not as boundaries.
   *
   * Vertical segments have `xRange = [x, x]` and their "boundary" coincides
   * with the adjacent segments' endpoints; we draw one accent per boundary
   * between consecutive segments regardless of kind.
   */
  drawSegmentBoundaries(
    path: SegmentedPath,
    hoveredSegmentId: string | null = null,
  ): void {
    const { ctx } = this
    const segments = path.segments

    if (hoveredSegmentId) {
      const seg = segments.find((s) => s.id === hoveredSegmentId)
      if (seg) {
        const [lo, hi] = seg.xRange
        const pxLo = gameToCanvasX(lo)
        const pxHi = gameToCanvasX(hi)
        const pyTop = gameToCanvasY(GRID_MAX_Y)
        const pyBot = gameToCanvasY(GRID_MIN_Y)
        const width = Math.max(pxHi - pxLo, UNIT_PX * 0.25)
        ctx.save()
        ctx.fillStyle = 'rgba(173, 162, 132, 0.12)'
        ctx.fillRect(pxLo, pyTop, width, pyBot - pyTop)
        ctx.restore()
      }
    }

    if (segments.length < 2) return

    ctx.save()
    ctx.strokeStyle = 'rgba(173, 162, 132, 0.45)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    const yTop = gameToCanvasY(GRID_MAX_Y)
    const yBot = gameToCanvasY(GRID_MIN_Y)
    // One accent per interior boundary = per consecutive-pair; authored in
    // ascending x, so the boundary is segments[i].xRange[1] (equivalently
    // segments[i+1].xRange[0]).
    for (let i = 0; i < segments.length - 1; i++) {
      const boundaryX = segments[i]!.xRange[1]
      const px = gameToCanvasX(boundaryX)
      ctx.beginPath()
      ctx.moveTo(px, yTop)
      ctx.lineTo(px, yBot)
      ctx.stroke()
    }
    ctx.restore()
  }

  /**
   * Draw a blinking 5-pointed star at game coordinate `(gx, gy)` — the focus
   * point of the enemy paths (level endpoint P*). `time` (seconds) drives the
   * pulse so the marker reads as "alive". Pure primitive: no state, colour
   * sourced from the board palette gold.
   */
  drawFocusStar(gx: number, gy: number, time: number): void {
    const { ctx } = this
    const cx = gameToCanvasX(gx)
    const cy = gameToCanvasY(gy)
    const pulse = 0.5 + 0.5 * Math.sin(time * 4)
    const outerR = UNIT_PX * 0.55
    const innerR = outerR * 0.42
    const SPIKES = 5

    ctx.save()
    // Soft halo so the star reads against the hatched/gridded board.
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR * 2)
    glow.addColorStop(0, `rgba(173, 162, 132, ${0.35 * pulse})`)
    glow.addColorStop(1, 'rgba(173, 162, 132, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, outerR * 2, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    for (let i = 0; i < SPIKES * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR
      const angle = -Math.PI / 2 + (Math.PI / SPIKES) * i
      const x = cx + Math.cos(angle) * r
      const y = cy + Math.sin(angle) * r
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.globalAlpha = 0.55 + 0.45 * pulse
    ctx.fillStyle = this.palette.boardAxis
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.lineWidth = 1
    ctx.strokeStyle = this.palette.boardAxis
    ctx.stroke()
    ctx.restore()
  }

  drawFunction(
    fn: (x: number) => number,
    xMin: number,
    xMax: number,
    color: string,
    lineWidth = 2,
  ): void {
    const { ctx } = this
    const step = 0.05
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    let started = false
    for (let gx = xMin; gx <= xMax; gx += step) {
      const gy = fn(gx)
      if (!isFinite(gy)) { started = false; continue }
      const px = gameToCanvasX(gx)
      const py = gameToCanvasY(gy)
      if (!started) { ctx.moveTo(px, py); started = true }
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }

  drawIntegralArea(
    fn: (x: number) => number,
    a: number,
    b: number,
    color: string,
  ): void {
    const { ctx } = this
    const step = 0.05
    ctx.fillStyle = color
    ctx.globalAlpha = 0.3
    try {
      ctx.beginPath()
      ctx.moveTo(gameToCanvasX(a), gameToCanvasY(0))
      for (let gx = a; gx <= b; gx += step) {
        const gy = fn(gx)
        if (!isFinite(gy)) continue
        ctx.lineTo(gameToCanvasX(gx), gameToCanvasY(gy))
      }
      const gyB = fn(b)
      if (isFinite(gyB)) ctx.lineTo(gameToCanvasX(b), gameToCanvasY(gyB))
      ctx.lineTo(gameToCanvasX(b), gameToCanvasY(0))
      ctx.closePath()
      ctx.fill()
    } finally {
      ctx.globalAlpha = 1.0
    }
  }

  drawSector(
    cx: number, cy: number,
    r: number,
    startAngle: number,
    sweepAngle: number,
    color: string,
  ): void {
    const { ctx } = this
    const pcx = gameToCanvasX(cx)
    const pcy = gameToCanvasY(cy)
    const pr = r * UNIT_PX
    // Canvas y-axis is inverted; angles must be mirrored
    const cStart = -startAngle - sweepAngle
    const cEnd = -startAngle

    try {
      ctx.fillStyle = color
      ctx.globalAlpha = 0.25
      ctx.beginPath()
      ctx.moveTo(pcx, pcy)
      ctx.arc(pcx, pcy, pr, cStart, cEnd)
      ctx.closePath()
      ctx.fill()

      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.6
      ctx.beginPath()
      ctx.moveTo(pcx, pcy)
      ctx.arc(pcx, pcy, pr, cStart, cEnd)
      ctx.closePath()
      ctx.stroke()
    } finally {
      ctx.globalAlpha = 1.0
    }
  }

  drawCircle(gx: number, gy: number, radius: number, color: string): void {
    const { ctx } = this
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(gameToCanvasX(gx), gameToCanvasY(gy), radius, 0, Math.PI * 2)
    ctx.fill()
  }

  drawHealthBar(
    gx: number, gy: number,
    width: number,
    hpRatio: number,
    offsetY = -20,
  ): void {
    const { ctx } = this
    const px = gameToCanvasX(gx) - width / 2
    const py = gameToCanvasY(gy) + offsetY
    ctx.fillStyle = '#333'
    ctx.fillRect(px, py, width, 4)
    const hpColor = hpRatio > 0.5 ? '#4aab6e' : hpRatio > 0.25 ? '#c89848' : '#b84040'
    ctx.fillStyle = hpColor
    ctx.fillRect(px, py, width * hpRatio, 4)
  }

  drawSprite(image: CanvasImageSource, gx: number, gy: number, size: number): void {
    const px = gameToCanvasX(gx) - size / 2
    const py = gameToCanvasY(gy) - size / 2
    this.ctx.drawImage(image, px, py, size, size)
  }
}
