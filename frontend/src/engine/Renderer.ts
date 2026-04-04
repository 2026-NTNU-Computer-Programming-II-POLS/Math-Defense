/**
 * Renderer — Canvas 渲染原語（TypeScript 版）
 * 只負責低階繪製，不持有遊戲狀態。
 */
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, UNIT_PX,
  GRID_MIN_X, GRID_MAX_X, GRID_MIN_Y, GRID_MAX_Y,
  Colors,
} from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'

export class Renderer {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get 2D context')
    this.ctx = ctx

    canvas.width = CANVAS_WIDTH
    canvas.height = CANVAS_HEIGHT
    ctx.imageSmoothingEnabled = false
  }

  clear(): void {
    this.ctx.fillStyle = Colors.STONE_DARK
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  }

  drawGrid(): void {
    const { ctx } = this

    // 棋盤格石板底色
    for (let gx = GRID_MIN_X; gx < GRID_MAX_X; gx++) {
      for (let gy = GRID_MIN_Y; gy < GRID_MAX_Y; gy++) {
        const px = gameToCanvasX(gx)
        const py = gameToCanvasY(gy + 1)
        ctx.fillStyle = (gx + gy) % 2 === 0 ? Colors.STONE_DARK : Colors.STONE_LIGHT
        ctx.fillRect(px, py, UNIT_PX, UNIT_PX)
      }
    }

    // 格線（暗金色符文線）
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

    // 座標軸（亮金色）
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

    // 刻度數字
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
    ctx.globalAlpha = 1.0
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
    // Canvas y 軸翻轉，角度需鏡像
    const cStart = -startAngle - sweepAngle
    const cEnd = -startAngle

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
    ctx.globalAlpha = 1.0
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
