/**
 * EnemyRenderer — paints enemies from an EnemySceneView snapshot (F-ARCH-4).
 * Never reads Enemy entity fields directly; the projection layer in
 * engine/projections/project-enemies.ts owns that surface.
 */
import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { UNIT_PX, ANIM } from '@/data/constants'
import { projectEnemyScene } from '@/engine/projections/project-enemies'
import type { EnemyView } from '@/engine/projections/views'
import { drawGlyphBody } from './primitives'

// Phase 6d: Regenerator's `lim` is a three-letter operator. Pinning the font
// size to ~55% of the body keeps the glyph inside the standard 22x22 silhouette
// instead of spilling horizontally past the auras.
const REGENERATOR_LIM_SCALE = 0.55
// Helper's `Σ` breathes slightly when the helper aura is active. The breath
// amplitude is small enough that the silhouette still reads as a single glyph
// from a distance — purely a "this thing is doing something" cue.
const HELPER_SIGMA_BREATH = 0.06

// Phase 6e: Bulwark's two-parallel-walls body. Drawn as self-rendered bars
// (not the Unicode `∥` glyph) because U+2225 is absent from many non-Windows
// monospace/serif fallbacks and would render as a tofu box. Geometry is in
// unit fractions of `size`; the renderer scales around the body origin.
const BULWARK_BAR_HALF_SEP = 0.18 // x-offset of each bar's centre from origin
const BULWARK_BAR_WIDTH = 0.16
const BULWARK_BAR_HEIGHT = 0.72
// Rivet positions are unit fractions of `size` — two per bar, top and bottom —
// transplanted from the legacy pauldron treatment so the "armoured" identity
// survives the body swap.
const BULWARK_RIVET_OFFSETS_X = [-0.18, 0.18] as const
const BULWARK_RIVET_OFFSETS_Y = [-0.26, 0.26] as const
// Phase 6e: Swarmling's tiny `ε` body. Three satellite `ε` glyphs orbit the
// core at half size, evoking the legacy four-dot swarm cluster while staying
// in the math-error vocabulary.
const SWARMLING_SATELLITE_COUNT = 3
const SWARMLING_SATELLITE_SCALE = 0.42
const SWARMLING_ORBIT_RADIUS = 0.46

// Phase 6f: Boss A's body is a single large `∀` quantifier — a boss-scale
// silhouette that reads at a glance. The "unsolvable equation" identity moves
// to flickering fragments orbiting the body (same big-body + satellites
// structure as Boss B), instead of cramming the whole equation into a 28%
// body that lost all presence. Fragments use the gold accent + a deterministic
// sin-flicker keyed by index + time (no Math.random).
const BOSS_A_BODY_GLYPH = '∀'
const BOSS_A_BODY_SCALE = 0.62
const BOSS_A_FRAGMENTS = ['f(x)', '≠', '0'] as const
const BOSS_A_FRAGMENT_RADIUS = 0.66
const BOSS_A_FRAGMENT_SCALE = 0.26
// Phase 6f: Boss B is a Mobius-strip paradox loop. The body is a lemniscate
// (figure-8) traced with the chromatic-fringe recipe; self-drawn loop-arrow
// satellites orbit the loop replacing the legacy crown halo. The arrow is
// path-drawn (not the Unicode `↻` glyph) because U+21BB is missing from many
// non-Windows fallback fonts and would render as a tofu box.
const BOSS_B_SATELLITE_COUNT = 4
const BOSS_B_SATELLITE_RADIUS = 0.68

// Phase 6c: Split's fraction-body layout. Numerator above, vinculum at center,
// denominator below. dy values are unit fractions of `size` (renderer scales).
// Classic algebra placeholders `a` / `b` read as "this is a fraction" without
// committing to a specific value.
const SPLIT_FRACTION = {
  numeratorGlyph: 'a',
  denominatorGlyph: 'b',
  numeratorDy: -0.32,
  denominatorDy: 0.32,
  glyphSize: 0.52,
  vinculumHalfWidth: 0.36,
  vinculumThickness: 0.08,
} as const

