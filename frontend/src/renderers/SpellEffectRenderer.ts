import { Events } from '@/data/constants'
import { SPELL_MAP } from '@/data/spell-defs'
import { UNIT_PX } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import type { Game, GameSystem } from '@/engine/Game'
import type { Renderer } from '@/engine/Renderer'

const TAU = Math.PI * 2

interface SpellVfx {
  spellId: string
  x: number
  y: number
  radius: number
  age: number
  maxAge: number
  color: string
  seed: number
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function easeOutQuart(value: number): number {
  const t = clamp01(value)
  return 1 - (1 - t) ** 4
}

function easeInOut(value: number): number {
  const t = clamp01(value)
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2
}

function seededUnit(seed: number, index: number): number {
  const n = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453
  return n - Math.floor(n)
}

function seedFor(spellId: string, x: number, y: number): number {
  let seed = Math.round(x * 97 + y * 193)
  for (let i = 0; i < spellId.length; i++) seed += spellId.charCodeAt(i) * (i + 11)
  return seed
}

function effectAge(spellId: string): number {
  return spellId === 'fireball' ? 1.35 : 0.65
}

export class SpellEffectRenderer implements GameSystem {
  private _effects: SpellVfx[] = []
  private _unsubs: (() => void)[] = []

  init(game: Game): void {
    this.destroy()
    this._unsubs.push(
      game.eventBus.on(Events.SPELL_EFFECT, ({ spellId, x, y, radius }) => {
        const def = SPELL_MAP.get(spellId)
        this._effects.push({
          spellId,
          x,
          y,
          radius: radius ?? 2,
          age: 0,
          maxAge: effectAge(spellId),
          color: def?.color ?? '#ffffff',
          seed: seedFor(spellId, x, y),
        })
      }),

      game.eventBus.on(Events.LEVEL_START, () => {
        this._effects = []
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
    this._effects = []
  }

  update(dt: number, _game: Game): void {
    for (let i = this._effects.length - 1; i >= 0; i--) {
      this._effects[i].age += dt
      if (this._effects[i].age >= this._effects[i].maxAge) {
        this._effects.splice(i, 1)
      }
    }
  }

  render(renderer: Renderer, _game: Game): void {
    const ctx = renderer.ctx
    for (const vfx of this._effects) {
      if (vfx.spellId === 'fireball') {
        this._drawFireball(ctx, vfx)
      } else {
        this._drawPulse(ctx, vfx)
      }
    }
  }

  private _drawPulse(ctx: CanvasRenderingContext2D, vfx: SpellVfx): void {
    const p = clamp01(vfx.age / vfx.maxAge)
    const alpha = 1 - p
    const px = gameToCanvasX(vfx.x)
    const py = gameToCanvasY(vfx.y)
    const pr = vfx.radius * UNIT_PX * (0.5 + p * 0.5)

    ctx.save()
    ctx.globalAlpha = alpha * 0.6
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, TAU)
    ctx.fillStyle = vfx.color
    ctx.fill()

    ctx.globalAlpha = alpha
    ctx.beginPath()
    ctx.arc(px, py, pr * 0.3, 0, TAU)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.restore()
  }

  private _drawFireball(ctx: CanvasRenderingContext2D, vfx: SpellVfx): void {
    const p = clamp01(vfx.age / vfx.maxAge)
    const out = easeOutQuart(p)
    const alpha = 1 - p
    const ignition = 1 - easeInOut(p)
    const px = gameToCanvasX(vfx.x)
    const py = gameToCanvasY(vfx.y)
    const baseR = Math.max(UNIT_PX * 0.9, vfx.radius * UNIT_PX)
    const waveR = baseR * (0.18 + out * 1.08)
    const coreR = baseR * (0.12 + out * 0.24)

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    this._drawHeatBloom(ctx, px, py, waveR, alpha)
    this._drawFireCircle(ctx, px, py, waveR * 0.72, p * 2.6, 0.62 * alpha)
    this._drawFireCircle(ctx, px, py, waveR * 0.46, -p * 3.2, 0.42 * alpha)
    this._drawShockwave(ctx, px, py, waveR, ignition, alpha)
    this._drawFlamePetals(ctx, px, py, coreR, waveR, p, alpha, vfx.seed)
    this._drawEmbers(ctx, px, py, waveR, out, alpha, vfx.seed)

    const core = ctx.createRadialGradient(px, py, 0, px, py, coreR)
    core.addColorStop(0, `rgba(255, 255, 236, ${0.92 * alpha})`)
    core.addColorStop(0.36, `rgba(255, 213, 92, ${0.82 * alpha})`)
    core.addColorStop(1, 'rgba(255, 88, 24, 0)')
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(px, py, coreR, 0, TAU)
    ctx.fill()

    ctx.globalCompositeOperation = 'source-over'
    this._drawSmoke(ctx, px, py, waveR, out, alpha, vfx.seed)
    ctx.restore()
  }

  private _drawHeatBloom(ctx: CanvasRenderingContext2D, px: number, py: number, radius: number, alpha: number): void {
    const glow = ctx.createRadialGradient(px, py, 0, px, py, radius)
    glow.addColorStop(0, `rgba(255, 250, 205, ${0.84 * alpha})`)
    glow.addColorStop(0.16, `rgba(255, 186, 42, ${0.62 * alpha})`)
    glow.addColorStop(0.44, `rgba(232, 74, 24, ${0.3 * alpha})`)
    glow.addColorStop(0.78, `rgba(92, 20, 8, ${0.11 * alpha})`)
    glow.addColorStop(1, 'rgba(20, 8, 4, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, TAU)
    ctx.fill()
  }

  private _drawFireCircle(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    radius: number,
    rotation: number,
    alpha: number,
  ): void {
    if (radius <= 2 || alpha <= 0) return
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(rotation)
    ctx.strokeStyle = `rgba(255, 214, 109, ${alpha})`
    ctx.lineWidth = 1.4
    ctx.setLineDash([radius * 0.08, radius * 0.06])
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])

    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU
      const inner = radius * (i % 3 === 0 ? 0.78 : 0.9)
      const outer = radius * 1.08
      ctx.lineWidth = i % 3 === 0 ? 2.1 : 1.1
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner)
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer)
      ctx.stroke()
    }
    ctx.restore()
  }

  private _drawShockwave(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    radius: number,
    ignition: number,
    alpha: number,
  ): void {
    for (let i = 0; i < 3; i++) {
      const r = radius * (0.52 + i * 0.17)
      ctx.strokeStyle = i === 0
        ? `rgba(255, 238, 154, ${0.58 * alpha})`
        : `rgba(255, 118, 40, ${0.34 * alpha})`
      ctx.lineWidth = 1.6 + ignition * (4 - i)
      ctx.beginPath()
      ctx.arc(px, py, r, i * 0.8, TAU - i * 0.55)
      ctx.stroke()
    }
  }

  private _drawFlamePetals(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    coreR: number,
    waveR: number,
    p: number,
    alpha: number,
    seed: number,
  ): void {
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU + seededUnit(seed, i) * 0.42 + p * 1.4
      const inner = coreR * (0.78 + seededUnit(seed, i + 20) * 0.4)
      const outer = waveR * (0.45 + seededUnit(seed, i + 40) * 0.28)
      const waist = inner * (0.82 + seededUnit(seed, i + 60) * 0.28)
      const c1 = a - 0.18 - seededUnit(seed, i + 80) * 0.16
      const c2 = a + 0.18 + seededUnit(seed, i + 100) * 0.16

      ctx.fillStyle = i % 4 === 0
        ? `rgba(255, 236, 145, ${0.58 * alpha})`
        : `rgba(255, 96, 28, ${0.48 * alpha})`
      ctx.beginPath()
      ctx.moveTo(px + Math.cos(c1) * waist, py + Math.sin(c1) * waist)
      ctx.quadraticCurveTo(px, py, px + Math.cos(c2) * waist, py + Math.sin(c2) * waist)
      ctx.quadraticCurveTo(px + Math.cos(a) * inner, py + Math.sin(a) * inner, px + Math.cos(a) * outer, py + Math.sin(a) * outer)
      ctx.closePath()
      ctx.fill()
    }
  }

  private _drawEmbers(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    radius: number,
    out: number,
    alpha: number,
    seed: number,
  ): void {
    for (let i = 0; i < 42; i++) {
      const a = seededUnit(seed, i + 140) * TAU
      const d = radius * (0.18 + seededUnit(seed, i + 170) * 0.86) * out
      const drift = (seededUnit(seed, i + 190) - 0.5) * 22 * out
      const size = 1.2 + seededUnit(seed, i + 210) * 3.8
      ctx.fillStyle = `rgba(255, ${128 + Math.floor(seededUnit(seed, i + 230) * 102)}, 34, ${0.78 * alpha})`
      ctx.beginPath()
      ctx.arc(px + Math.cos(a) * d + drift, py + Math.sin(a) * d - out * 18, size, 0, TAU)
      ctx.fill()
    }
  }

  private _drawSmoke(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    radius: number,
    out: number,
    alpha: number,
    seed: number,
  ): void {
    for (let i = 0; i < 16; i++) {
      const a = seededUnit(seed, i + 260) * TAU
      const d = radius * (0.3 + seededUnit(seed, i + 280) * 0.68) * out
      const r = 10 + seededUnit(seed, i + 300) * 22
      const sx = px + Math.cos(a) * d + (seededUnit(seed, i + 320) - 0.5) * 18
      const sy = py + Math.sin(a) * d - out * (12 + seededUnit(seed, i + 340) * 22)
      const smoke = ctx.createRadialGradient(sx, sy, 0, sx, sy, r)
      smoke.addColorStop(0, `rgba(72, 48, 42, ${0.17 * alpha})`)
      smoke.addColorStop(0.62, `rgba(38, 28, 30, ${0.08 * alpha})`)
      smoke.addColorStop(1, 'rgba(16, 12, 14, 0)')
      ctx.fillStyle = smoke
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, TAU)
      ctx.fill()
    }
  }
}
