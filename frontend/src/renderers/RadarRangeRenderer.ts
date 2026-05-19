import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { TowerType, GamePhase, UNIT_PX } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { selectRadarTargets, radarTargetCount } from '@/domain/combat/RadarTargeting'
import type { Tower } from '@/entities/types'

export class RadarRangeRenderer {
  update(_dt: number, _game: Game): void {}

  render(renderer: Renderer, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE && game.state.phase !== GamePhase.BUILD) return
    const { ctx } = renderer

    for (const tower of game.towers) {
      if (tower.type !== TowerType.RADAR_A &&
          tower.type !== TowerType.RADAR_B &&
          tower.type !== TowerType.RADAR_C) continue
      if (!tower.configured) continue
      this._drawRange(ctx, game, tower)
    }
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

    ctx.save()
    ctx.strokeStyle = `${color}44`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(px, py, radiusPx, 0, Math.PI * 2)
    ctx.stroke()

    ctx.fillStyle = `${color}22`
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
      const targets = selectRadarTargets(tower, game.enemies, radarTargetCount(tower))
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
          const aimAngle = -Math.atan2(t.y - tower.y, t.x - tower.x)
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

}