// Phase 6b: Strong's tangled-equation cluster. Five operators arranged so the
// cluster reads as a square knot — corner parens hold a sum/difference frame
// around a centred `=`. Positions are unit fractions of `size`; the renderer
// scales them around the body origin.
const STRONG_CLUSTER: ReadonlyArray<{
  readonly g: string
  readonly dx: number
  readonly dy: number
  readonly rot: number
}> = [
  { g: '(', dx: -0.30, dy: -0.18, rot: -0.18 },
  { g: ')', dx:  0.30, dy: -0.18, rot:  0.18 },
  { g: '+', dx: -0.26, dy:  0.22, rot:  0.10 },
  { g: '−', dx:  0.26, dy:  0.22, rot: -0.10 },
  { g: '=', dx:  0.00, dy:  0.00, rot:  0.00 },
]

export class EnemyRenderer {
  // Semantically meaningful game-art colors — centralized so theme adjustments
  // don't require hunting through individual draw methods.
  private static readonly HELPER_AURA = '#48c878'
  private static readonly REGEN_AURA  = '#7ee68a'
  private static readonly SHIELD_BG   = '#333333'
  private static readonly SHIELD_FILL = '#4488ee'

  private _time = 0

  update(dt: number, _game: Game): void {
    this._time += dt
  }

  render(renderer: Renderer, game: Game): void {
    const view = projectEnemyScene(game)
    for (const enemy of view.enemies) {
      this._drawEnemy(renderer, enemy)
    }
  }

