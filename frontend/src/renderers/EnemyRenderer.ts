/**
 * EnemyRenderer — paints enemies from an EnemySceneView snapshot (F-ARCH-4).
 * Never reads Enemy entity fields directly; the projection layer in
 * engine/projections/project-enemies.ts owns that surface.
 */
import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { UNIT_PX } from '@/data/constants'
import { projectEnemyScene } from '@/engine/projections/project-enemies'
import type { EnemyAppearance, EnemyView } from '@/engine/projections/views'

export class EnemyRenderer {
  // Semantically meaningful game-art colors — centralized so theme adjustments
  // don't require hunting through individual draw methods.
  private static readonly HELPER_AURA = '#48c878'
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

    ctx.save()
    if (enemy.frostRatio > 0) {
      this._drawFrostAura(ctx, px, py, enemy.size, enemy.frostRatio)
    }
    this._drawSlime(ctx, px, py, enemy)
    ctx.restore()

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
    const half = size / 2
    const pulse = Math.sin(this._time * 5 + px * 0.05) * 0.5 + 0.5
    const squash = 1 + Math.sin(this._time * 6 + py * 0.04) * 0.04

    this._drawGroundShadow(ctx, px, py, size)

    ctx.save()
    ctx.translate(px, py + (pulse - 0.5) * 1.2)
    ctx.scale(1 + (1 - squash) * 0.6, squash)

    this._drawSlimeBody(ctx, 0, 0, size, enemy.color)

    switch (enemy.type) {
      case 'fast':
        this._drawFastDetails(ctx, 0, 0, size, enemy.color)
        break
      case 'strong':
        this._drawStrongDetails(ctx, 0, 0, size)
        break
      case 'split':
        this._drawWizardSplitDetails(ctx, 0, 0, size, enemy.color)
        break
      case 'helper':
        this._drawHelperDetails(ctx, 0, 0, size)
        break
      case 'bossA':
        this._drawBossADetails(ctx, 0, 0, size)
        break
      case 'bossB':
        this._drawBossBDetails(ctx, 0, 0, size)
        break
      default:
        this._drawGeneralDetails(ctx, 0, 0, size)
        break
    }

