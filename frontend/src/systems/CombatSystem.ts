/**
 * CombatSystem — tower attacks + projectiles + collision detection
 * Merges the attack logic from the old TowerSystem with CollisionSystem.
 * Entities have no update/render methods; this System owns all combat logic.
 */
import { Events, GamePhase, TowerType, EnemyType, GRID_MIN_X, GRID_MAX_X, GRID_MIN_Y, GRID_MAX_Y } from '@/data/constants'
import { distance, findIntersections, degToRad } from '@/math/MathUtils'
import { pointInSector as wasmPointInSector } from '@/math/WasmBridge'
import { shouldSplit, spawnChildren } from '@/domain/combat/SplitSlimePolicy'
import type { Game } from '@/engine/Game'
import type { Tower, Enemy, Projectile } from '@/entities/types'

let _projId = 0

function makeProjectile(
  x: number, y: number,
  vx: number, vy: number,
  damage: number,
  color: string,
  ownerId: string,
): Projectile {
  return { id: `proj_${++_projId}`, x, y, vx, vy, damage, color, active: true, ownerId }
}

export class CombatSystem {
  private static readonly BOSS_SHIELD_DURATION = 5 // seconds
  private _unsubs: (() => void)[] = []
  private _pendingShieldAttempt: { match: number } | null = null

  init(game: Game): void {
    // Prevent duplicate listeners if init() is called without destroy()
    this.destroy()

    this._unsubs.push(
      game.eventBus.on(Events.CAST_SPELL, (tower) => {
        tower.configured = true
      }),

      game.eventBus.on(Events.WAVE_START, () => {
        for (const tower of game.towers) {
          tower.cooldownTimer = 0
        }
      }),

      game.eventBus.on(Events.LEVEL_START, () => {
        game.state.bossShieldTriggered = false
        game.state.bossShieldTimer = 0
        game.state.bossShieldTarget = null
      }),

      // Allow external shield-breaking (for BOSS_SHIELD UI)
      game.eventBus.on(Events.BOSS_SHIELD_ATTEMPT, ({ match }) => {
        if (game.state.bossShieldTimer <= 0) {
          // Shield not active yet — queue attempt for when it starts
          this._pendingShieldAttempt = { match }
          return
        }
        if (match >= 70) {
          this._breakBossShield(game)
        }
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
    this._pendingShieldAttempt = null
  }

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    // Boss shield: when boss dragon reaches x <= 8, grant temporary immunity
    if (!game.state.bossShieldTriggered) {
      const boss = game.enemies.find(
        (e) => e.type === EnemyType.BOSS_DRAGON && e.alive && e.x <= 8,
      )
      if (boss) {
        game.state.bossShieldTriggered = true
        game.state.bossShieldTimer = CombatSystem.BOSS_SHIELD_DURATION
        // Pseudo-random target waveform seeded by boss id so it stays stable across re-renders
        game.state.bossShieldTarget = CombatSystem._makeBossTarget(boss.id)
        boss.isStealthed = true
        game.eventBus.emit(Events.BOSS_SHIELD_START, undefined)

        // Process queued shield attempt from before shield was active
        if (this._pendingShieldAttempt) {
          const { match } = this._pendingShieldAttempt
          this._pendingShieldAttempt = null
          if (match >= 70) {
            this._breakBossShield(game)
          }
        }
      }
    }

    // Tick boss shield timer (auto-break after duration)
    if (game.state.bossShieldTimer > 0) {
      game.state.bossShieldTimer -= dt
      if (game.state.bossShieldTimer <= 0) {
        this._breakBossShield(game)
      }
    }

    // tower attacks
    for (const tower of game.towers) {
      if (tower.disabled || !tower.configured) continue
      tower.cooldownTimer -= dt
      if (tower.cooldownTimer <= 0) {
        this._attackWith(tower, game)
        tower.cooldownTimer = tower.cooldown
      }
    }

    // update projectiles
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
      const proj = game.projectiles[i]
      proj.x += proj.vx * dt
      proj.y += proj.vy * dt

      // deactivate once it leaves the grid bounds
      if (proj.x < GRID_MIN_X - 2 || proj.x > GRID_MAX_X + 5 || proj.y < GRID_MIN_Y - 3 || proj.y > GRID_MAX_Y + 2) {
        proj.active = false
      }

      // Collision detection — snapshot enemies because _dealDamage may push split-slime children
      // into game.enemies via ENEMY_KILLED, and forward iteration over a mutated array
      // can skip newly added entries or revisit older ones.
      if (proj.active) {
        for (const enemy of [...game.enemies]) {
          if (!enemy.alive || enemy.isStealthed) continue
          if (distance(proj.x, proj.y, enemy.x, enemy.y) < 0.5) {
            this._dealDamage(enemy, proj.damage, game)
            proj.active = false
            break
          }
        }
      }

      if (!proj.active) game.projectiles.splice(i, 1)
    }
  }

  private _attackWith(tower: Tower, game: Game): void {
    switch (tower.type) {
      case TowerType.FUNCTION_CANNON:   this._functionCannonAttack(tower, game); break
      case TowerType.RADAR_SWEEP:       this._radarSweepAttack(tower, game); break
      case TowerType.INTEGRAL_CANNON:   this._integralCannonAttack(tower, game); break
      case TowerType.MATRIX_LINK:       this._matrixLinkAttack(tower, game); break
      case TowerType.PROBABILITY_SHRINE: /* no attack — handled by BuffSystem */ break
      case TowerType.FOURIER_SHIELD:    /* boss battle only */ break
    }
  }

  /** Function Cannon: fires projectiles toward intersections of y = mx+b (or ax²+bx+c) with the enemy path */
  private _functionCannonAttack(tower: Tower, game: Game): void {
    if (!game.pathFunction) return

    const p = tower.params as Record<string, number>
    const isUpgraded = tower.level >= 2

    // linear mode: y = mx + b; upgraded mode: y = ax² + bx + c (keys: a, b_coeff, c)
    const shotFn = isUpgraded
      ? (x: number) => (p.a ?? 0) * x * x + (p.b_coeff ?? 1) * x + (p.c ?? 0)
      : (x: number) => (p.m ?? 1) * x + (p.b ?? 0)

    const intersections = findIntersections(shotFn, game.pathFunction, -3, 25)
    for (const xi of intersections) {
      const yi = shotFn(xi)
      const dx = xi - tower.x
      const dy = yi - tower.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len === 0) continue
      const speed = 10  // game units per second
      const proj = makeProjectile(
        tower.x, tower.y,
        (dx / len) * speed, (dy / len) * speed,
        tower.effectiveDamage,
        tower.color,
        tower.id,
      )
      game.projectiles.push(proj)
    }
  }