  private _drawEnemy(renderer: Renderer, enemy: EnemyView): void {
    const { ctx } = renderer
    const px = gameToCanvasX(enemy.x)
    const py = gameToCanvasY(enemy.y)
    const half = enemy.size / 2
    const dying = enemy.dyingProgress

    // Visual Redesign Phase 2: during the death window, suppress living
    // auras and HP / shield bars — the corpse no longer buffs neighbours and
    // the bars would distract from the death animation. Frost overlays are
    // also skipped so the corpse fades cleanly.
    if (dying === 0) {
      if (enemy.helperRadius > 0) {
        ctx.save()
        const auraRadius = enemy.helperRadius * UNIT_PX
        ctx.globalAlpha = 0.12
        ctx.fillStyle = EnemyRenderer.HELPER_AURA
        ctx.beginPath()
        ctx.arc(px, py, auraRadius, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 0.4
        ctx.strokeStyle = EnemyRenderer.HELPER_AURA
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.restore()
      }

      if (enemy.regenerating) {
        this._drawRegenAura(ctx, px, py, enemy.size)
      }
    }

    ctx.save()
    if (dying > 0) {
      // Body fades over the death window; the death-particle layer paints
      // colour back over the spot so the visual doesn't go empty.
      ctx.globalAlpha = Math.max(0, 1 - dying)
    }
    if (enemy.frostRatio > 0 && dying === 0) {
      this._drawFrostAura(ctx, px, py, enemy.size, enemy.frostRatio)
    }
    this._drawSlime(ctx, px, py, enemy)
    if (dying === 0) this._drawHitFlash(ctx, px, py, enemy)
    ctx.restore()

    if (dying > 0) return

    let barY = -(half + 6)

    if (enemy.shieldRatio !== null) {
      const barPx = px - half
      const barPy = py + barY
      ctx.fillStyle = EnemyRenderer.SHIELD_BG
      ctx.fillRect(barPx, barPy, enemy.size, 4)
      ctx.fillStyle = EnemyRenderer.SHIELD_FILL
      ctx.fillRect(barPx, barPy, enemy.size * enemy.shieldRatio, 4)
      barY -= 6
    }

    if (enemy.hpRatio !== null) {
      renderer.drawHealthBar(enemy.x, enemy.y, enemy.size, enemy.hpRatio, barY)
    }
  }

  private _drawSlime(ctx: CanvasRenderingContext2D, px: number, py: number, enemy: EnemyView): void {
    const size = enemy.size
    const pulse = Math.sin(this._time * 5 + px * 0.05) * 0.5 + 0.5
    const squash = 1 + Math.sin(this._time * 6 + py * 0.04) * 0.04
    const dying = enemy.dyingProgress

    if (dying === 0) this._drawGroundShadow(ctx, px, py, size)

    ctx.save()
    // Visual Redesign Phase 2: death squash + slight upward drift. ScaleY
    // collapses toward zero as dyingProgress reaches 1, and the body lifts a
    // bit so the corpse appears to deflate / float off the ground plane.
    const deathSquashY = dying > 0 ? Math.max(0.05, 1 - dying * 0.92) : 1
    const deathSpreadX = dying > 0 ? 1 + dying * 0.18 : 1
    const deathDriftY = dying > 0 ? -size * dying * 0.18 : 0

    ctx.translate(px, py + (pulse - 0.5) * 1.2 + deathDriftY)
    ctx.scale((1 + (1 - squash) * 0.6) * deathSpreadX, squash * deathSquashY)

    this._drawGlyphEnemy(ctx, 0, 0, size, enemy)
    ctx.restore()
  }

  /**
   * Phase 6a math-error body. Per-type recipe:
   *  - general → tall `x` with a slight gait wobble (rotation tied to time).
   *  - fast    → leaning `÷` that drags two ghosted motion-blur copies.
   *  - strong  → tangled `( + − = )` cluster whose chromatic fringe widens
   *              as HP drops, signalling the equation block destabilising.
   *  - split   → numerator / vinculum / denominator stack; on death the
   *              numerator drifts up and the denominator down, reading as
   *              the fraction tearing apart (the actual child spawns are
   *              the game-side split — this is the parent's farewell).
   *  - helper  → `Σ` summation glyph that breathes slightly while the helper
   *              aura is active (helperRadius > 0), reading as the enemy
   *              "absorbing" / radiating support.
   *  - regenerator → smaller `lim` glyph nested inside the existing rotating
   *              dashed regen ring (drawn by `_drawRegenAura` from the caller).
   *  - bulwark → `∥` two thick parallel walls with rivet dots at top/bottom of
   *              each bar (legacy pauldron concept transplanted to the glyph).
   *  - swarmling → tiny `ε` core with three smaller orbiting `ε` satellites
   *              jittering around it (legacy four-dot swarm in the new
   *              vocabulary).
   *  - bossA   → the unsolvable equation `∀x. f(x) ≠ 0` painted small enough
   *              to fit the silhouette, with a halo of flickering "QED" boxes
   *              orbiting the upper hemisphere where the legacy crown sat.
   *  - bossB   → lemniscate (figure-8) body painted with the same fringe
   *              recipe as drawGlyphBody, surrounded by orbiting `↻` paradox
   *              satellites in place of the legacy crown halo.
   * Living auras / hp bars are drawn by the caller; this method only paints
   * the glyph silhouette and any per-type motion treatment.
   */
  private _drawGlyphEnemy(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    enemy: EnemyView,
  ): void {
    // Per-enemy phase, derived from world position so adjacent enemies do
    // not wobble in unison. Renderer-only — no game-state mutation.
    const phase = enemy.x * 0.31 + enemy.y * 0.17
    if (enemy.type === 'fast') {
      // Trailing motion-blur ghosts behind the body. Enemies travel left→right
      // along the lane, so the streak trails to the left in world space.
      const lean = -0.22
      const ghostColor = enemy.color
      // Paint older ghosts first (farther-back, more faded) so the most
      // recent ghost lands on top of them, just under the main body.
      for (let i = 2; i >= 1; i--) {
        ctx.save()
        ctx.globalAlpha = 0.36 / i
        drawGlyphBody(ctx, px - size * 0.32 * i, py + size * 0.02 * i, size * 0.94, '÷', ghostColor, {
          rotation: lean,
          fringe: false,
          outline: false,
        })
        ctx.restore()
      }
      drawGlyphBody(ctx, px, py, size, '÷', enemy.color, { rotation: lean })
    } else if (enemy.type === 'strong') {
      const hp = enemy.hpRatio ?? 1
      const distress = 1 - hp
      // Idle breath at full HP; faster, wider pulse as the cluster takes
      // damage. The fringe widens with `distress` so the equation visibly
      // tears apart in the final third of its life.
      const pulse = Math.sin(this._time * (3 + distress * 4) + phase) * 0.5 + 0.5
      const fringeOffset = size * (0.05 + distress * 0.05 + pulse * distress * 0.04)
      const fringeAlpha = 0.45 + distress * 0.35
      const glyphSize = size * 0.55
      for (const { g, dx, dy, rot } of STRONG_CLUSTER) {
        drawGlyphBody(ctx, px + dx * size, py + dy * size, glyphSize, g, enemy.color, {
          rotation: rot,
          fringeOffset,
          fringeAlpha,
        })
      }
    } else if (enemy.type === 'split') {
      const dying = enemy.dyingProgress
      // Separation grows during the death window; numerator drifts up and the
      // denominator down so the fraction visibly tears apart before the body
      // fade hits.
      const separation = dying * size * 0.45
      const glyphSize = size * SPLIT_FRACTION.glyphSize
      drawGlyphBody(
        ctx,
        px,
        py + SPLIT_FRACTION.numeratorDy * size - separation,
        glyphSize,
        SPLIT_FRACTION.numeratorGlyph,
        enemy.color,
      )
      // Vinculum: a horizontal bar with the same cyan/magenta fringe recipe
      // as a glyph, painted inline because no single Unicode bar reads at the
      // required width across systems.
      const vw = size * SPLIT_FRACTION.vinculumHalfWidth
      const vh = size * SPLIT_FRACTION.vinculumThickness
      const fringeOffset = size * 0.07
      const vinculumAlpha = Math.max(0, 1 - dying * 2)
      ctx.save()
      ctx.globalAlpha *= vinculumAlpha
      ctx.save()
      ctx.globalAlpha *= 0.55
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = '#00d6ff'
      ctx.fillRect(px - vw - fringeOffset, py - vh / 2, vw * 2, vh)
      ctx.fillStyle = '#ff2bd6'
      ctx.fillRect(px - vw + fringeOffset, py - vh / 2, vw * 2, vh)
      ctx.restore()
      ctx.fillStyle = enemy.color
      ctx.fillRect(px - vw, py - vh / 2, vw * 2, vh)
      ctx.strokeStyle = '#15111d'
      ctx.lineWidth = Math.max(1, size / 26)
      ctx.strokeRect(px - vw, py - vh / 2, vw * 2, vh)
      ctx.restore()
      drawGlyphBody(
        ctx,
        px,
        py + SPLIT_FRACTION.denominatorDy * size + separation,
        glyphSize,
        SPLIT_FRACTION.denominatorGlyph,
        enemy.color,
      )
    } else if (enemy.type === 'helper') {
      // Σ body breathes when the support aura is live. The breath multiplier
      // sits at 1 when the enemy has no aura, so a future Helper without an
      // aura still renders cleanly.
      const breath = enemy.helperRadius > 0
        ? 1 + (Math.sin(this._time * 2.8 + phase) * 0.5 + 0.5) * HELPER_SIGMA_BREATH
        : 1
      drawGlyphBody(ctx, px, py, size * breath, 'Σ', enemy.color)
    } else if (enemy.type === 'regenerator') {
      // lim glyph is centered inside the rotating dashed ring that
      // `_drawRegenAura` paints; the ring lives outside the death-fade ctx
      // save block so it survives the body translate/scale here.
      drawGlyphBody(ctx, px, py, size * REGENERATOR_LIM_SCALE, 'lim', enemy.color)
    } else if (enemy.type === 'bulwark') {
      this._drawParallelBars(ctx, px, py, size, enemy.color)
      // Rivet dots on each bar — light grey caps over the glyph fringe so the
      // "armoured" read survives at small sizes where the ∥ thickness alone
      // would not.
      ctx.save()
      ctx.fillStyle = '#d6dbe2'
      ctx.strokeStyle = '#33383f'
      ctx.lineWidth = Math.max(1, size / 26)
      const rivetR = Math.max(1, size * 0.055)
      for (const ox of BULWARK_RIVET_OFFSETS_X) {
        for (const oy of BULWARK_RIVET_OFFSETS_Y) {
          ctx.beginPath()
          ctx.arc(px + ox * size, py + oy * size, rivetR, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
      }
      ctx.restore()
    } else if (enemy.type === 'swarmling') {
      drawGlyphBody(ctx, px, py, size * 0.78, 'ε', enemy.color)
      // Orbiting `ε` satellites with the same jitter cadence as the legacy
      // four-dot swarm, so identity reads at a glance.
      for (let i = 0; i < SWARMLING_SATELLITE_COUNT; i++) {
        const ang = (i / SWARMLING_SATELLITE_COUNT) * Math.PI * 2 + this._time * 2.2 + phase
        const jitter = Math.sin(this._time * 18 + i * 5) * size * 0.06
        const orbit = size * SWARMLING_ORBIT_RADIUS + jitter
        const sx = px + Math.cos(ang) * orbit
        const sy = py + Math.sin(ang) * orbit
        drawGlyphBody(ctx, sx, sy, size * SWARMLING_SATELLITE_SCALE, 'ε', enemy.color, {
          fringe: false,
        })
      }
    } else if (enemy.type === 'bossA') {
      drawGlyphBody(ctx, px, py, size * BOSS_A_BODY_SCALE, BOSS_A_BODY_GLYPH, enemy.color)
      // The unsolvable equation orbits the quantifier as flickering fragments;
      // per-fragment flicker gives the "never resolves" feel without using
      // Math.random (deterministic sin wave keyed by index + time).
      for (let i = 0; i < BOSS_A_FRAGMENTS.length; i++) {
        const ang = (i / BOSS_A_FRAGMENTS.length) * Math.PI * 2 + this._time * 0.5 + phase
        const flicker = Math.sin(this._time * 6 + i * 1.7) * 0.5 + 0.5
        if (flicker < 0.2) continue
        const sx = px + Math.cos(ang) * size * BOSS_A_FRAGMENT_RADIUS
        const sy = py + Math.sin(ang) * size * BOSS_A_FRAGMENT_RADIUS * 0.55
        ctx.save()
        ctx.globalAlpha *= 0.45 + flicker * 0.55
        drawGlyphBody(ctx, sx, sy, size * BOSS_A_FRAGMENT_SCALE, BOSS_A_FRAGMENTS[i], '#fbbf24', {
          fringe: false,
        })
        ctx.restore()
      }
    } else if (enemy.type === 'bossB') {
      // Lemniscate (figure-8) body — a stand-in for the Mobius fold drawn via
      // two mirrored bezier lobes. Painted with the same fringe-then-fill
      // recipe as drawGlyphBody so identity sits inside the math-error
      // vocabulary.
      this._drawLemniscate(ctx, px, py, size, enemy.color)
      // Halo of orbiting loop-arrow paradox satellites.
      for (let i = 0; i < BOSS_B_SATELLITE_COUNT; i++) {
        const ang = (i / BOSS_B_SATELLITE_COUNT) * Math.PI * 2 + this._time * 0.8 + phase
        const sx = px + Math.cos(ang) * size * BOSS_B_SATELLITE_RADIUS
        const sy = py + Math.sin(ang) * size * BOSS_B_SATELLITE_RADIUS * 0.6
        this._drawLoopArrow(ctx, sx, sy, size * 0.17, '#f0abfc', ang)
      }
    } else {
      // General — gait wobble is a tiny back-and-forth tilt.
      const wobble = Math.sin(this._time * 4 + phase) * 0.08
      drawGlyphBody(ctx, px, py, size, 'x', enemy.color, { rotation: wobble })
    }

    // Frost tint on a glyph body: re-stroke / re-fill the glyph in cyan at
    // low alpha. The full slime-shaped frost overlay is intentionally
    // skipped — adapting it to glyphs is deferred to the broader Phase 6
    // sweep so 6a/6b keep their diffs tight.
    if (enemy.frostRatio > 0 && enemy.dyingProgress === 0) {
      ctx.save()
      ctx.globalAlpha = 0.55 * enemy.frostRatio
      ctx.globalCompositeOperation = 'lighter'
      if (enemy.type === 'strong') {
        const glyphSize = size * 0.55
        for (const { g, dx, dy, rot } of STRONG_CLUSTER) {
          drawGlyphBody(ctx, px + dx * size, py + dy * size, glyphSize, g, '#bfeaff', {
            rotation: rot,
            fringe: false,
            outline: false,
          })
        }
      } else if (enemy.type === 'split') {
        const glyphSize = size * SPLIT_FRACTION.glyphSize
        drawGlyphBody(ctx, px, py + SPLIT_FRACTION.numeratorDy * size, glyphSize,
          SPLIT_FRACTION.numeratorGlyph, '#bfeaff', { fringe: false, outline: false })
        drawGlyphBody(ctx, px, py + SPLIT_FRACTION.denominatorDy * size, glyphSize,
          SPLIT_FRACTION.denominatorGlyph, '#bfeaff', { fringe: false, outline: false })
        const vw = size * SPLIT_FRACTION.vinculumHalfWidth
        const vh = size * SPLIT_FRACTION.vinculumThickness
        ctx.fillStyle = '#bfeaff'
        ctx.fillRect(px - vw, py - vh / 2, vw * 2, vh)
      } else if (enemy.type === 'helper') {
        drawGlyphBody(ctx, px, py, size, 'Σ', '#bfeaff', { fringe: false, outline: false })
      } else if (enemy.type === 'regenerator') {
        drawGlyphBody(ctx, px, py, size * REGENERATOR_LIM_SCALE, 'lim', '#bfeaff', {
          fringe: false,
          outline: false,
        })
      } else if (enemy.type === 'bulwark') {
        this._drawParallelBars(ctx, px, py, size, '#bfeaff', { fringe: false, outline: false })
      } else if (enemy.type === 'swarmling') {
        drawGlyphBody(ctx, px, py, size * 0.78, 'ε', '#bfeaff', { fringe: false, outline: false })
      } else if (enemy.type === 'bossA') {
        drawGlyphBody(ctx, px, py, size * BOSS_A_BODY_SCALE, BOSS_A_BODY_GLYPH, '#bfeaff', {
          fringe: false,
          outline: false,
        })
      } else if (enemy.type === 'bossB') {
        this._drawLemniscate(ctx, px, py, size, '#bfeaff', { fringe: false, outline: false })
      } else {
        const glyph = enemy.type === 'fast' ? '÷' : 'x'
        const rot = enemy.type === 'fast' ? -0.22 : 0
        drawGlyphBody(ctx, px, py, size, glyph, '#bfeaff', {
          rotation: rot,
          fringe: false,
          outline: false,
        })
      }
      ctx.restore()
    }
  }

  // Visual Redesign Phase 1: brief screen-blend overlay on impact. Anchored
  // to the post-translate origin used by `_drawSlime` so the flash tracks
  // the squash/pulse offset exactly.
  private _drawHitFlash(ctx: CanvasRenderingContext2D, px: number, py: number, enemy: EnemyView): void {
    const age = enemy.hitFlashAge
    if (age <= 0 || age >= ANIM.HIT_FLASH) return
    const intensity = 1 - age / ANIM.HIT_FLASH
    const half = enemy.size / 2

    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = intensity
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    // All enemies now use a circular flash sized to the glyph silhouette.
    ctx.arc(px, py, half * 0.9, 0, Math.PI * 2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  private _drawGroundShadow(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.beginPath()
    ctx.ellipse(px, py + size * 0.42, size * 0.52, size * 0.18, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  private _drawFrostAura(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    intensity: number,
  ): void {
    const pulse = Math.sin(this._time * 5.5 + px * 0.025) * 0.5 + 0.5
    const radius = size * (0.66 + intensity * 0.22 + pulse * 0.05)

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    const mist = ctx.createRadialGradient(px, py, size * 0.1, px, py, radius * 1.65)
    mist.addColorStop(0, `rgba(240, 255, 255, ${0.3 * intensity})`)
    mist.addColorStop(0.38, `rgba(92, 205, 255, ${0.24 * intensity})`)
    mist.addColorStop(0.76, `rgba(41, 128, 230, ${0.08 * intensity})`)
    mist.addColorStop(1, 'rgba(35, 90, 150, 0)')
    ctx.fillStyle = mist
    ctx.beginPath()
    ctx.ellipse(px, py + size * 0.12, radius * 0.9, radius * 0.72, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = `rgba(210, 250, 255, ${0.34 * intensity})`
    ctx.lineWidth = Math.max(1, size / 22)
    ctx.setLineDash([size * 0.12, size * 0.08])
    ctx.beginPath()
    ctx.ellipse(px, py + size * 0.42, size * 0.56, size * 0.2, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 - this._time * 0.55
      const orbit = size * (0.48 + (i % 3) * 0.07)
      const flakeSize = size * (0.035 + (i % 2) * 0.012)
      ctx.save()
      ctx.translate(px + Math.cos(a) * orbit, py + Math.sin(a) * orbit - size * 0.08)
      ctx.rotate(a + this._time * 0.4)
      ctx.strokeStyle = `rgba(232, 255, 255, ${0.44 * intensity})`
      ctx.lineWidth = Math.max(1, size / 42)
      this._traceTinySnowflake(ctx, flakeSize)
      ctx.stroke()
      ctx.restore()
    }

    ctx.restore()
  }

  private _traceTinySnowflake(ctx: CanvasRenderingContext2D, size: number): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size)
      ctx.moveTo(Math.cos(a) * size * 0.55, Math.sin(a) * size * 0.55)
      ctx.lineTo(Math.cos(a + 0.55) * size * 0.78, Math.sin(a + 0.55) * size * 0.78)
      ctx.moveTo(Math.cos(a) * size * 0.55, Math.sin(a) * size * 0.55)
      ctx.lineTo(Math.cos(a - 0.55) * size * 0.78, Math.sin(a - 0.55) * size * 0.78)
      ctx.stroke()
    }
  }

  /**
   * Regenerator aura — deliberately a different visual language from the
   * Helper's flat translucent disc: a rotating dashed ring plus rising "+ε"
   * glyph particles, so the two green enemies are never confused.
   */
  private _drawRegenAura(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
    const pulse = Math.sin(this._time * 3.4) * 0.5 + 0.5
    const radius = size * (0.78 + pulse * 0.12)

    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(this._time * 0.9)
    ctx.globalAlpha = 0.32 + pulse * 0.24
    ctx.strokeStyle = EnemyRenderer.REGEN_AURA
    ctx.lineWidth = Math.max(1.4, size / 12)
    ctx.setLineDash([size * 0.2, size * 0.16])
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()

    // Phase 6d: rising "+ε" glyphs replace the prior plain cross particles so
    // the regen motif stays in the math-error vocabulary established by the
    // glyph body. Particles ascend and fade over a 1-cycle phase window.
    ctx.save()
    for (let i = 0; i < 3; i++) {
      const phase = (this._time * 0.6 + i / 3) % 1
      const cx = px + Math.sin(i * 2.1 + this._time) * size * 0.32
      const cy = py - size * 0.2 - phase * size * 0.9
      ctx.globalAlpha = (1 - phase) * 0.85
      drawGlyphBody(ctx, cx, cy, size * 0.34, '+ε', EnemyRenderer.REGEN_AURA, {
        fringe: false,
        outline: false,
      })
    }
    ctx.restore()
  }

  /**
   * Bulwark's two-parallel-walls body. Self-drawn (not the Unicode `∥`) so it
   * never falls back to a tofu box on systems without U+2225. Mirrors the
   * `drawGlyphBody` recipe: cyan/magenta chromatic fringe → dark outline →
   * solid fill, applied to two vertical bars.
   */
  private _drawParallelBars(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    color: string,
    options: { fringe?: boolean; outline?: boolean } = {},
  ): void {
    const { fringe = true, outline = true } = options
    const barW = size * BULWARK_BAR_WIDTH
    const barH = size * BULWARK_BAR_HEIGHT
    const sep = size * BULWARK_BAR_HALF_SEP
    const top = py - barH / 2
    const fringeOffset = size * 0.07

    const fillBars = (fill: string, ox: number): void => {
      ctx.fillStyle = fill
      ctx.fillRect(px - sep - barW / 2 + ox, top, barW, barH)
      ctx.fillRect(px + sep - barW / 2 + ox, top, barW, barH)
    }

    if (fringe) {
      ctx.save()
      ctx.globalAlpha *= 0.55
      ctx.globalCompositeOperation = 'lighter'
      fillBars('#00d6ff', -fringeOffset)
      fillBars('#ff2bd6', fringeOffset)
      ctx.restore()
    }

    if (outline) {
      ctx.save()
      ctx.strokeStyle = '#15111d'
      ctx.lineWidth = Math.max(1, size / 14)
      ctx.lineJoin = 'round'
      ctx.strokeRect(px - sep - barW / 2, top, barW, barH)
      ctx.strokeRect(px + sep - barW / 2, top, barW, barH)
      ctx.restore()
    }

    ctx.save()
    fillBars(color, 0)
    ctx.restore()
  }

  /**
   * Boss B's orbiting paradox satellite — a circular "reload/loop" arrow drawn
   * as a path (not the Unicode `↻`) so it never tofu-boxes on systems missing
   * U+21BB. An open arc with an arrowhead at one end; dark outline then colour.
   */
  private _drawLoopArrow(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    color: string,
    rotation: number,
  ): void {
    const lw = Math.max(1.5, radius / 3.2)
    const gap = 1.1 // radians of opening left for the arrowhead
    const start = gap / 2
    const end = Math.PI * 2 - gap / 2

    // Arrowhead at the `end` of the arc, pointing along the (CCW) tangent.
    const ex = Math.cos(end) * radius
    const ey = Math.sin(end) * radius
    const tx = -Math.sin(end)
    const ty = Math.cos(end)
    const radx = Math.cos(end)
    const rady = Math.sin(end)
    const head = radius * 0.7
    const wing = radius * 0.55
    const tipX = ex + tx * head
    const tipY = ey + ty * head
    const baseX = ex - tx * head * 0.2
    const baseY = ey - ty * head * 0.2

    const traceArc = (): void => {
      ctx.beginPath()
      ctx.arc(0, 0, radius, start, end)
    }
    const traceHead = (): void => {
      ctx.beginPath()
      ctx.moveTo(tipX, tipY)
      ctx.lineTo(baseX + radx * wing, baseY + rady * wing)
      ctx.lineTo(baseX - radx * wing, baseY - rady * wing)
      ctx.closePath()
    }

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rotation)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Dark outline pass for readability against the fringed body.
    ctx.strokeStyle = '#15111d'
    ctx.fillStyle = '#15111d'
    ctx.lineWidth = lw + Math.max(1, radius / 5)
    traceArc()
    ctx.stroke()
    traceHead()
    ctx.fill()
    ctx.stroke()

    // Colour pass.
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = lw
    traceArc()
    ctx.stroke()
    traceHead()
    ctx.fill()

    ctx.restore()
  }

  /**
   * Phase 6f: Boss B's lemniscate (figure-8) body. Two mirrored bezier lobes
   * form a horizontal infinity loop; painted with the same chromatic-fringe
   * recipe used by `drawGlyphBody` so the boss reads as part of the
   * math-error vocabulary rather than an outlier shape.
   */
  private _drawLemniscate(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    color: string,
    options: { fringe?: boolean; outline?: boolean } = {},
  ): void {
    const { fringe = true, outline = true } = options
    const a = size * 0.46
    const b = size * 0.28
    const lw = Math.max(2, size / 9)

    const tracePath = (): void => {
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.bezierCurveTo(px + a * 0.3, py - b, px + a, py - b, px + a, py)
      ctx.bezierCurveTo(px + a, py + b, px + a * 0.3, py + b, px, py)
      ctx.bezierCurveTo(px - a * 0.3, py - b, px - a, py - b, px - a, py)
      ctx.bezierCurveTo(px - a, py + b, px - a * 0.3, py + b, px, py)
    }

    if (fringe) {
      ctx.save()
      ctx.globalAlpha *= 0.55
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineWidth = lw
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#00d6ff'
      ctx.save(); ctx.translate(-size * 0.07, 0); tracePath(); ctx.stroke(); ctx.restore()
      ctx.strokeStyle = '#ff2bd6'
      ctx.save(); ctx.translate(size * 0.07, 0); tracePath(); ctx.stroke(); ctx.restore()
      ctx.restore()
    }

    if (outline) {
      ctx.save()
      ctx.lineWidth = lw + Math.max(1, size / 14)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#15111d'
      tracePath()
      ctx.stroke()
      ctx.restore()
    }

    ctx.save()
    ctx.lineWidth = lw
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = color
    tracePath()
    ctx.stroke()
    ctx.restore()
  }

}
