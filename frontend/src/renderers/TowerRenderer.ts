/**
 * TowerRenderer — paints towers from a TowerSceneView snapshot (F-ARCH-4).
 * Never reads Tower entity fields directly; engine/projections/project-towers.ts
 * owns that surface.
 */
import type { Renderer, RendererPalette } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { UNIT_PX, ANIM } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { projectTowerScene } from '@/engine/projections/project-towers'
import type { TowerSceneView, TowerView } from '@/engine/projections/views'

const TOWER_RADIUS = 14
const HIGHLIGHT = 'rgba(255,255,255,0.82)'
// Visual Redesign Phase 3 tuning.
const TIER_GOLD = '#c47206'
const TIER_RING_RUNES = ['+', '−', '×', '÷', '∫', '∑', '∂', 'π']
const IDLE_BREATH_OMEGA = 1.6
const IDLE_BREATH_AMPLITUDE = 0.02
const TIER_RING_OMEGA = 0.35
// Visual Redesign Phase 5a — Magic instrument tuning. Scroll dimensions sit
// inside the 22×22 instrument-bounding-box rule (see Plan §5 "Common
// silhouette"). Curve omega chosen so adjacent Magic towers visibly desync
// via tower.idleSeed.
const MAGIC_SCROLL_W = 18
const MAGIC_SCROLL_H = 13
const MAGIC_CURVE_OMEGA = 2.1
const MAGIC_BREATH_OMEGA = 1.8
// Visual Redesign Phase 5b — Radar instruments (navigation-tool vocabulary):
// A = sextant (sweeping index arm on a graduated arc),
// B = astrolabe (two opposing concentric rings),
// C = brass telescope on tripod that tracks the nearest enemy.
const SEXTANT_ARC_SPAN = Math.PI / 3
const SEXTANT_ARC_RADIUS = 10
const SEXTANT_SWEEP_OMEGA = 1.6
const ASTROLABE_OUTER_R = 10
const ASTROLABE_INNER_R = 6
const ASTROLABE_OUTER_OMEGA = 0.8
const ASTROLABE_INNER_OMEGA = -1.15
const TELESCOPE_LENGTH = 14
// Visual Redesign Phase 5c — Matrix instrument: floating 2×2 bracket pair
// `[ ]` with cells holding tiny scrolling digits. On fire two diagonal cells
// flash white briefly. Geometry fits inside the 22×22 instrument bounding box.
const MATRIX_BRACKET_W = 20
const MATRIX_BRACKET_H = 16
const MATRIX_BRACKET_SERIF = 3
// Visual Redesign Phase 5d — Limit instrument: two dashed vertical asymptotes
// flank a point that ascends from below and approaches the upper bound. The
// approach is sawtooth-shaped: the point eases up across LIMIT_PERIOD seconds,
// gets arbitrarily close to the bound, then resets at the floor — telegraphing
// the "limit but never reaches" intuition. On fire the point snaps to the
// bound and the asymptotes pulse.
//
// Phase 6 Q8 wiring (2026-05-27): when `tower.chargeProgress` is non-null
// (i.e. the tower is configured and the cooldown is acting as the burst-
// charge window), the point ascends *from chargeProgress* instead of from a
// free-running time sawtooth. That way the asymptote-approach visibly tracks
// the actual burst cadence — a fully charged LIMIT visibly kisses the bound,
// a freshly-fired one sits at the floor.
const LIMIT_ASYMPTOTE_X = 9
const LIMIT_TOP_Y = -8
const LIMIT_BOUND_Y = -6
const LIMIT_FLOOR_Y = 6
const LIMIT_BOTTOM_Y = 8
const LIMIT_PERIOD = 2.4
const LIMIT_APPROACH_GAMMA = 2.4
// Baseplate charge arc — a thin tower-color arc spanning the bottom of the
// octagon that sweeps clockwise as `chargeProgress` rises 0 → 1. At 1 the arc
// is a full ring; on burst it flashes white and the ring fade-resets to 0.
const LIMIT_CHARGE_ARC_RADIUS = TOWER_RADIUS + 3
const LIMIT_CHARGE_ARC_START = Math.PI * 0.5  // start at "south" canvas pole
// Visual Redesign Phase 5e — Calculus instrument: a large rotating ∫ sigil
// centred over a thin "area under curve" gradient. On fire the tower sheds
// small `dx` / `dy` glyph particles that fly outward along the aim vector,
// fading as they travel.
const CALCULUS_INTEGRAL_SIZE = 18
const CALCULUS_ROTATE_OMEGA = 0.45
const CALCULUS_CURVE_HALF_W = 9
const CALCULUS_CURVE_BASE_Y = 7
const CALCULUS_CURVE_PEAK_Y = -5
const CALCULUS_PARTICLE_DIST = 18
const CALCULUS_PARTICLE_LATERAL = 3.5