  /** Radar Sweep: sector-area DPS, deals continuous damage to enemies within range */
  private _radarSweepAttack(tower: Tower, game: Game): void {
    const { theta = 0, deltaTheta = 60, r = 4 } = tower.params as Record<string, number>
    const startAngle = degToRad(theta)
    const sweepAngle = degToRad(deltaTheta)

    for (const enemy of game.enemies) {
      if (!enemy.alive || enemy.isStealthed) continue
      // wasmPointInSector already includes a JS fallback; no need to call isPointInSector separately
      const inSector = wasmPointInSector(
        enemy.x, enemy.y,
        tower.x, tower.y,
        r, startAngle, sweepAngle,
      )

      if (inSector) {
        this._dealDamage(enemy, tower.effectiveDamage * tower.cooldown, game)
      }
    }
  }

  /** Integral Cannon: enemies covered by the integral area under the curve take damage */
  private _integralCannonAttack(tower: Tower, game: Game): void {
    const { a = -0.5, b = 3, c = 2, intA = 0, intB = 6 } = tower.params as Record<string, number>
    const fn = (x: number) => a * x * x + b * x + c

    for (const enemy of game.enemies) {
      if (!enemy.alive || enemy.isStealthed) continue
      if (enemy.x >= intA && enemy.x <= intB) {
        const curveY = fn(enemy.x)
        const minY = Math.min(0, curveY)
        const maxY = Math.max(0, curveY)
        if (enemy.y >= minY && enemy.y <= maxY) {
          this._dealDamage(enemy, tower.effectiveDamage, game)
        }
      }
    }
  }

  /** Matrix Link: applies a linear transform to enemies within range and deals damage */
  private _matrixLinkAttack(tower: Tower, game: Game): void {
    const { a00 = 1, a01 = 0, a10 = 0, a11 = 1 } = tower.params as Record<string, number>
    const det = Math.abs(a00 * a11 - a01 * a10) // determinant ≈ scale factor

    for (const enemy of game.enemies) {
      if (!enemy.alive || enemy.isStealthed) continue
      const dist = distance(tower.x, tower.y, enemy.x, enemy.y)
      if (dist <= tower.effectiveRange) {
        this._dealDamage(enemy, tower.effectiveDamage * Math.max(det, 0.5), game)
      }
    }
  }

  private _breakBossShield(game: Game): void {
    // Reset both flags so a still-living boss that re-crosses the trigger threshold
    // can re-arm its shield. Without this, the shield only ever fires once per level.
    game.state.bossShieldTimer = 0
    game.state.bossShieldTriggered = false
    game.state.bossShieldTarget = null
    const boss = game.enemies.find((e) => e.type === EnemyType.BOSS_DRAGON && e.alive)
    if (boss) boss.isStealthed = false
    game.eventBus.emit(Events.BOSS_SHIELD_END, undefined)
  }

  /** Cheap deterministic target waveform derived from the boss id. */
  private static _makeBossTarget(seed: string): { freqs: number[]; amps: number[] } {
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
    const r = (n: number) => ((Math.abs((h * (n + 1)) ^ 0x9e3779b9)) % 1000) / 1000
    return {
      freqs: [1 + r(0) * 4, 2 + r(1) * 4, 3 + r(2) * 4],
      amps: [0.5 + r(3) * 1.5, 0.3 + r(4), 0.2 + r(5)],
    }
  }

  private _dealDamage(enemy: Enemy, amount: number, game: Game): void {
    if (!enemy.alive || enemy.isStealthed) return
    enemy.hp -= amount
    if (enemy.hp <= 0) {
      enemy.hp = 0
      enemy.alive = false
      enemy.active = false
      game.eventBus.emit(Events.ENEMY_KILLED, enemy)

      // Split slime: delegate to SplitSlimePolicy
      if (shouldSplit(enemy)) {
        spawnChildren(enemy, {
          pathFunction: game.pathFunction,
          onChildCreated: (child) => {
            game.enemies.push(child)
            game.eventBus.emit(Events.ENEMY_SPAWNED, child)
          },
        })
      }
    }
  }

  render(_renderer: unknown, _game: Game): void {}
}