    this._drawFace(ctx, 0, 0, size, enemy.type)
    this._drawGloss(ctx, -half * 0.35, -half * 0.35, size)
    if (enemy.frostRatio > 0) {
      this._drawFrostTint(ctx, 0, 0, size, enemy.frostRatio)
      this._drawFrozenOverlay(ctx, 0, 0, size, enemy.frostRatio)
    }
    ctx.restore()
  }

  private _drawGroundShadow(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.beginPath()
    ctx.ellipse(px, py + size * 0.42, size * 0.52, size * 0.18, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  private _drawSlimeBody(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    color: string,
  ): void {
    const half = size / 2
    const g = ctx.createRadialGradient(px - half * 0.35, py - half * 0.45, size * 0.08, px, py, size * 0.75)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.18, color)
    g.addColorStop(1, '#1b1220')

    ctx.fillStyle = g
    ctx.strokeStyle = 'rgba(255,255,255,0.34)'
    ctx.lineWidth = Math.max(1, size / 16)
    ctx.beginPath()
    ctx.moveTo(px - half * 0.78, py + half * 0.36)
    ctx.bezierCurveTo(px - half * 1.02, py - half * 0.18, px - half * 0.52, py - half * 0.92, px, py - half * 0.88)
    ctx.bezierCurveTo(px + half * 0.58, py - half * 0.88, px + half * 1.02, py - half * 0.16, px + half * 0.78, py + half * 0.36)
    ctx.quadraticCurveTo(px, py + half * 0.76, px - half * 0.78, py + half * 0.36)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  private _drawFace(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, type: EnemyAppearance): void {
    const eyeR = Math.max(1.8, size / 9)
    const eyeY = py - size * 0.12
    const eyeGap = size * 0.22
    const pupilX = type === 'fast' ? size * 0.02 : 0

    this._drawEye(ctx, px - eyeGap, eyeY, eyeR, pupilX)
    this._drawEye(ctx, px + eyeGap, eyeY, eyeR, pupilX)

    ctx.strokeStyle = type === 'strong' || type === 'bossA' ? '#1b0b0b' : 'rgba(20,12,22,0.75)'
    ctx.lineWidth = Math.max(1, size / 18)
    ctx.beginPath()
    if (type === 'bossB') {
      ctx.moveTo(px - size * 0.18, py + size * 0.15)
      ctx.quadraticCurveTo(px, py + size * 0.28, px + size * 0.18, py + size * 0.15)
    } else {
      ctx.moveTo(px - size * 0.12, py + size * 0.14)
      ctx.quadraticCurveTo(px, py + size * 0.22, px + size * 0.12, py + size * 0.14)
    }
    ctx.stroke()
  }

  private _drawEye(ctx: CanvasRenderingContext2D, px: number, py: number, r: number, pupilOffset: number): void {
    ctx.fillStyle = '#fffaf0'
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#15111d'
    ctx.beginPath()
    ctx.arc(px + pupilOffset, py + r * 0.08, r * 0.45, 0, Math.PI * 2)
    ctx.fill()
  }

  private _drawGloss(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
    ctx.save()
    ctx.globalAlpha = 0.42
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(px, py, size * 0.14, size * 0.08, -0.7, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
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

  private _drawFrostTint(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    intensity: number,
  ): void {
    const half = size / 2
    const tint = ctx.createRadialGradient(px - half * 0.25, py - half * 0.45, size * 0.08, px, py, size * 0.78)
    tint.addColorStop(0, `rgba(255, 255, 255, ${0.4 * intensity})`)
    tint.addColorStop(0.28, `rgba(178, 241, 255, ${0.34 * intensity})`)
    tint.addColorStop(0.74, `rgba(66, 156, 235, ${0.24 * intensity})`)
    tint.addColorStop(1, `rgba(22, 61, 128, ${0.08 * intensity})`)
    ctx.fillStyle = tint
    ctx.beginPath()
    ctx.moveTo(px - half * 0.78, py + half * 0.36)
    ctx.bezierCurveTo(px - half * 1.02, py - half * 0.18, px - half * 0.52, py - half * 0.92, px, py - half * 0.88)
    ctx.bezierCurveTo(px + half * 0.58, py - half * 0.88, px + half * 1.02, py - half * 0.16, px + half * 0.78, py + half * 0.36)
    ctx.quadraticCurveTo(px, py + half * 0.76, px - half * 0.78, py + half * 0.36)
    ctx.closePath()
    ctx.fill()
  }

  private _drawFrozenOverlay(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    intensity: number,
  ): void {
    const half = size / 2
    const shimmer = Math.sin(this._time * 7.2 + size) * 0.5 + 0.5

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    const shell = ctx.createLinearGradient(px - half, py - half, px + half, py + half)
    shell.addColorStop(0, `rgba(255, 255, 255, ${0.58 * intensity})`)
    shell.addColorStop(0.32, `rgba(160, 238, 255, ${0.34 * intensity})`)
    shell.addColorStop(0.72, `rgba(60, 168, 245, ${0.22 * intensity})`)
    shell.addColorStop(1, `rgba(20, 78, 170, ${0.16 * intensity})`)
    ctx.fillStyle = shell
    ctx.beginPath()
    ctx.moveTo(px - half * 0.78, py + half * 0.36)
    ctx.bezierCurveTo(px - half * 1.02, py - half * 0.18, px - half * 0.52, py - half * 0.92, px, py - half * 0.88)
    ctx.bezierCurveTo(px + half * 0.58, py - half * 0.88, px + half * 1.02, py - half * 0.16, px + half * 0.78, py + half * 0.36)
    ctx.quadraticCurveTo(px, py + half * 0.76, px - half * 0.78, py + half * 0.36)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = `rgba(245, 255, 255, ${(0.68 + shimmer * 0.2) * intensity})`
    ctx.lineWidth = Math.max(1.4, size / 15)
    ctx.beginPath()
    ctx.moveTo(px - half * 0.62, py + half * 0.22)
    ctx.bezierCurveTo(px - half * 0.94, py - half * 0.16, px - half * 0.42, py - half * 0.84, px, py - half * 0.82)
    ctx.bezierCurveTo(px + half * 0.54, py - half * 0.82, px + half * 0.92, py - half * 0.18, px + half * 0.62, py + half * 0.22)
    ctx.stroke()

    this._drawIceRim(ctx, px, py, size, intensity, shimmer)
    this._drawFrostCracks(ctx, px, py, size, intensity)

    this._drawIceCrystal(ctx, px - size * 0.34, py - size * 0.2, size * 0.16, -0.36, intensity)
    this._drawIceCrystal(ctx, px + size * 0.34, py + size * 0.02, size * 0.14, 0.28, intensity)
    this._drawIceCrystal(ctx, px + size * 0.02, py - size * 0.44, size * 0.12, 0.02, intensity)

    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + this._time * 0.35
      const r = size * (0.22 + (i % 2) * 0.13)
      ctx.fillStyle = `rgba(235, 255, 255, ${0.42 * intensity})`
      ctx.beginPath()
      ctx.arc(px + Math.cos(a) * r, py + Math.sin(a) * r - size * 0.04, Math.max(1, size * 0.025), 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }

  private _drawIceRim(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    intensity: number,
    shimmer: number,
  ): void {
    const half = size / 2
    ctx.save()
    ctx.strokeStyle = `rgba(235, 255, 255, ${(0.54 + shimmer * 0.2) * intensity})`
    ctx.fillStyle = `rgba(238, 255, 255, ${0.46 * intensity})`
    ctx.lineWidth = Math.max(1, size / 28)
    const points = [
      [-0.58, -0.72, 0.16],
      [-0.22, -0.9, 0.12],
      [0.18, -0.86, 0.15],
      [0.52, -0.58, 0.13],
      [0.74, -0.14, 0.11],
      [-0.76, -0.12, 0.1],
    ] as const
    for (const [x, y, h] of points) {
      ctx.beginPath()
      ctx.moveTo(px + half * x, py + half * y)
      ctx.lineTo(px + half * (x + 0.09), py + half * (y + h))
      ctx.lineTo(px + half * (x - 0.09), py + half * (y + h * 0.85))
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }

  private _drawFrostCracks(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    intensity: number,
  ): void {
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.52 * intensity})`
    ctx.lineWidth = Math.max(1, size / 34)
    const cracks: ReadonlyArray<ReadonlyArray<[number, number]>> = [
      [[-0.32, -0.42], [-0.18, -0.22], [-0.28, -0.02], [-0.1, 0.18]],
      [[0.28, -0.5], [0.12, -0.3], [0.24, -0.12], [0.08, 0.08]],
      [[-0.08, -0.7], [0.02, -0.48], [-0.06, -0.28]],
    ]
    for (const crack of cracks) {
      ctx.beginPath()
      crack.forEach(([x, y], index) => {
        const cx = px + x * size
        const cy = py + y * size
        if (index === 0) ctx.moveTo(cx, cy)
        else ctx.lineTo(cx, cy)
      })
      ctx.stroke()
    }

    ctx.strokeStyle = `rgba(86, 210, 255, ${0.38 * intensity})`
    ctx.lineWidth = Math.max(1, size / 46)
    ctx.beginPath()
    ctx.moveTo(px - size * 0.38, py + size * 0.18)
    ctx.lineTo(px - size * 0.18, py + size * 0.06)
    ctx.lineTo(px - size * 0.02, py + size * 0.22)
    ctx.moveTo(px + size * 0.36, py + size * 0.16)
    ctx.lineTo(px + size * 0.16, py + size * 0.02)
    ctx.lineTo(px + size * 0.26, py - size * 0.14)
    ctx.stroke()
    ctx.restore()
  }

  private _drawIceCrystal(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    rotation: number,
    intensity: number,
  ): void {
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(rotation)
    ctx.fillStyle = `rgba(238, 255, 255, ${0.56 * intensity})`
    ctx.strokeStyle = `rgba(108, 215, 255, ${0.42 * intensity})`
    ctx.lineWidth = Math.max(1, size * 0.12)
    ctx.beginPath()
    ctx.moveTo(0, -size)
    ctx.lineTo(size * 0.46, -size * 0.12)
    ctx.lineTo(size * 0.22, size)
    ctx.lineTo(-size * 0.4, size * 0.18)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
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

  private _drawGeneralDetails(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = Math.max(1, size / 20)
    ctx.beginPath()
    ctx.arc(px, py + size * 0.1, size * 0.28, 0.15, Math.PI - 0.15)
    ctx.stroke()
  }

  private _drawFastDetails(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, color: string): void {
    ctx.strokeStyle = `${color}aa`
    ctx.lineWidth = Math.max(1.4, size / 9)
    ctx.beginPath()
    ctx.moveTo(px - size * 0.62, py + size * 0.04)
    ctx.lineTo(px - size * 0.98, py + size * 0.16)
    ctx.moveTo(px - size * 0.55, py - size * 0.18)
    ctx.lineTo(px - size * 0.88, py - size * 0.12)
    ctx.stroke()

    ctx.fillStyle = '#dbeafe'
    ctx.beginPath()
    ctx.moveTo(px + size * 0.12, py - size * 0.45)
    ctx.lineTo(px + size * 0.32, py - size * 0.18)
    ctx.lineTo(px + size * 0.12, py - size * 0.2)
    ctx.lineTo(px + size * 0.3, py + size * 0.12)
    ctx.lineTo(px - size * 0.04, py - size * 0.22)
    ctx.lineTo(px + size * 0.14, py - size * 0.2)
    ctx.closePath()
    ctx.fill()
  }

  private _drawStrongDetails(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
    ctx.fillStyle = '#5b1f1f'
    ctx.strokeStyle = '#ffd7d7'
    ctx.lineWidth = Math.max(1, size / 20)
    for (const x of [-0.32, 0.32]) {
      ctx.beginPath()
      ctx.moveTo(px + size * x, py - size * 0.48)
      ctx.lineTo(px + size * (x + Math.sign(x) * 0.16), py - size * 0.7)
      ctx.lineTo(px + size * (x + Math.sign(x) * 0.02), py - size * 0.42)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    ctx.beginPath()
    ctx.moveTo(px - size * 0.38, py + size * 0.26)
    ctx.lineTo(px + size * 0.38, py + size * 0.26)
    ctx.stroke()
  }

  private _drawWizardSplitDetails(ctx: CanvasRenderingContext2D, px: number, py: number, size: number, color: string): void {
    this._drawWizardHat(ctx, px, py - size * 0.5, size, color)
    this._drawStaff(ctx, px + size * 0.46, py - size * 0.06, size)
    this._drawBat(ctx, px - size * 0.42, py + size * 0.17, size * 0.34, color)
    this._drawBat(ctx, px + size * 0.22, py + size * 0.2, size * 0.3, color)

    ctx.strokeStyle = 'rgba(255,255,255,0.42)'
    ctx.lineWidth = Math.max(1, size / 18)
    ctx.beginPath()
    ctx.moveTo(px, py - size * 0.32)
    ctx.bezierCurveTo(px - size * 0.12, py - size * 0.04, px + size * 0.12, py + size * 0.12, px, py + size * 0.38)
    ctx.stroke()
  }

  private _drawHelperDetails(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
    ctx.strokeStyle = '#dcfce7'
    ctx.lineWidth = Math.max(1.2, size / 12)
    ctx.beginPath()
    ctx.moveTo(px, py - size * 0.46)
    ctx.lineTo(px, py - size * 0.2)
    ctx.moveTo(px - size * 0.13, py - size * 0.33)
    ctx.lineTo(px + size * 0.13, py - size * 0.33)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(220,252,231,0.45)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(px, py, size * 0.34, 0, Math.PI * 2)
    ctx.stroke()
  }

  private _drawBossADetails(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
    this._drawCrown(ctx, px, py - size * 0.42, size, '#fbbf24')
    ctx.strokeStyle = '#fee2e2'
    ctx.lineWidth = Math.max(1.5, size / 18)
    ctx.beginPath()
    ctx.moveTo(px - size * 0.28, py + size * 0.28)
    ctx.lineTo(px + size * 0.28, py + size * 0.28)
    ctx.moveTo(px - size * 0.2, py + size * 0.36)
    ctx.lineTo(px + size * 0.2, py + size * 0.36)
    ctx.stroke()
  }

  private _drawBossBDetails(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
    this._drawCrown(ctx, px, py - size * 0.42, size, '#f0abfc')
    ctx.strokeStyle = '#fce7f3'
    ctx.lineWidth = Math.max(1.4, size / 20)
    ctx.beginPath()
    ctx.arc(px, py, size * 0.34, -0.2, Math.PI * 1.2)
    ctx.stroke()
    ctx.fillStyle = '#fce7f3'
    ctx.beginPath()
    ctx.arc(px + size * 0.26, py - size * 0.22, size * 0.06, 0, Math.PI * 2)
    ctx.fill()
  }

  private _drawCrown(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    color: string,
  ): void {
    ctx.fillStyle = color
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = Math.max(1, size / 30)
    ctx.beginPath()
    ctx.moveTo(px - size * 0.28, py + size * 0.1)
    ctx.lineTo(px - size * 0.18, py - size * 0.16)
    ctx.lineTo(px, py + size * 0.02)
    ctx.lineTo(px + size * 0.18, py - size * 0.16)
    ctx.lineTo(px + size * 0.28, py + size * 0.1)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  private _drawWizardHat(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    color: string,
  ): void {
    ctx.fillStyle = '#2a1745'
    ctx.strokeStyle = '#f5d0fe'
    ctx.lineWidth = Math.max(1, size / 24)
    ctx.beginPath()
    ctx.moveTo(px - size * 0.24, py + size * 0.17)
    ctx.quadraticCurveTo(px - size * 0.08, py - size * 0.42, px + size * 0.23, py - size * 0.2)
    ctx.quadraticCurveTo(px + size * 0.08, py - size * 0.02, px + size * 0.3, py + size * 0.17)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = `${color}dd`
    ctx.beginPath()
    ctx.ellipse(px, py + size * 0.18, size * 0.35, size * 0.08, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#fde68a'
    ctx.beginPath()
    ctx.arc(px + size * 0.08, py - size * 0.13, size * 0.045, 0, Math.PI * 2)
    ctx.fill()
  }

  private _drawStaff(ctx: CanvasRenderingContext2D, px: number, py: number, size: number): void {
    ctx.strokeStyle = '#6b3f20'
    ctx.lineWidth = Math.max(1.2, size / 16)
    ctx.beginPath()
    ctx.moveTo(px, py - size * 0.28)
    ctx.lineTo(px, py + size * 0.42)
    ctx.stroke()

    ctx.fillStyle = '#f0abfc'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(px, py - size * 0.33, size * 0.08, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  private _drawBat(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    size: number,
    color: string,
  ): void {
    ctx.fillStyle = '#21112f'
    ctx.strokeStyle = `${color}dd`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.quadraticCurveTo(px - size * 0.35, py - size * 0.36, px - size * 0.68, py - size * 0.05)
    ctx.quadraticCurveTo(px - size * 0.38, py - size * 0.02, px - size * 0.22, py + size * 0.18)
    ctx.lineTo(px, py + size * 0.1)
    ctx.quadraticCurveTo(px + size * 0.35, py - size * 0.36, px + size * 0.68, py - size * 0.05)
    ctx.quadraticCurveTo(px + size * 0.38, py - size * 0.02, px + size * 0.22, py + size * 0.18)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#f5d0fe'
    ctx.beginPath()
    ctx.arc(px - size * 0.08, py - size * 0.02, size * 0.04, 0, Math.PI * 2)
    ctx.arc(px + size * 0.08, py - size * 0.02, size * 0.04, 0, Math.PI * 2)
    ctx.fill()
  }
}
