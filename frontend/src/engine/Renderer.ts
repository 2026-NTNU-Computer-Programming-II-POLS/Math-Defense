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
  /** Tower base-plate fill — light blue (legacy name; not the board's alt). */
  readonly stoneLight: string
  /** Tower keyboard-focus halo (legacy name; not the board axis colour). */
  readonly axis: string
  /** No-layout checkerboard base (menu/pre-level grid cells). */
  readonly boardBase: string
  /** No-layout checkerboard alt cell. */
  readonly boardBaseAlt: string
  /**
   * Canvas backdrop painted by `clear()` — the area OUTSIDE the coordinate
   * grid (beyond GRID_MIN..GRID_MAX). Kept distinct from the grid-cell tone
   * so the ±range plane reads as a lighter panel on a darker surround.
   */
  readonly outsideFill: string
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
  stoneLight: '#A8BCCB',  // --terracotta : light-blue tower base-plate fill
  axis: '#ffd700',
  // Board ink — Morandi light re-skin.
  boardBase: '#E8EFF5',      // --cream-soft : no-layout checkerboard base
  boardBaseAlt: '#DCE5ED',   // --cream      : checkerboard alt
  boardAxis: '#ADA284',      // --gold       : muted khaki axes / ticks
  gridLine: 'rgba(79, 74, 72, 0.18)', // --divider : graph-paper thin lines
  forbiddenFill: '#E8EFF5',  // --cream-soft : grid-cell base; gray hatch is the signal
  outsideFill: '#DCE5ED',    // --cream      : backdrop outside the ±grid range
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
    // Paint the whole canvas with the OUTSIDE-grid backdrop. drawGrid then
    // repaints the ±GRID_MIN..GRID_MAX cells with the lighter grid tone, so
    // only the area beyond the coordinate range keeps this colour.
    this.ctx.fillStyle = this.palette.outsideFill
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
   * Draw the focus marker at game coordinate `(gx, gy)` — the level endpoint
   * P\* (common intersection of all curves). The marker can be the default
   * pulsing gold star, a gorilla emoji, or a player-uploaded image; the gold
   * halo is shared so all three variants pop equally against the muted board.
   * Pure primitive: no state.
   */
  drawFocusMarker(
    gx: number,
    gy: number,
    time: number,
    opts: {
      style: 'star' | 'gorilla' | 'custom'
      customImage: HTMLImageElement | null
    },
  ): void {
    const { ctx } = this
    const cx = gameToCanvasX(gx)
    const cy = gameToCanvasY(gy)
    const pulse = 0.5 + 0.5 * Math.sin(time * 4)
    const outerR = UNIT_PX * (0.72 + 0.1 * pulse)

    ctx.save()
    this._drawFocusHalo(cx, cy, outerR, pulse)

    if (opts.style === 'gorilla') {
      this._drawFocusEmoji(cx, cy, outerR, '🦍')
    } else if (opts.style === 'custom' && opts.customImage) {
      this._drawFocusImage(cx, cy, outerR, opts.customImage)
    } else {
      // 'star', or 'custom' before its image finishes loading — fall back to
      // the canonical star so the marker is never an empty halo.
      this._drawFocusStarBody(cx, cy, outerR, pulse)
    }
    ctx.restore()
  }

  private _drawFocusHalo(cx: number, cy: number, outerR: number, pulse: number): void {
    const { ctx } = this
    const glowR = outerR * 2.6
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
    glow.addColorStop(0, `rgba(246, 201, 68, ${0.5 + 0.35 * pulse})`)
    glow.addColorStop(0.5, `rgba(246, 201, 68, ${0.2 * pulse})`)
    glow.addColorStop(1, 'rgba(246, 201, 68, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
    ctx.fill()
  }

  private _drawFocusStarBody(cx: number, cy: number, outerR: number, pulse: number): void {
    const { ctx } = this
    const GOLD = '#F6C944'
    const GOLD_EDGE = '#D69A1E'
    const CORE = '#FFFBE6'
    const SPIKES = 5
    const innerR = outerR * 0.44

    const traceStar = (oR: number, iR: number): void => {
      ctx.beginPath()
      for (let i = 0; i < SPIKES * 2; i++) {
        const r = i % 2 === 0 ? oR : iR
        const angle = -Math.PI / 2 + (Math.PI / SPIKES) * i
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
    }

    traceStar(outerR, innerR)
    ctx.fillStyle = GOLD
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = GOLD_EDGE
    ctx.stroke()

    traceStar(outerR * 0.5, innerR * 0.5)
    ctx.globalAlpha = 0.55 + 0.45 * pulse
    ctx.fillStyle = CORE
    ctx.fill()
    ctx.globalAlpha = 1
  }

  private _drawFocusEmoji(cx: number, cy: number, outerR: number, glyph: string): void {
    const { ctx } = this
    // Emoji are drawn as text — fillText on most browsers uses the system
    // color-emoji font automatically when the codepoint is in that range.
    ctx.font = `${Math.round(outerR * 2.0)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(glyph, cx, cy)
  }

  private _drawFocusImage(
    cx: number,
    cy: number,
    outerR: number,
    img: HTMLImageElement,
  ): void {
    const { ctx } = this
    const size = outerR * 2
    ctx.drawImage(img, cx - outerR, cy - outerR, size, size)
  }

  /**
   * Endpoint hit FX — 8 small gold polygons radiating from (gx, gy), fading
   * with `easeOutQuart` over the lifetime. Driven purely by `progress` in
   * [0, 1] so the system holds no per-effect state beyond `age / maxAge`.
   */
  drawEndpointFragments(gx: number, gy: number, progress: number): void {
    const { ctx } = this
    const cx = gameToCanvasX(gx)
    const cy = gameToCanvasY(gy)
    const p = Math.max(0, Math.min(1, progress))
    const eased = 1 - (1 - p) ** 4
    const fade = 1 - p
    const FRAGMENTS = 8
    const reach = UNIT_PX * 2.4 * eased
    const size = UNIT_PX * 0.22 * (1 - 0.4 * p)
    ctx.save()
    ctx.fillStyle = '#F6C944'
    ctx.strokeStyle = '#D69A1E'
    ctx.lineWidth = 1.2
    ctx.globalAlpha = fade
    for (let i = 0; i < FRAGMENTS; i++) {
      const a = (Math.PI * 2 * i) / FRAGMENTS - Math.PI / 2
      const ex = cx + Math.cos(a) * reach
      const ey = cy + Math.sin(a) * reach
      ctx.save()
      ctx.translate(ex, ey)
      ctx.rotate(a + p * Math.PI)
      ctx.beginPath()
      ctx.moveTo(0, -size)
      ctx.lineTo(size * 0.7, 0)
      ctx.lineTo(0, size)
      ctx.lineTo(-size * 0.7, 0)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()
  }

  /** Endpoint hit FX — 3 crying-face emojis bursting out + falling. */
  drawEndpointTears(gx: number, gy: number, progress: number): void {
    const { ctx } = this
    const cx = gameToCanvasX(gx)
    const cy = gameToCanvasY(gy)
    const p = Math.max(0, Math.min(1, progress))
    const eased = 1 - (1 - p) ** 3
    const fade = 1 - p * p
    const COUNT = 3
    const reach = UNIT_PX * 1.8 * eased
    const drop = UNIT_PX * 0.9 * p * p
    const size = Math.round(UNIT_PX * 0.9)
    ctx.save()
    ctx.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = fade
    for (let i = 0; i < COUNT; i++) {
      const a = (Math.PI * 2 * i) / COUNT - Math.PI / 2
      const ex = cx + Math.cos(a) * reach
      const ey = cy + Math.sin(a) * reach + drop
      ctx.fillText('😭', ex, ey)
    }
    ctx.restore()
  }

  /** Endpoint hit FX — 4 anger-mark emojis pulsing outward in cardinals. */
  drawEndpointAngry(gx: number, gy: number, progress: number): void {
    const { ctx } = this
    const cx = gameToCanvasX(gx)
    const cy = gameToCanvasY(gy)
    const p = Math.max(0, Math.min(1, progress))
    const eased = 1 - (1 - p) ** 4
    const fade = 1 - p
    const COUNT = 4
    const reach = UNIT_PX * 2.0 * eased
    const pulse = 1 + 0.3 * Math.sin(p * Math.PI * 4)
    const size = Math.round(UNIT_PX * 0.85 * pulse)
    ctx.save()
    ctx.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = fade
    for (let i = 0; i < COUNT; i++) {
      const a = (Math.PI * 2 * i) / COUNT - Math.PI / 2
      const ex = cx + Math.cos(a) * reach
      const ey = cy + Math.sin(a) * reach
      ctx.fillText('💢', ex, ey)
    }
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
