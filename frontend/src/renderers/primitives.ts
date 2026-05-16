/**
 * Shared low-level canvas drawing helpers used by multiple renderers.
 * Functions are pure (no state) and take only primitives — no engine types.
 */

/**
 * Canvas font fallback chain for the math-error glyph bodies introduced in
 * Visual Redesign Phase 6. Unicode math symbols render very differently
 * across operating systems; the chain pins a math-capable family first,
 * with Courier/serif fallbacks so the silhouette is never missing.
 * Kept as a module-level constant so every glyph-body callsite shares the
 * exact same font string (CI render-smoke test can baseline against it).
 */
export const GLYPH_BODY_FONT_STACK =
  `'Cambria Math', 'STIX Two Math', 'Courier New', Courier, monospace, serif`

export interface GlyphBodyOptions {
  /** Rotation in radians applied after translating to (px, py). */
  rotation?: number
  /** CSS font weight; defaults to '900' so the glyph reads as a body, not text. */
  weight?: string
  /** Override the default math font stack — e.g. for boss-only Möbius glyphs. */
  fontFamily?: string
  /** When true (default), paints a cyan/magenta chromatic-aberration fringe. */
  fringe?: boolean
  /** Fringe offset in pixels along the horizontal axis. Defaults to size * 0.07. */
  fringeOffset?: number
  /** Fringe alpha. Defaults to 0.55. */
  fringeAlpha?: number
  /**
   * Override the two fringe colors. Defaults to cyan/magenta — the hostile
   * "math error" signal. Pets use two cyan stops so allied vs hostile reads
   * at a glance (Visual Redesign Phase 6.5).
   */
  fringeColors?: readonly [string, string]
  /** Adds a thin dark outline behind the fill for readability. Defaults to true. */
  outline?: boolean
  /** Outline stroke color. Defaults to a near-black. */
  outlineColor?: string
}

/**
 * Draws a math-symbol "glyph body" — the construction primitive for Phase 6
 * chaos-error enemies (`x`, `÷`, `Σ`, `lim`, `∥`, `ε`, …). The recipe is
 * cyan/magenta chromatic-aberration fringe → outline → fill, so every enemy
 * shares the same "this is an error" treatment.
 *
 * Pure: takes only the 2D context and primitives, mutates ctx state under
 * a save/restore guard so callers don't have to.
 */
export function drawGlyphBody(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  glyph: string,
  color: string,
  options: GlyphBodyOptions = {},
): void {
  const {
    rotation = 0,
    weight = '900',
    fontFamily = GLYPH_BODY_FONT_STACK,
    fringe = true,
    fringeOffset = size * 0.07,
    fringeAlpha = 0.55,
    fringeColors = ['#00d6ff', '#ff2bd6'],
    outline = true,
    outlineColor = '#15111d',
  } = options

  ctx.save()
  ctx.translate(px, py)
  if (rotation !== 0) ctx.rotate(rotation)
  ctx.font = `${weight} ${size}px ${fontFamily}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (fringe) {
    ctx.save()
    ctx.globalAlpha = fringeAlpha
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = fringeColors[0]
    ctx.fillText(glyph, -fringeOffset, 0)
    ctx.fillStyle = fringeColors[1]
    ctx.fillText(glyph, fringeOffset, 0)
    ctx.restore()
  }

  if (outline) {
    ctx.lineWidth = Math.max(1, size / 14)
    ctx.lineJoin = 'round'
    ctx.strokeStyle = outlineColor
    ctx.strokeText(glyph, 0, 0)
  }

  ctx.fillStyle = color
  ctx.fillText(glyph, 0, 0)

  ctx.restore()
}
