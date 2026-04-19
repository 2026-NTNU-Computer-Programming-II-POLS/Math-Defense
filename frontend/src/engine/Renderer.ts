/**
 * Renderer — Canvas rendering primitives (TypeScript)
 * Responsible only for low-level drawing; holds no game state.
 */
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, UNIT_PX,
  GRID_MIN_X, GRID_MAX_X, GRID_MIN_Y, GRID_MAX_Y,
  Colors,
} from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import type { LevelLayoutService, TileClass } from '@/domain/level/level-layout-service'
import type { SegmentedPath } from '@/domain/path/segmented-path'
import { tileStyleFor, type TileStyle } from './render-helpers/tile-style'

export class Renderer {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get 2D context')
    this.ctx = ctx

    const dpr = window.devicePixelRatio || 1
    canvas.width = CANVAS_WIDTH * dpr
    canvas.height = CANVAS_HEIGHT * dpr
    canvas.style.width = `${CANVAS_WIDTH}px`
    canvas.style.height = `${CANVAS_HEIGHT}px`
    ctx.scale(dpr, dpr)
    ctx.imageSmoothingEnabled = false
  }

  clear(): void {
    this.ctx.fillStyle = Colors.STONE_DARK
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  }

  drawGrid(layout: LevelLayoutService | null = null): void {
    const { ctx } = this

    // Tile fills. When a LevelLayoutService is available we delegate every
    // cell's category to `layout.classify` — the Renderer never re-derives
    // path/buildable/forbidden inline (spec §8, plan §6.3 SoC Gate). Without
    // a layout (pre-level-start, or flag-off legacy path) we fall back to
    // the stone checkerboard so the grid never renders as an empty void.
    for (let gx = GRID_MIN_X; gx < GRID_MAX_X; gx++) {
      for (let gy = GRID_MIN_Y; gy < GRID_MAX_Y; gy++) {
        const px = gameToCanvasX(gx)
        const py = gameToCanvasY(gy + 1)
        if (layout) {
          this._paintTile(px, py, layout.classify(gx, gy))
        } else {
          ctx.fillStyle = (gx + gy) % 2 === 0 ? Colors.STONE_DARK : Colors.STONE_LIGHT
          ctx.fillRect(px, py, UNIT_PX, UNIT_PX)
        }
      }
    }

    // Grid lines (dark gold rune lines)
    ctx.strokeStyle = Colors.GRID_LINE
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

    // Coordinate axes (bright gold)
    ctx.strokeStyle = Colors.AXIS
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
    ctx.fillStyle = Colors.AXIS
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
    ctx.fillStyle = Colors.AXIS
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
   */
  private _paintTile(px: number, py: number, cls: TileClass): void {
    const style = tileStyleFor(cls)
    this._applyTileStyle(px, py, style)
  }

  private _applyTileStyle(px: number, py: number, style: TileStyle): void {
    const { ctx } = this
    ctx.fillStyle = style.fill
    ctx.fillRect(px, py, UNIT_PX, UNIT_PX)

    if (style.hatching) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(px, py, UNIT_PX, UNIT_PX)
      ctx.clip()
      ctx.strokeStyle = 'rgba(184, 64, 64, 0.35)'
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

    if (style.border && style.borderStyle) {
      ctx.save()
      ctx.strokeStyle = style.border
      ctx.lineWidth = 1
      ctx.setLineDash(style.borderStyle === 'dotted' ? [2, 3] : [])
      // Inset by 0.5 so the 1px stroke renders crisply on integer pixel rows.
      ctx.strokeRect(px + 0.5, py + 0.5, UNIT_PX - 1, UNIT_PX - 1)
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
  drawPlacementCursor(gx: number, gy: number, cls: TileClass): void {
    const { ctx } = this
    const px = gameToCanvasX(gx)
    const py = gameToCanvasY(gy + 1)
    const style = tileStyleFor(cls)
    ctx.save()
    ctx.globalAlpha = 0.55
    this._applyTileStyle(px, py, style)
    ctx.restore()

    ctx.save()
    ctx.strokeStyle = cls === 'buildable' ? '#6adf8a' : '#b84040'
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.strokeRect(px + 1, py + 1, UNIT_PX - 2, UNIT_PX - 2)
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
        ctx.fillStyle = 'rgba(255, 215, 0, 0.12)'
        ctx.fillRect(pxLo, pyTop, width, pyBot - pyTop)
        ctx.restore()
      }
    }

    if (segments.length < 2) return

    ctx.save()
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.45)'
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

  drawOrigin(time: number): void {
    const { ctx } = this
    const cx = gameToCanvasX(0)
    const cy = gameToCanvasY(0)
    const pulse = 0.6 + 0.4 * Math.sin(time * 3)
    const radius = UNIT_PX * 0.8

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.5)
    gradient.addColorStop(0, `rgba(255, 215, 0, ${0.4 * pulse})`)
    gradient.addColorStop(0.5, `rgba(255, 215, 0, ${0.15 * pulse})`)
    gradient.addColorStop(1, 'rgba(255, 215, 0, 0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(cx, cy, radius * 1.5, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = `rgba(255, 215, 0, ${0.8 * pulse})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2)
    ctx.stroke()

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(time * 0.5)
    ctx.strokeStyle = `rgba(255, 215, 0, ${0.6 * pulse})`
    ctx.lineWidth = 1
    for (let i = 0; i < 6; i++) {
      const angle = ((Math.PI * 2) / 6) * i
      const r = radius * 0.4
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r)
      ctx.stroke()
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
