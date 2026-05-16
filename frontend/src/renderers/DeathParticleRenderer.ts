/**
 * DeathParticleRenderer — corpse-side particle effects spawned by ENEMY_DYING.
 *
 * Visual Redesign Phase 2. Two branches share a single subscriber:
 *
 *   - Regular enemies: 8–14 colored droplets radiating outward with gravity,
 *     lifetime ~0.55s. Count scales with enemy.size so larger enemies feel
 *     heavier.
 *   - Bosses (BOSS_A / BOSS_B): a layered ~1.2s cinematic — white bloom
 *     (0.00–0.20s), expanding shockwave ring (0.20–0.70s), 32-particle
 *     burst (0.30–1.20s), plus a screen shake at the moment of death.
 *
 * Branch is decided on the event payload's enemy.type. A separate BOSS_DIED
 * event is deliberately NOT introduced — the plan notes that splitting the
 * channel only pays off when cross-cutting modules (audio, achievements)
 * need to react, which they don't today.
 *
 * Determinism: every spawn is seeded by `seedFor(enemy.id, ...)` so replays
 * produce identical particle trajectories. No `Math.random()` reads.
 *
 * Pause-safe: ages advance via dt through the EffectLayer base.
 */
import { Events, EnemyType, ANIM } from '@/data/constants'
import { gameToCanvasX, gameToCanvasY } from '@/math/MathUtils'
import { seededUnit, seedFor } from '@/math/seededRandom'
import { prefersReducedMotion } from '@/utils/reducedMotion'
import { EffectLayer, type Effect } from './effects/EffectLayer'
import type { Renderer } from '@/engine/Renderer'
import type { Game } from '@/engine/Game'
import type { Enemy } from '@/entities/types'

type DeathKind = 'particle' | 'shockwave' | 'bloom'

interface DeathFx extends Effect {
  kind: DeathKind
  cx: number
  cy: number
  /** Seconds the effect waits before becoming visible (boss timeline). */
  delay: number
  // Particle-only fields.
  vx: number
  vy: number
  gravity: number
  radius: number
  color: string
  /** Shockwave / bloom outer radius at t = 1. */
  maxRadius: number
}

const REG_PARTICLE_LIFETIME = 0.55
const REG_PARTICLE_SPEED = 90
const REG_PARTICLE_GRAVITY = 220

const BOSS_BLOOM_LIFETIME = 0.20
const BOSS_SHOCKWAVE_DELAY = 0.20
const BOSS_SHOCKWAVE_LIFETIME = 0.50
const BOSS_PARTICLE_DELAY = 0.30
const BOSS_PARTICLE_LIFETIME = 0.90
const BOSS_PARTICLE_SPEED = 140
const BOSS_PARTICLE_GRAVITY = 200
const BOSS_SHAKE_AMPLITUDE = 8

export class DeathParticleRenderer extends EffectLayer<DeathFx> {
  init(game: Game): void {
    super.init(game)
    this.unsubs.push(
      game.eventBus.on(Events.ENEMY_DYING, (enemy: Enemy) => {
        this._spawn(enemy, game)
      }),
    )
  }

  private _spawn(enemy: Enemy, game: Game): void {
    const cx = gameToCanvasX(enemy.x)
    const cy = gameToCanvasY(enemy.y)
    const isBoss = enemy.type === EnemyType.BOSS_A || enemy.type === EnemyType.BOSS_B
    const sizePx = enemy.size
    // Per-enemy stable seed so replays reproduce identical particle fans.
    // `seedFor`'s key absorbs the string id; the (x, y) pair uses game-space
    // coords as cheap entropy. Plan §2.3: deterministic per enemyId.
    const seed = seedFor(`death-${enemy.id}`, enemy.x, enemy.y)

    if (isBoss) {
      this._spawnBoss(cx, cy, sizePx, enemy.color, seed)
      // The breach-magnitude shake reads as "something major just ended"; the
      // smaller per-hit amplitude wouldn't sell the moment.
      game.shake.shake(BOSS_SHAKE_AMPLITUDE, ANIM.SHAKE_BREACH)
    } else {
      this._spawnRegular(cx, cy, sizePx, enemy.color, seed)
    }
  }

