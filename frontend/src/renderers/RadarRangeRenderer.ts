import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { TowerType, GamePhase, UNIT_PX } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { clipToBoard } from '@/engine/render-helpers/clip-to-board'
import {
  interceptPoint,
  isAngleInArc,
  radarProjectileSpeed,
  radarTargetCount,
  selectRadarTargets,
} from '@/domain/combat/RadarTargeting'
import type { Tower } from '@/entities/types'

export class RadarRangeRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE && game.state.phase !== GamePhase.BUILD) return
    const { ctx } = renderer

    // Range ring, focus-arc fill, sweep needle and scope brackets all scale
    // by `effectiveRange`, so a tower placed near the grid border paints
    // geometry past the painted board. Clip once for the whole pass — the
    // "×1.5" focus-bonus label sits `radiusPx + 12` from tower centre and
    // is clipped along with it; at extreme placements the label fades at
    // the board edge, which is an acceptable trade for not leaking AoE
    // visuals onto the surrounding backdrop.
    ctx.save()
    clipToBoard(ctx)
    for (const tower of game.towers) {
      if (tower.type !== TowerType.RADAR_A &&
          tower.type !== TowerType.RADAR_B &&
          tower.type !== TowerType.RADAR_C) continue
      if (!tower.configured) continue
      this._drawRange(ctx, game, tower)
    }
    ctx.restore()
  }

  // Visual Redesign Phase 5b: each radar instrument gets a distinct arc
  // treatment that mirrors its tower body — sextant graduations for A,
  // a concentric astrolabe ring for B, a scope-bracketed cone for C.
  private _drawRange(ctx: CanvasRenderingContext2D, game: import('@/engine/Game').Game, tower: Tower): void {
    const px = gameToCanvasX(tower.x)
    const py = gameToCanvasY(tower.y)
    const radiusPx = tower.effectiveRange * UNIT_PX
    const color = tower.color
    const arcStart = tower.arcStart ?? 0
    const arcEnd = tower.arcEnd ?? Math.PI / 2

    // When arcRestrict is on the tower never fires outside the sector, so the
    // overlay must read differently from a plain focus arc: the full-range ring
    // recedes (faint + dashed) and the sector's radial edges become solid
    // "walls". With restrict off the ring stays prominent — the tower still
    // shoots everywhere and the arc is only the ×1.5 bonus zone.
    const restricted = tower.arcRestrict ?? false

    ctx.save()
    ctx.strokeStyle = restricted ? `${color}22` : `${color}44`
    ctx.lineWidth = 1
    if (restricted) ctx.setLineDash([3, 5])
    ctx.beginPath()
    ctx.arc(px, py, radiusPx, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = restricted ? `${color}33` : `${color}22`
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.arc(px, py, radiusPx, -arcEnd, -arcStart)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = `${color}88`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(px, py, radiusPx, -arcEnd, -arcStart)
    ctx.stroke()

    if (restricted) {
      // Solid radial walls at the sector edges — the cue that enemies outside
      // the wedge are ignored entirely, not merely denied the focus bonus.
      ctx.strokeStyle = `${color}cc`
      ctx.lineWidth = 2
      for (const a of [-arcStart, -arcEnd]) {
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(px + Math.cos(a) * radiusPx, py + Math.sin(a) * radiusPx)
        ctx.stroke()
      }
    }

    if (tower.type === TowerType.RADAR_A) {
      ctx.strokeStyle = `${color}cc`
      ctx.lineWidth = 1
      const ticks = 8
      for (let i = 0; i <= ticks; i++) {
        const a = -arcEnd + (i / ticks) * (arcEnd - arcStart)
        const x1 = px + Math.cos(a) * (radiusPx - 4)
        const y1 = py + Math.sin(a) * (radiusPx - 4)
        const x2 = px + Math.cos(a) * radiusPx
        const y2 = py + Math.sin(a) * radiusPx
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
      this._drawSweepNeedle(ctx, tower, px, py, radiusPx, color, arcStart, arcEnd)
      this._drawArcBonusLabel(ctx, px, py, radiusPx, color, arcStart, arcEnd)
    } else if (tower.type === TowerType.RADAR_B) {
      ctx.strokeStyle = `${color}55`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(px, py, radiusPx * 0.7, -arcEnd, -arcStart)
      ctx.stroke()
    } else {
      // Telescope C — dashed bore-sight(s) to the same enemies RadarTowerSystem
      // would actually fire at this tick (honors targetingMode, arc restrict,
      // and target_count), so the aim line cannot diverge from the projectile.
      // Both fire-side and aim-line share `interceptPoint` + `radarProjectileSpeed`,
      // so the dashed line ends exactly where the projectile would land.
      const targets = selectRadarTargets(tower, game.enemies, radarTargetCount(tower))
      const projSpeed = radarProjectileSpeed(tower.type)
      ctx.strokeStyle = `${color}aa`
      ctx.lineWidth = 1.4
      ctx.setLineDash([4, 4])
      if (targets.length === 0) {
        const aimAngle = -(arcStart + arcEnd) / 2
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(px + Math.cos(aimAngle) * radiusPx, py + Math.sin(aimAngle) * radiusPx)
        ctx.stroke()
      } else {
        for (const t of targets) {
          const aim = interceptPoint(tower.x, tower.y, t, projSpeed)
          const aimAngle = -Math.atan2(aim.y - tower.y, aim.x - tower.x)
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(px + Math.cos(aimAngle) * radiusPx, py + Math.sin(aimAngle) * radiusPx)
          ctx.stroke()
        }
      }
      ctx.setLineDash([])

      ctx.strokeStyle = `${color}cc`
      ctx.lineWidth = 1.6
      for (const a of [-arcStart, -arcEnd]) {
        const ex = px + Math.cos(a) * radiusPx
        const ey = py + Math.sin(a) * radiusPx
        const nx = -Math.sin(a)
        const ny = Math.cos(a)
        ctx.beginPath()
        ctx.moveTo(ex - nx * 4, ey - ny * 4)
        ctx.lineTo(ex + nx * 4, ey + ny * 4)
        ctx.stroke()
      }
    }

    ctx.restore()
  }

  // RADAR_A sweep needle + half-aoeWidth detection band. Reads the live sweep
  // angle the system mirrors onto tower.sweepAngle and the same aoeWidth
  // formula used in RadarTowerSystem._updateSweep so the painted band matches
  // the actual hit region (upgrade + talent contributions).
  //
  // Canvas y-axis is inverted; world-space angle `a` maps to canvas via `-a`,
  // matching the rest of this renderer (compare arcStart/arcEnd usage above).
  private _drawSweepNeedle(
    ctx: CanvasRenderingContext2D,
    tower: Tower,
    px: number,
    py: number,
    radiusPx: number,
    color: string,
    arcStart: number,
    arcEnd: number,
  ): void {
    const angle = tower.sweepAngle
    if (angle === undefined) return
    const aoeWidth = 0.5
      + (tower.upgradeExtras?.['aoeWidth'] ?? 0)
      + (tower.talentMods['aoe_width'] ?? 0)

    // Half-band wedge (paint first so the needle reads on top of it).
    const bandStart = -angle - aoeWidth
    const bandEnd = -angle + aoeWidth
    ctx.fillStyle = `${color}22`
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.arc(px, py, radiusPx, bandStart, bandEnd)
    ctx.closePath()
    ctx.fill()

    // The needle itself. Brightens when the sweep is currently inside the
    // ×1.5 focus arc — that's the moment any enemy in the band gets the
    // bonus damage too.
    const inFocus = isAngleInArc(angle, arcStart, arcEnd)
    const cAngle = -angle
    const tipX = px + Math.cos(cAngle) * radiusPx
    const tipY = py + Math.sin(cAngle) * radiusPx
    ctx.strokeStyle = inFocus ? '#ffffffcc' : `${color}ee`
    ctx.lineWidth = inFocus ? 2.2 : 1.6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(tipX, tipY)
    ctx.stroke()

    // Hub dot to anchor the needle visually.
    ctx.fillStyle = inFocus ? '#ffffffee' : `${color}cc`
    ctx.beginPath()
    ctx.arc(px, py, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Small "×1.5" chip parked at the focus-arc midpoint along the range edge,
  // so a player learning the tower can connect "the highlighted wedge" to
  // "damage multiplier" at a glance.
  private _drawArcBonusLabel(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    radiusPx: number,
    color: string,
    arcStart: number,
    arcEnd: number,
  ): void {
    const mid = -(arcStart + arcEnd) / 2
    const lx = px + Math.cos(mid) * (radiusPx + 12)
    const ly = py + Math.sin(mid) * (radiusPx + 12)
    ctx.save()
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'
    ctx.fillStyle = color
    ctx.strokeText('×1.5', lx, ly)
    ctx.fillText('×1.5', lx, ly)
    ctx.restore()
  }

}
