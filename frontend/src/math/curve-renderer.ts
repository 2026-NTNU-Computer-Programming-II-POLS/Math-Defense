import type { CurveDefinition } from './curve-types'
import { evaluate, isInDomain } from './curve-evaluator'

export interface Point2D {
  readonly x: number
  readonly y: number
}

export type CoordTransform = (gx: number, gy: number) => Point2D

export function sampleCurve(
  curve: CurveDefinition,
  xMin: number,
  xMax: number,
  sampleCount = 200,
): Point2D[] {
  const points: Point2D[] = []
  const step = (xMax - xMin) / sampleCount
  for (let i = 0; i <= sampleCount; i++) {
    const x = xMin + i * step
    if (!isInDomain(curve, x)) continue
    const y = evaluate(curve, x)
    if (!isFinite(y)) continue
    points.push({ x, y })
  }
  return points
}

const PATH_FAMILY_COLORS: Record<string, string> = {
  polynomial: '#4a82c8',
  trigonometric: '#c84a82',
  logarithmic: '#4ac882',
}

export function renderCurve(
  ctx: CanvasRenderingContext2D,
  curve: CurveDefinition,
  xMin: number,
  xMax: number,
  toCanvas: CoordTransform,
  options?: { color?: string; lineWidth?: number; sampleCount?: number },
): void {
  const gamePoints = sampleCurve(curve, xMin, xMax, options?.sampleCount)
  if (gamePoints.length < 2) return

  ctx.save()
  ctx.strokeStyle = options?.color ?? PATH_FAMILY_COLORS[curve.family] ?? '#fff'
  ctx.lineWidth = options?.lineWidth ?? 2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  const p0 = toCanvas(gamePoints[0].x, gamePoints[0].y)
  ctx.moveTo(p0.x, p0.y)
  for (let i = 1; i < gamePoints.length; i++) {
    const p = toCanvas(gamePoints[i].x, gamePoints[i].y)
    ctx.lineTo(p.x, p.y)
  }
  ctx.stroke()
  ctx.restore()
}

export function renderEndpoint(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  toCanvas: CoordTransform,
  radius = 8,
): void {
  const { x: cx, y: cy } = toCanvas(gx, gy)

  ctx.save()
  ctx.fillStyle = '#ffd700'
  ctx.shadowColor = '#ffd700'
  ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.shadowBlur = 0
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx - 4, cy)
  ctx.lineTo(cx + 4, cy)
  ctx.moveTo(cx, cy - 4)
  ctx.lineTo(cx, cy + 4)
  ctx.stroke()
  ctx.restore()
}

export function renderSpawnPoint(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  toCanvas: CoordTransform,
  radius = 5,
): void {
  const { x: cx, y: cy } = toCanvas(gx, gy)

  ctx.save()
  ctx.fillStyle = '#ff4444'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}
