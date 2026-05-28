/**
 * PetRenderer — Visual Redesign Phase 6.5-A.
 *
 * Pets are recast as "math helper symbols" so they share the construction
 * vocabulary of Phase 6 enemies but read clearly as allies:
 *   - cyan-only chromatic fringe (vs hostile cyan/magenta);
 *   - glyph-body silhouette: `½` (slow) / `→` (fast) / `×` (heavy) / `+` (basic);
 *   - the legacy aura ring + orbiting satellites stay as the "allied buff
 *     field" cue — they were already best-in-class and visually distinguish
 *     pets from inert glyph bodies.
 */
import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { projectPetScene } from '@/engine/projections/project-pets'
import type { PetTrait } from '@/engine/projections/views'
import { TOWER_DEFS } from '@/data/tower-defs'
import { TowerType } from '@/data/constants'
import { drawGlyphBody } from './primitives'

// Pet trait colours mirror the identity colour of the tower each trait evokes
// (n=1 → Radar B, n=2 → Matrix, n=3 → Limit) so the calculus pet reads as the
// same family on-canvas; sourced from TOWER_DEFS to avoid a parallel palette.
const TRAIT_COLORS: Record<PetTrait, string> = {
  slow:  TOWER_DEFS[TowerType.RADAR_B].color,
  fast:  TOWER_DEFS[TowerType.MATRIX].color,
  heavy: TOWER_DEFS[TowerType.LIMIT].color,
  basic: '#a3a3a3',
}

const TRAIT_GLYPHS: Record<PetTrait, string> = {
  slow:  '½', // ½ — slow factor (divides enemy speed)
  fast:  '→', // → — speed boost
  heavy: '×', // × — damage multiplier
  basic: '+',
}

/** Cyan-only fringe distinguishes allied pets from hostile cyan/magenta enemies. */
const ALLIED_FRINGE: readonly [string, string] = ['#7df3ff', '#00d6ff']

const PET_GLYPH_SIZE = 18

export class PetRenderer {
  private _time = 0

  update(dt: number, _game: Game): void {
    this._time += dt
  }

  render(renderer: Renderer, game: Game): void {
    const view = projectPetScene(game)
    const { ctx } = renderer

    for (const pet of view.pets) {
      const px = gameToCanvasX(pet.x)
      const py = gameToCanvasY(pet.y)
      const color = TRAIT_COLORS[pet.trait]
      const bob = Math.sin(this._time * 4 + px * 0.05) * 1.2
      const y = py + bob
      const pulse = Math.sin(this._time * 5) * 0.5 + 0.5

      ctx.save()
      this._drawAura(ctx, px, y, color, pulse)
      this._drawSatellites(ctx, px, y, color)
      drawGlyphBody(ctx, px, y, PET_GLYPH_SIZE, TRAIT_GLYPHS[pet.trait], color, {
        fringeColors: ALLIED_FRINGE,
        fringeAlpha: 0.45,
      })
      ctx.restore()
    }
  }

  private _drawAura(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    color: string,
    pulse: number,
  ): void {
    ctx.save()
    ctx.globalAlpha = 0.16 + pulse * 0.12
    const glow = ctx.createRadialGradient(px, py, 2, px, py, 15 + pulse * 2)
    glow.addColorStop(0, '#ffffff')
    glow.addColorStop(0.32, color)
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(px, py, 15 + pulse * 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private _drawSatellites(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    ctx.save()
    ctx.fillStyle = color
    ctx.strokeStyle = 'rgba(255,255,255,0.72)'
    ctx.lineWidth = 1
    for (let i = 0; i < 2; i++) {
      const a = this._time * 2.8 + i * Math.PI
      const sx = px + Math.cos(a) * 11
      const sy = py + Math.sin(a) * 4.5
      ctx.globalAlpha = 0.65
      ctx.beginPath()
      ctx.arc(sx, sy, 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }
}
