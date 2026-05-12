/**
 * Shared low-level canvas drawing helpers used by multiple renderers.
 * Functions are pure (no state) and take only primitives — no engine types.
 */

/**
 * Draws a flattened elliptical orbit ring.
 * @param angle  Pre-computed rotation in radians (include any time offset before calling).
 * @param scaleY Vertical squash: 0.48 for towers, 0.45 for pets.
 * @param lw     Line width.
 * @param alpha  Two-digit hex alpha appended to `color`, e.g. `'bb'`.
 */
export function drawOrbitRing(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  radius: number,
  angle: number,
  color: string,
  scaleY: number,
  lw: number,
  alpha: string,
): void {
  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(angle)
  ctx.scale(1, scaleY)
  ctx.strokeStyle = `${color}${alpha}`
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/**
 * Draws a diamond (rhombus) crystal with a vertical gradient.
 * @param widthFactor  Half-width as a fraction of size (0.75 for towers, 0.8 for pets).
 * @param bottomColor  Gradient bottom-stop color.
 * @param midStop      Gradient position for the `color` stop (0–1).
 * @param strokeStyle  Outline color.
 * @param lw           Outline line width.
 * @param facet        When true, adds cross-hair facet lines through the centre.
 */
export function drawDiamondCrystal(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  color: string,
  widthFactor: number,
  bottomColor: string,
  midStop: number,
  strokeStyle: string,
  lw: number,
  facet = false,
): void {
  const hw = size * widthFactor
  const g = ctx.createLinearGradient(px, py - size, px, py + size)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(midStop, color)
  g.addColorStop(1, bottomColor)
  ctx.fillStyle = g
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.moveTo(px, py - size)
  ctx.lineTo(px + hw, py)
  ctx.lineTo(px, py + size)
  ctx.lineTo(px - hw, py)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  if (!facet) return
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(px, py - size)
  ctx.lineTo(px, py + size)
  ctx.moveTo(px - hw, py)
  ctx.lineTo(px + hw, py)
  ctx.stroke()
}
