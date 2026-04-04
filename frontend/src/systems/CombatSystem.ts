/**
 * CombatSystem — 塔攻擊 + 砲彈 + 碰撞判定
 * 合併舊版 TowerSystem 的攻擊邏輯 + CollisionSystem。
 * Entity 無 update/render 方法；這個 System 全權負責戰鬥邏輯。
 */
import { Events, GamePhase, TowerType } from '@/data/constants'
import { distance, findIntersections, degToRad } from '@/math/MathUtils'
import { pointInSector as wasmPointInSector } from '@/math/WasmBridge'
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
  init(game: Game): void {
    game.eventBus.on(Events.CAST_SPELL, (tower) => {
      tower.configured = true
    })

    game.eventBus.on(Events.WAVE_START, () => {
      for (const tower of game.towers) {
        tower.cooldownTimer = 0
      }
    })
  }

  update(dt: number, game: Game): void {
    if (game.state.phase !== GamePhase.WAVE) return

    // 塔攻擊
    for (const tower of game.towers) {
      if (tower.disabled || !tower.configured) continue
      tower.cooldownTimer -= dt
      if (tower.cooldownTimer <= 0) {
        this._attackWith(tower, game)
        tower.cooldownTimer = tower.cooldown
      }
    }

    // 更新砲彈
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
      const proj = game.projectiles[i]
      proj.x += proj.vx * dt
      proj.y += proj.vy * dt

      // 離開格線範圍後失效
      if (proj.x < -5 || proj.x > 30 || proj.y < -5 || proj.y > 20) {
        proj.active = false
      }

      // 碰撞判定
      if (proj.active) {
        for (const enemy of game.enemies) {
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
      case TowerType.PROBABILITY_SHRINE: /* 不攻擊，Buff 系統負責 */ break
      case TowerType.FOURIER_SHIELD:    /* Boss 專用 */ break
    }
  }

  /** 函數砲：砲彈沿 y = mx+b（或 ax²+bx+c）與敵人路徑交點發射 */
  private _functionCannonAttack(tower: Tower, game: Game): void {
    if (!game.pathFunction) return

    const p = tower.params as Record<string, number>
    const isUpgraded = tower.level >= 2

    // 線性模式：y = mx + b；升級模式：y = ax² + bx + c（key: a, b_coeff, c）
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
      const speed = 10  // 遊戲單位/秒
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

  /** 雷達掃描塔：扇形 DPS，直接對範圍內敵人持續傷害 */
  private _radarSweepAttack(tower: Tower, game: Game): void {
    const { theta = 0, deltaTheta = 60, r = 4 } = tower.params as Record<string, number>
    const startAngle = degToRad(theta)
    const sweepAngle = degToRad(deltaTheta)

    for (const enemy of game.enemies) {
      if (!enemy.alive || enemy.isStealthed) continue
      // wasmPointInSector 內部已含 JS fallback，不需再呼叫 isPointInSector
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

  /** 積分砲：曲線積分面積覆蓋的敵人受傷 */
  private _integralCannonAttack(tower: Tower, game: Game): void {
    const { a = -0.5, b = 3, c = 2, intA = 0, intB = 6 } = tower.params as Record<string, number>
    const fn = (x: number) => a * x * x + b * x + c

    for (const enemy of game.enemies) {
      if (!enemy.alive || enemy.isStealthed) continue
      if (enemy.x >= intA && enemy.x <= intB) {
        const curveY = fn(enemy.x)
        if (enemy.y >= 0 && enemy.y <= curveY) {
          this._dealDamage(enemy, tower.effectiveDamage, game)
        }
      }
    }
  }

  /** 矩陣連結塔：對範圍內敵人施加線性變換後傷害 */
  private _matrixLinkAttack(tower: Tower, game: Game): void {
    const { a00 = 1, a01 = 0, a10 = 0, a11 = 1 } = tower.params as Record<string, number>
    const det = Math.abs(a00 * a11 - a01 * a10) // 行列式 ≈ 縮放倍率

    for (const enemy of game.enemies) {
      if (!enemy.alive || enemy.isStealthed) continue
      const dist = distance(tower.x, tower.y, enemy.x, enemy.y)
      if (dist <= tower.effectiveRange) {
        this._dealDamage(enemy, tower.effectiveDamage * Math.max(det, 0.5), game)
      }
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
    }
  }

  render(_renderer: unknown, _game: Game): void {}
}