  private _spawnRegular(cx: number, cy: number, sizePx: number, color: string, seed: number): void {
    // Count scales with enemy size; clamped so swarmlings still get a few
    // particles and bulwarks don't outrun the boss budget.
    const baseCount = Math.max(8, Math.min(14, Math.round(sizePx * 0.55)))
    // Reduced-motion: halve count and lifetime so the death still reads but
    // does not bounce particles across half the field (Phase 7 contract).
    const reduced = prefersReducedMotion()
    const count = reduced ? Math.max(4, Math.round(baseCount * 0.5)) : baseCount
    const lifetime = reduced ? REG_PARTICLE_LIFETIME * 0.5 : REG_PARTICLE_LIFETIME
    for (let i = 0; i < count; i++) {
      const angle = seededUnit(seed, i) * Math.PI * 2
      const speed = REG_PARTICLE_SPEED * (0.5 + seededUnit(seed, i + 17) * 0.7)
      this.spawn({
        kind: 'particle',
        age: 0,
        maxAge: lifetime,
        delay: 0,
        cx,
        cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        gravity: REG_PARTICLE_GRAVITY,
        radius: 1.6 + seededUnit(seed, i + 31) * 1.4,
        color,
        maxRadius: 0,
      })
    }
  }

  private _spawnBoss(cx: number, cy: number, sizePx: number, color: string, seed: number): void {
    // Bloom: white flash centred on the boss.
    this.spawn({
      kind: 'bloom',
      age: 0,
      maxAge: BOSS_BLOOM_LIFETIME,
      delay: 0,
      cx,
      cy,
      vx: 0,
      vy: 0,
      gravity: 0,
      radius: 0,
      color: '#ffffff',
      maxRadius: sizePx * 2.2,
    })
    // Shockwave: ring expands to ~3x size, fading.
    this.spawn({
      kind: 'shockwave',
      age: 0,
      maxAge: BOSS_SHOCKWAVE_DELAY + BOSS_SHOCKWAVE_LIFETIME,
      delay: BOSS_SHOCKWAVE_DELAY,
      cx,
      cy,
      vx: 0,
      vy: 0,
      gravity: 0,
      radius: 0,
      color: '#fff7c2',
      maxRadius: sizePx * 3.0,
    })
    // Particle burst: 32 particles, slightly delayed so they emerge from
    // under the shockwave instead of preceding it. Reduced-motion halves
    // both count and lifetime; bloom + shockwave are kept so the moment
    // still reads as a major event without the long particle drift.
    const reduced = prefersReducedMotion()
    const count = reduced ? 16 : 32
    const lifetime = reduced ? BOSS_PARTICLE_LIFETIME * 0.5 : BOSS_PARTICLE_LIFETIME
    for (let i = 0; i < count; i++) {
      const angle = seededUnit(seed, i) * Math.PI * 2
      const speed = BOSS_PARTICLE_SPEED * (0.55 + seededUnit(seed, i + 41) * 0.8)
      this.spawn({
        kind: 'particle',
        age: 0,
        maxAge: BOSS_PARTICLE_DELAY + lifetime,
        delay: BOSS_PARTICLE_DELAY,
        cx,
        cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        gravity: BOSS_PARTICLE_GRAVITY,
        radius: 2.4 + seededUnit(seed, i + 137) * 2.0,
        color,
        maxRadius: 0,
      })
    }
  }

  render(renderer: Renderer, _game: Game): void {
    const { ctx } = renderer
    if (this.effects.length === 0) return
    ctx.save()
    for (const e of this.effects) {
      if (e.age < e.delay) continue
      const local = e.age - e.delay
      const dur = Math.max(0.0001, e.maxAge - e.delay)
      const t = Math.min(1, local / dur)
      switch (e.kind) {
        case 'bloom':
          this._drawBloom(ctx, e, t)
          break
        case 'shockwave':
          this._drawShockwave(ctx, e, t)
          break
        case 'particle':
          this._drawParticle(ctx, e, local, t)
          break
      }
    }
    ctx.restore()
  }

  private _drawBloom(ctx: CanvasRenderingContext2D, e: DeathFx, t: number): void {
    const alpha = (1 - t) * 0.85
    const r = e.maxRadius * (0.35 + t * 0.65)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createRadialGradient(e.cx, e.cy, 0, e.cx, e.cy, r)
    g.addColorStop(0, `rgba(255,255,255,${alpha})`)
    g.addColorStop(0.45, `rgba(255,240,210,${alpha * 0.55})`)
    g.addColorStop(1, 'rgba(255,240,210,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(e.cx, e.cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private _drawShockwave(ctx: CanvasRenderingContext2D, e: DeathFx, t: number): void {
    const r = e.maxRadius * t
    const alpha = (1 - t) * (1 - t)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = e.color
    ctx.lineWidth = Math.max(1, 3.2 * (1 - t))
    ctx.globalAlpha = alpha
    ctx.beginPath()
    ctx.arc(e.cx, e.cy, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  private _drawParticle(ctx: CanvasRenderingContext2D, e: DeathFx, local: number, t: number): void {
    const x = e.cx + e.vx * local
    const y = e.cy + e.vy * local + 0.5 * e.gravity * local * local
    const alpha = (1 - t) * (1 - t)
    const r = Math.max(0.5, e.radius * (1 - t * 0.4))
    ctx.globalAlpha = alpha
    ctx.fillStyle = e.color
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}
