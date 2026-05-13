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

/**
 * Map a player's rolling Initial-Answer accuracy (0.0–1.0 over the last 10
 * sessions) onto the y-label opacity used by the Star-1 path renderer.
 * Implements the concrete-fading schedule from spec §17.2 — full labels for
 * struggling players, none once mastery is consistently demonstrated.
 */
export function iaAccuracyToLabelOpacity(accuracy: number): number {
  if (!isFinite(accuracy) || accuracy <= 0.3) return 1.0
  if (accuracy <= 0.6) return 0.6
  if (accuracy <= 0.8) return 0.3
  return 0
}

/**
 * At opacity ≤ 0.3 we drop to every-other integer x; otherwise label every
 * integer x. Mirrors the table in spec §17.2 so the schedule is encoded in
 * one place even though `iaAccuracyToLabelOpacity` already chose the value.
 */
function labelStrideForOpacity(opacity: number): number {
  return opacity > 0 && opacity <= 0.3 ? 2 : 1
}

export function renderCurve(
  ctx: CanvasRenderingContext2D,
  curve: CurveDefinition,
  xMin: number,
  xMax: number,
  toCanvas: CoordTransform,
  options?: {
    color?: string
    lineWidth?: number
    sampleCount?: number
    /**
     * 0–1. Concrete-fading on Star-1 paths (spec §17): 1.0 fully labels the
     * curve at integer x, 0 hides them entirely. Defaults to 0 so existing
     * call sites (Star ≥ 2) stay unlabelled.
     */
    labelOpacity?: number
    /** Font for y-labels. Falls back to a small monospace. */
    labelFont?: string
    /** Color for y-labels. Falls back to the curve color. */
    labelColor?: string
  },
): void {
  const gamePoints = sampleCurve(curve, xMin, xMax, options?.sampleCount)
  if (gamePoints.length < 2) return

  const color = options?.color ?? PATH_FAMILY_COLORS[curve.family] ?? '#fff'
  ctx.save()
  ctx.strokeStyle = color
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

  const labelOpacity = options?.labelOpacity ?? 0
  if (labelOpacity > 0) {
    renderIntegerXLabels(
      ctx,
      curve,
      xMin,
      xMax,
      toCanvas,
      labelOpacity,
      options?.labelFont ?? '10px monospace',
      options?.labelColor ?? color,
    )
  }
}

function renderIntegerXLabels(
  ctx: CanvasRenderingContext2D,
  curve: CurveDefinition,
  xMin: number,
  xMax: number,
  toCanvas: CoordTransform,
  opacity: number,
  font: string,
  color: string,
): void {
  const stride = labelStrideForOpacity(opacity)
  const start = Math.ceil(xMin)
  const end = Math.floor(xMax)

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.fillStyle = color
  ctx.font = font
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  for (let x = start; x <= end; x += stride) {
    if (!isInDomain(curve, x)) continue
    const y = evaluate(curve, x)
    if (!isFinite(y)) continue
    const { x: cx, y: cy } = toCanvas(x, y)
    ctx.fillText(`y=${formatY(y)}`, cx + 4, cy - 4)
  }
  ctx.restore()
}

function formatY(y: number): string {
  // Round to 2 dp but trim trailing zeros so integer y-values render cleanly.
  const rounded = Math.round(y * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
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