export class TowerRenderer {
  private _palette!: RendererPalette
  private _time = 0

  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    this._palette = renderer.palette
    // Cache engine time once per frame so idle / tier animations stay in lock-
    // step across the per-tower loop and remain pause-safe (game.time freezes
    // when the engine is paused).
    this._time = game.time
    const view = projectTowerScene(game)
    this._drawCursor(renderer, view)
    for (const t of view.towers) this._drawTower(renderer, view, t)
  }

  private _drawCursor(renderer: Renderer, view: TowerSceneView): void {
    // §19: keyboard focus cursor (WCAG 2.4.7). Drawn before towers so an
    // existing tower at the focused cell renders on top — the ring still
    // surrounds it. Only visible during BUILD per §19.4 (cursor invisible
    // during WAVE phase). Cleared by useKeyboardPlacement on phase exit.
    if (!view.showCoords || view.cursor === null) return
    const { ctx } = renderer
    const px = gameToCanvasX(view.cursor.gx)
    const py = gameToCanvasY(view.cursor.gy)
    const radius = UNIT_PX * 0.55

    ctx.save()
    // Dark outer halo gives the gold ring contrast against any tile fill,
    // satisfying the 3:1 focus-indicator contrast requirement of SC 1.4.11.
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.stroke()

    ctx.lineWidth = 2
    ctx.strokeStyle = this._palette.axis
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  private _drawTower(renderer: Renderer, view: TowerSceneView, tower: TowerView): void {
    const { ctx } = renderer
    const px = gameToCanvasX(tower.x)
    const py = gameToCanvasY(tower.y)
    const alpha = tower.disabled ? 0.35 : 1.0

    ctx.save()
    ctx.globalAlpha = alpha

    // Shadow stays at base scale so the tower visually "lifts" during the
    // idle breath instead of the whole stack inflating.
    this._drawShadow(ctx, px, py)

    // Idle breath: stable per-tower phase offset prevents synchronized pulse.
    // Disabled towers freeze at scale=1 (no breath); a wheezing dead tower
    // would read as alive.
    const breathScale = tower.disabled
      ? 1
      : 1 + Math.sin(this._time * IDLE_BREATH_OMEGA + tower.idleSeed) * IDLE_BREATH_AMPLITUDE

    ctx.save()
    ctx.translate(px, py)
    ctx.scale(breathScale, breathScale)
    ctx.translate(-px, -py)

    this._drawConfiguredGlow(ctx, px, py, tower)
    this._drawTowerBody(ctx, px, py, tower)
    this._drawTierRing(ctx, px, py, tower)
    this._drawGlyph(ctx, px, py, tower)
    this._drawMuzzleFlash(ctx, px, py, tower)

    if (tower.disabled) {
      this._drawDisabledMark(ctx, px, py)
    }

    ctx.restore()
    ctx.restore()

    if (view.showCoords) {
      ctx.fillStyle = this._palette.axis
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(`(${tower.x},${tower.y})`, px, py - 18)
    }
  }

  private _drawShadow(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.38)'
    ctx.beginPath()
    ctx.ellipse(px, py + 7, 18, 7, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  private _drawConfiguredGlow(ctx: CanvasRenderingContext2D, px: number, py: number, tower: TowerView): void {
    if (!tower.configured) return
    ctx.save()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.globalAlpha *= 0.65
    ctx.beginPath()
    ctx.arc(px, py, 17, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = `${tower.color}99`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(px, py, 20, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  private _drawTowerBody(ctx: CanvasRenderingContext2D, px: number, py: number, tower: TowerView): void {
    this._drawBasePlate(ctx, px, py, tower.color, tower.level)

    switch (tower.type) {
      case 'magic':
        this._drawMagicTower(ctx, px, py, tower)
        break
      case 'radarA':
        this._drawSweepRadar(ctx, px, py, tower)
        break
      case 'radarB':
        this._drawRapidRadar(ctx, px, py, tower)
        break
      case 'radarC':
        this._drawSniperRadar(ctx, px, py, tower)
        break
      case 'matrix':
        this._drawMatrixTower(ctx, px, py, tower)
        break
      case 'limit':
        this._drawLimitTower(ctx, px, py, tower)
        break
      case 'calculus':
        this._drawCalculusTower(ctx, px, py, tower)
        break
    }
  }

  private _drawBasePlate(ctx: CanvasRenderingContext2D, px: number, py: number, color: string, level: number): void {
    ctx.fillStyle = this._palette.stoneLight
    ctx.strokeStyle = `${color}cc`
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 8 + i * Math.PI / 4
      const x = px + Math.cos(a) * TOWER_RADIUS
      const y = py + Math.sin(a) * TOWER_RADIUS
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(px, py, 9.5, 0, Math.PI * 2)
    ctx.stroke()

    // Visual Redesign Phase 3: T2 gold rim. Drawn over the colored octagon
    // edge so the tier is unambiguously readable; T3 keeps the gold rim and
    // adds the rotating glyph ring in _drawTierRing.
    if (level >= 2) {
      ctx.strokeStyle = TIER_GOLD
      ctx.lineWidth = 1.6
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 8 + i * Math.PI / 4
        const x = px + Math.cos(a) * (TOWER_RADIUS + 1)
        const y = py + Math.sin(a) * (TOWER_RADIUS + 1)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()
    }
  }

  // Visual Redesign Phase 3: T3 rotating outer ring of mathematical
  // sub-glyphs. Slow rotation telegraphs "this tower is fully upgraded"
  // without distracting from combat. Drawn between body and primary glyph so
  // the muzzle flash still overlays cleanly on fire.
  private _drawTierRing(ctx: CanvasRenderingContext2D, px: number, py: number, tower: TowerView): void {
    if (tower.level < 3) return
    const angle = this._time * TIER_RING_OMEGA + tower.idleSeed
    const radius = TOWER_RADIUS + 6
    ctx.save()
    ctx.font = 'bold 7px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = TIER_GOLD
    ctx.strokeStyle = 'rgba(0,0,0,0.65)'
    ctx.lineWidth = 1.6
    ctx.globalAlpha = 0.85
    for (let i = 0; i < TIER_RING_RUNES.length; i++) {
      const a = angle + (i / TIER_RING_RUNES.length) * Math.PI * 2
      const x = px + Math.cos(a) * radius
      const y = py + Math.sin(a) * radius
      ctx.strokeText(TIER_RING_RUNES[i], x, y)
      ctx.fillText(TIER_RING_RUNES[i], x, y)
    }
    ctx.restore()
  }

  // Visual Redesign Phase 5a — Magic instrument body.
  // Replaces the orbit-ring + diamond-crystal silhouette with a small floating
  // parchment scroll bearing an animated sinusoidal curve. The curve breathes
  // (amplitude oscillates per tower.idleSeed so adjacent Magic towers desync)
  // and flashes brighter on TOWER_FIRED — read off tower.firingFlashAge.
  private _drawMagicTower(ctx: CanvasRenderingContext2D, px: number, py: number, tower: TowerView): void {
    const color = tower.color
    const sx = px - MAGIC_SCROLL_W / 2
    const sy = py - MAGIC_SCROLL_H / 2

    // Soft drop-shadow so the scroll reads as floating above the baseplate.
    ctx.fillStyle = 'rgba(0,0,0,0.32)'
    ctx.fillRect(sx + 1, sy + 1.5, MAGIC_SCROLL_W, MAGIC_SCROLL_H)

    // Parchment body: warm cream vertical gradient.
    const parchment = ctx.createLinearGradient(sx, sy, sx, sy + MAGIC_SCROLL_H)
    parchment.addColorStop(0, '#f4e4bc')
    parchment.addColorStop(1, '#d9bd84')
    ctx.fillStyle = parchment
    ctx.fillRect(sx, sy, MAGIC_SCROLL_W, MAGIC_SCROLL_H)

    // Curled top & bottom rolls — darker tan band so the silhouette reads as
    // a scroll instead of a flat card.
    ctx.fillStyle = '#a88a4e'
    ctx.fillRect(sx, sy, MAGIC_SCROLL_W, 1.6)
    ctx.fillRect(sx, sy + MAGIC_SCROLL_H - 1.6, MAGIC_SCROLL_W, 1.6)

    // Outline.
    ctx.strokeStyle = this._palette.stoneDark
    ctx.lineWidth = 1
    ctx.strokeRect(sx + 0.5, sy + 0.5, MAGIC_SCROLL_W - 1, MAGIC_SCROLL_H - 1)

    // Curve geometry. Idle breath modulates amplitude; firing inflates it.
    const firing = tower.firingFlashAge < ANIM.TOWER_FIRE_FLASH
    const fireT = firing ? 1 - tower.firingFlashAge / ANIM.TOWER_FIRE_FLASH : 0
    const baseAmp = 2.6
    const breath = Math.sin(this._time * MAGIC_BREATH_OMEGA + tower.idleSeed) * 0.6
    const amp = baseAmp + breath + fireT * 1.4
    const phase = this._time * MAGIC_CURVE_OMEGA + tower.idleSeed
    const curveLeft = sx + 1.5
    const curveRight = sx + MAGIC_SCROLL_W - 1.5
    const steps = 22
    const path = (): void => {
      ctx.beginPath()
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const cxp = curveLeft + t * (curveRight - curveLeft)
        const cyp = py + Math.sin(t * Math.PI * 2 + phase) * amp
        if (i === 0) ctx.moveTo(cxp, cyp)
        else ctx.lineTo(cxp, cyp)
      }
    }

    // Firing bloom underneath: paints first so the sharp top stroke wins.
    if (firing) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = color
      ctx.globalAlpha = fireT * 0.6
      ctx.lineWidth = 4
      path()
      ctx.stroke()
      ctx.restore()
    }

    // Primary curve stroke: tower-color, brightens to white during firing.
    ctx.strokeStyle = firing ? '#ffffff' : color
    ctx.lineWidth = firing ? 2.2 : 1.7
    path()
    ctx.stroke()
  }

  // Visual Redesign Phase 5b — Radar A as a sextant. A graduated arc frame
  // anchored at the pivot (centre) with a slow index-arm sweep telegraphing
  // the AoE sweep mechanic. Sweep span fixed; sweep speed cosmetic only —
  // the actual gameplay sweep lives in RadarTowerSystem.
  private _drawSweepRadar(ctx: CanvasRenderingContext2D, px: number, py: number, tower: TowerView): void {
    const color = tower.color
    // Arc frame opens upward-right; rotate so it reads as the player's
    // configured arc midpoint when configured, else the default upper-right.
    const arcMid = (tower.arcStart + tower.arcEnd) / 2
    const frameStart = -arcMid - SEXTANT_ARC_SPAN / 2
    const frameEnd = -arcMid + SEXTANT_ARC_SPAN / 2

    // Outer graduated arc — thick brass-tinted band.
    ctx.save()
    ctx.lineCap = 'round'
    ctx.strokeStyle = this._palette.stoneDark
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(px, py, SEXTANT_ARC_RADIUS, frameStart, frameEnd)
    ctx.stroke()

    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(px, py, SEXTANT_ARC_RADIUS, frameStart, frameEnd)
    ctx.stroke()

    // Graduation tick marks along the arc.
    const ticks = 6
    ctx.strokeStyle = HIGHLIGHT
    ctx.lineWidth = 1
    for (let i = 0; i <= ticks; i++) {
      const t = i / ticks
      const a = frameStart + t * (frameEnd - frameStart)
      const x1 = px + Math.cos(a) * (SEXTANT_ARC_RADIUS - 2)
      const y1 = py + Math.sin(a) * (SEXTANT_ARC_RADIUS - 2)
      const x2 = px + Math.cos(a) * (SEXTANT_ARC_RADIUS + 1)
      const y2 = py + Math.sin(a) * (SEXTANT_ARC_RADIUS + 1)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
    ctx.restore()

    // Sweeping index arm. Position triangle-waves across the arc span so it
    // visibly reverses at the endpoints, matching the sextant interaction.
    const phase = (this._time * SEXTANT_SWEEP_OMEGA + tower.idleSeed) % (Math.PI * 2)
    const tri = Math.abs(((phase / Math.PI) % 2) - 1)
    const armAngle = frameStart + tri * (frameEnd - frameStart)
    const tipX = px + Math.cos(armAngle) * (SEXTANT_ARC_RADIUS + 1)
    const tipY = py + Math.sin(armAngle) * (SEXTANT_ARC_RADIUS + 1)

    ctx.save()
    ctx.strokeStyle = this._palette.stoneDark
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(tipX, tipY)
    ctx.stroke()
    ctx.strokeStyle = HIGHLIGHT
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(tipX, tipY)
    ctx.stroke()
    ctx.restore()

    // Pivot stud.
    this._drawNode(ctx, px, py, color, 2.2)
  }

  // Visual Redesign Phase 5b — Radar B as an astrolabe. Two concentric rings
  // counter-rotate (telegraphing "this tower fires fast / often") with a
  // central jewel in the tower color. No gameplay state read; purely
  // time-driven so adjacent astrolabes desync via tower.idleSeed.
  private _drawRapidRadar(ctx: CanvasRenderingContext2D, px: number, py: number, tower: TowerView): void {
    const color = tower.color
    const outerAngle = this._time * ASTROLABE_OUTER_OMEGA + tower.idleSeed
    const innerAngle = this._time * ASTROLABE_INNER_OMEGA + tower.idleSeed * 1.3

    // Outer ring.
    ctx.save()
    ctx.strokeStyle = this._palette.stoneDark
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.arc(px, py, ASTROLABE_OUTER_R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.arc(px, py, ASTROLABE_OUTER_R, 0, Math.PI * 2)
    ctx.stroke()

    // Outer cardinal markers — rotate with the ring.
    ctx.fillStyle = HIGHLIGHT
    for (let i = 0; i < 4; i++) {
      const a = outerAngle + (i * Math.PI) / 2
      const mx = px + Math.cos(a) * ASTROLABE_OUTER_R
      const my = py + Math.sin(a) * ASTROLABE_OUTER_R
      ctx.beginPath()
      ctx.arc(mx, my, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    // Inner ring (counter-rotating diagonal markers).
    ctx.save()
    ctx.strokeStyle = `${color}cc`
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(px, py, ASTROLABE_INNER_R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = HIGHLIGHT
    for (let i = 0; i < 4; i++) {
      const a = innerAngle + (i * Math.PI) / 2 + Math.PI / 4
      const mx = px + Math.cos(a) * ASTROLABE_INNER_R
      const my = py + Math.sin(a) * ASTROLABE_INNER_R
      ctx.beginPath()
      ctx.arc(mx, my, 1.2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    // Central jewel.
    this._drawNode(ctx, px, py, color, 3)
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.beginPath()
    ctx.arc(px - 0.8, py - 0.8, 1.1, 0, Math.PI * 2)
    ctx.fill()
  }

  // Visual Redesign Phase 5b — Radar C as a brass telescope on a tripod.
  // The tube rotates to track the enemy RadarTowerSystem would actually fire
  // at (tower.aimAngle, sourced from selectRadarTargets so barrel + dashed
  // bore-sight + projectile all agree). When idle (no target) the tube rests
  // at the arc midpoint so it visibly points where the player aimed the arc.
  private _drawSniperRadar(ctx: CanvasRenderingContext2D, px: number, py: number, tower: TowerView): void {
    const color = tower.color

    // Tripod legs — three short struts radiating down behind the tube.
    ctx.save()
    ctx.strokeStyle = this._palette.stoneDark
    ctx.lineWidth = 1.6
    ctx.lineCap = 'round'
    for (const legAngle of [-Math.PI / 2 + 2.2, -Math.PI / 2 + 3.5, -Math.PI / 2 + 4.7]) {
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + Math.cos(legAngle) * 7, py + Math.sin(legAngle) * 7)
      ctx.stroke()
    }
    ctx.restore()

    // Telescope tube. Aim direction: tracked target (cosmetic angle from
    // projection) when available, else arc midpoint. Game-space angles are
    // negated for the canvas rotate because canvas-y is inverted relative to
    // the game grid.
    const arcMid = (tower.arcStart + tower.arcEnd) / 2
    const aimGame = tower.aimAngle !== null ? tower.aimAngle : arcMid
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(-aimGame)
    // Tube body — dark outline then brass-toned core.
    ctx.strokeStyle = this._palette.stoneDark
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-3, 0)
    ctx.lineTo(TELESCOPE_LENGTH, 0)
    ctx.stroke()
    ctx.strokeStyle = color
    ctx.lineWidth = 4.5
    ctx.beginPath()
    ctx.moveTo(-3, 0)
    ctx.lineTo(TELESCOPE_LENGTH, 0)
    ctx.stroke()
    // Highlight along the top edge.
    ctx.strokeStyle = HIGHLIGHT
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-2, -1.5)
    ctx.lineTo(TELESCOPE_LENGTH - 1, -1.5)
    ctx.stroke()
    // Objective lens at the far end.
    ctx.fillStyle = this._palette.stoneDark
    ctx.beginPath()
    ctx.arc(TELESCOPE_LENGTH + 1, 0, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = `${color}ee`
    ctx.beginPath()
    ctx.arc(TELESCOPE_LENGTH + 1, 0, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = HIGHLIGHT
    ctx.beginPath()
    ctx.arc(TELESCOPE_LENGTH + 0.4, -0.6, 0.8, 0, Math.PI * 2)
    ctx.fill()
    // Eyepiece flange near the pivot.
    ctx.fillStyle = this._palette.stoneDark
    ctx.beginPath()
    ctx.arc(-3, 0, 2.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Pivot pin.
    this._drawNode(ctx, px, py, HIGHLIGHT, 1.6)
  }

  // Visual Redesign Phase 5c — Matrix instrument body.
  // Floating 2×2 bracket pair `[ ]` with four cells holding deterministically
  // scrolling digits (seeded per tower.id so adjacent Matrix towers desync).
  // On fire one diagonal pair of cells flashes white; the diagonal choice is
  // also seeded so each tower picks the same diagonal every time.
  private _drawMatrixTower(ctx: CanvasRenderingContext2D, px: number, py: number, tower: TowerView): void {
    const color = tower.color
    const halfW = MATRIX_BRACKET_W / 2
    const halfH = MATRIX_BRACKET_H / 2
    const left = px - halfW
    const right = px + halfW
    const top = py - halfH
    const bottom = py + halfH

    // Brackets: dark stoneDark backbone + tower-color overlay.
    const drawBracket = (x: number, dir: 1 | -1): void => {
      const serifX = x + MATRIX_BRACKET_SERIF * dir
      ctx.beginPath()
      ctx.moveTo(serifX, top)
      ctx.lineTo(x, top)
      ctx.lineTo(x, bottom)
      ctx.lineTo(serifX, bottom)
      ctx.stroke()
    }
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = this._palette.stoneDark
    ctx.lineWidth = 3.4
    drawBracket(left, 1)
    drawBracket(right, -1)
    ctx.strokeStyle = color
    ctx.lineWidth = 1.8
    drawBracket(left, 1)
    drawBracket(right, -1)
    ctx.restore()

    // Cell centers (NW, NE, SW, SE) — leave enough margin from the brackets
    // so the digits read clearly at the small body size.
    const innerLeft = left + MATRIX_BRACKET_SERIF + 1.5
    const innerRight = right - MATRIX_BRACKET_SERIF - 1.5
    const cellXs = [
      innerLeft + (innerRight - innerLeft) * 0.25,
      innerLeft + (innerRight - innerLeft) * 0.75,
    ]
    const cellYs = [py - 3.6, py + 3.6]
    const cellPositions: Array<{ x: number; y: number }> = [
      { x: cellXs[0], y: cellYs[0] },
      { x: cellXs[1], y: cellYs[0] },
      { x: cellXs[0], y: cellYs[1] },
      { x: cellXs[1], y: cellYs[1] },
    ]

    // Diagonal flash on fire: pick NW+SE (cells 0,3) or NE+SW (cells 1,2)
    // deterministically from idleSeed. Flash bloom paints underneath the
    // digit so the digit stays readable.
    const firing = tower.firingFlashAge < ANIM.TOWER_FIRE_FLASH
    const fireT = firing ? 1 - tower.firingFlashAge / ANIM.TOWER_FIRE_FLASH : 0
    const diag = Math.floor(tower.idleSeed * 1000) % 2 === 0 ? [0, 3] : [1, 2]
    if (firing) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = color
      ctx.globalAlpha = fireT * 0.65
      for (const idx of diag) {
        const p = cellPositions[idx]
        ctx.beginPath()
        ctx.arc(p.x, p.y, 4.2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    // Scrolling digit cells. matrixCells is non-null for MATRIX towers per
    // the projection contract; fall back to zeros if the contract is ever
    // violated rather than throwing.
    const cells = tower.matrixCells ?? [0, 0, 0, 0]
    ctx.save()
    ctx.font = 'bold 7px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    for (let i = 0; i < 4; i++) {
      const p = cellPositions[i]
      const flashing = firing && diag.includes(i)
      const text = String(cells[i])
      ctx.strokeText(text, p.x, p.y)
      ctx.fillStyle = flashing ? '#ffffff' : color
      ctx.fillText(text, p.x, p.y)
    }
    ctx.restore()
  }

  // Visual Redesign Phase 5d — Limit instrument body. Two dashed vertical
  // asymptote lines flank a point that ascends from below and gets
  // arbitrarily close to the upper bound without crossing it. On fire the
  // point briefly snaps to the bound and the asymptotes pulse.
  //
  // Phase 6 Q8: when `tower.chargeProgress` is non-null, the point's height
  // is driven by the burst-charge ratio (configured-and-ticking branch);
  // otherwise the original time-driven sawtooth runs as an idle hint for
  // unconfigured / disabled LIMIT towers.
  private _drawLimitTower(ctx: CanvasRenderingContext2D, px: number, py: number, tower: TowerView): void {
    const color = tower.color
    const firing = tower.firingFlashAge < ANIM.TOWER_FIRE_FLASH
    const fireT = firing ? 1 - tower.firingFlashAge / ANIM.TOWER_FIRE_FLASH : 0

    // Approach height. Two branches:
    //   • Charge-driven (Phase 6 Q8): `chargeProgress` maps 0 → floor,
    //     1 → bound, with the same gamma-eased gap so the visual still
    //     reads as "limit but never reaches" — just with the cadence tied
    //     to actual cooldown progress.
    //   • Idle hint: original time sawtooth, used when chargeProgress is
    //     null (LIMIT not configured yet, or non-LIMIT — but the type
    //     dispatch keeps us inside the LIMIT branch here).
    let approach: number
    if (tower.chargeProgress !== null) {
      approach = tower.chargeProgress
    } else {
      approach = ((this._time + tower.idleSeed) % LIMIT_PERIOD) / LIMIT_PERIOD
    }
    const gap = (LIMIT_FLOOR_Y - LIMIT_BOUND_Y) * Math.pow(1 - approach, LIMIT_APPROACH_GAMMA)
    const pointYRel = firing ? LIMIT_BOUND_Y : LIMIT_BOUND_Y + gap

    // Asymptotes — dashed vertical lines. On fire the asymptotes pulse: the
    // stroke brightens toward white and thickens briefly.
    ctx.save()
    ctx.setLineDash([2, 2])
    ctx.lineWidth = firing ? 1.6 + fireT * 0.8 : 1
    ctx.strokeStyle = firing
      ? `rgba(255,255,255,${0.4 + fireT * 0.55})`
      : `${color}99`
    ctx.beginPath()
    ctx.moveTo(px - LIMIT_ASYMPTOTE_X, py + LIMIT_BOTTOM_Y)
    ctx.lineTo(px - LIMIT_ASYMPTOTE_X, py + LIMIT_TOP_Y)
    ctx.moveTo(px + LIMIT_ASYMPTOTE_X, py + LIMIT_BOTTOM_Y)
    ctx.lineTo(px + LIMIT_ASYMPTOTE_X, py + LIMIT_TOP_Y)
    ctx.stroke()
    ctx.restore()

    // Upper bound — solid horizontal cap between the two asymptotes.
    ctx.save()
    ctx.strokeStyle = this._palette.stoneDark
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(px - LIMIT_ASYMPTOTE_X, py + LIMIT_BOUND_Y)
    ctx.lineTo(px + LIMIT_ASYMPTOTE_X, py + LIMIT_BOUND_Y)
    ctx.stroke()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(px - LIMIT_ASYMPTOTE_X, py + LIMIT_BOUND_Y)
    ctx.lineTo(px + LIMIT_ASYMPTOTE_X, py + LIMIT_BOUND_Y)
    ctx.stroke()
    ctx.restore()

    // Firing bloom around the point — additive blend so it reads as a snap
    // to the bound rather than a body move.
    if (firing) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = color
      ctx.globalAlpha = fireT * 0.65
      ctx.beginPath()
      ctx.arc(px, py + pointYRel, 5.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // The ascending point. Outline kept dark for readability against pale
    // baseplate; fill is the tower hue, flashing to white at peak fire.
    ctx.fillStyle = firing ? '#ffffff' : color
    ctx.strokeStyle = this._palette.stoneDark
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(px, py + pointYRel, 2.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    // Phase 6 Q8 — baseplate charge arc. Sweeps clockwise as chargeProgress
    // rises so even a player not watching the asymptote knows when the next
    // burst lands. Only painted when chargeProgress is non-null (configured,
    // not disabled) so unconfigured LIMITs don't appear to be charging from
    // nothing. The arc is drawn outside the body so it doesn't fight the
    // asymptote silhouette for attention.
    if (tower.chargeProgress !== null) {
      const charge = tower.chargeProgress
      ctx.save()
      // Dark backing arc — full ring at low alpha so the player can read
      // "this tower has a charge meter" even when nearly empty.
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.arc(px, py, LIMIT_CHARGE_ARC_RADIUS, 0, Math.PI * 2)
      ctx.stroke()

      // Filled arc — clockwise from the south pole. Charge of 1 → full ring;
      // brightens to white on fire so the burst reads visually.
      const sweep = Math.PI * 2 * Math.max(0, Math.min(1, charge))
      ctx.strokeStyle = firing
        ? `rgba(255,255,255,${0.55 + fireT * 0.45})`
        : color
      ctx.lineWidth = firing ? 2.6 + fireT * 1.0 : 2.0
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(
        px,
        py,
        LIMIT_CHARGE_ARC_RADIUS,
        LIMIT_CHARGE_ARC_START,
        LIMIT_CHARGE_ARC_START + sweep,
      )
      ctx.stroke()
      ctx.restore()
    }
  }

  // Visual Redesign Phase 5e — Calculus instrument body. A slowly rotating
  // ∫ sigil sits over a thin parabolic "area under curve" gradient. On fire
  // the tower sheds `dx` and `dy` glyph particles that fly outward along the
  // tracked aim vector (or down-right when no enemy is in range), fading as
  // they travel — derived deterministically from firingFlashAge so the
  // animation stays pause-safe.
  private _drawCalculusTower(ctx: CanvasRenderingContext2D, px: number, py: number, tower: TowerView): void {
    const color = tower.color
    const firing = tower.firingFlashAge < ANIM.TOWER_FIRE_FLASH
    const fireT = firing ? 1 - tower.firingFlashAge / ANIM.TOWER_FIRE_FLASH : 0

    // Area-under-curve gradient: hump curve from (-halfW, base) to (+halfW,
    // base) peaking at (0, peak), filled with a color→transparent vertical
    // gradient so it reads as a shaded region rather than a hard fill.
    ctx.save()
    const grad = ctx.createLinearGradient(px, py + CALCULUS_CURVE_PEAK_Y, px, py + CALCULUS_CURVE_BASE_Y)
    grad.addColorStop(0, `${color}55`)
    grad.addColorStop(1, `${color}00`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(px - CALCULUS_CURVE_HALF_W, py + CALCULUS_CURVE_BASE_Y)
    ctx.quadraticCurveTo(px, py + CALCULUS_CURVE_PEAK_Y - 4, px + CALCULUS_CURVE_HALF_W, py + CALCULUS_CURVE_BASE_Y)
    ctx.closePath()
    ctx.fill()
    // Curve outline so the area boundary stays legible against dark tiles.
    ctx.strokeStyle = `${color}99`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px - CALCULUS_CURVE_HALF_W, py + CALCULUS_CURVE_BASE_Y)
    ctx.quadraticCurveTo(px, py + CALCULUS_CURVE_PEAK_Y - 4, px + CALCULUS_CURVE_HALF_W, py + CALCULUS_CURVE_BASE_Y)
    ctx.stroke()
    ctx.restore()

    // Rotating ∫ sigil. Slow continuous rotation; tower.idleSeed offsets the
    // phase so adjacent Calculus towers do not rotate in unison.
    const rotation = this._time * CALCULUS_ROTATE_OMEGA + tower.idleSeed
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(rotation)
    ctx.font = `bold ${CALCULUS_INTEGRAL_SIZE}px serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3.2
    ctx.strokeStyle = this._palette.stoneDark
    ctx.strokeText('∫', 0, 0)
    ctx.fillStyle = firing ? '#ffffff' : color
    ctx.fillText('∫', 0, 0)
    ctx.restore()

    // dx / dy shed particles. Aim direction: tracked target when available,
    // else down-right so the visual still reads on idle Calculus towers if
    // ever triggered without an enemy in range.
    if (firing) {
      const aimGame = tower.aimAngle !== null ? tower.aimAngle : -Math.PI / 4
      const cos = Math.cos(-aimGame)
      const sin = Math.sin(-aimGame)
      const labels: readonly string[] = ['dx', 'dy']
      const dist = 4 + (1 - fireT) * CALCULUS_PARTICLE_DIST
      ctx.save()
      ctx.font = 'bold 7px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.globalAlpha = fireT
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      for (let i = 0; i < labels.length; i++) {
        const lateral = (i === 0 ? -1 : 1) * CALCULUS_PARTICLE_LATERAL
        const fx = px + cos * dist - sin * lateral
        const fy = py + sin * dist + cos * lateral
        ctx.strokeText(labels[i], fx, fy)
        ctx.fillStyle = color
        ctx.fillText(labels[i], fx, fy)
      }
      ctx.restore()
    }
  }

  private _drawNode(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    color: string,
    radius = 2.5,
  ): void {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  private _drawGlyph(ctx: CanvasRenderingContext2D, px: number, py: number, tower: TowerView): void {
    // Small hue-independent type cue for colour-blind support.
    ctx.font = 'bold 9px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(0,0,0,0.92)'
    ctx.strokeText(tower.glyph, px, py + 10)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(tower.glyph, px, py + 10)
  }

  // Visual Redesign Phase 1: outward ring + bright core that fades over
  // ANIM.TOWER_FIRE_FLASH. Driven by `firingFlashAge` on the projected view,
  // which the firing system reset to 0 at the moment of TOWER_FIRED.
  private _drawMuzzleFlash(ctx: CanvasRenderingContext2D, px: number, py: number, tower: TowerView): void {
    const age = tower.firingFlashAge
    if (age >= ANIM.TOWER_FIRE_FLASH) return
    const t = Math.max(0, Math.min(1, age / ANIM.TOWER_FIRE_FLASH))
    const fade = 1 - t
    const radius = 10 + t * 18

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = tower.color
    ctx.globalAlpha = fade * 0.85
    ctx.lineWidth = 2.4 * fade + 0.6
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.stroke()

    const core = ctx.createRadialGradient(px, py, 0, px, py, 14)
    core.addColorStop(0, `rgba(255,255,255,${0.75 * fade})`)
    core.addColorStop(0.55, `rgba(255,255,255,${0.18 * fade})`)
    core.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(px, py, 14, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private _drawDisabledMark(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    ctx.strokeStyle = '#cc4444'
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    ctx.moveTo(px - 8, py - 8)
    ctx.lineTo(px + 8, py + 8)
    ctx.moveTo(px + 8, py - 8)
    ctx.lineTo(px - 8, py + 8)
    ctx.stroke()
  }
}
