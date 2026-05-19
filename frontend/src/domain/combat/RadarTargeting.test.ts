/**
 * Lead-aim contract for RADAR_B / RADAR_C.
 *
 * The closed-form intercept is shared between RadarTowerSystem (projectile
 * launch direction) and RadarRangeRenderer (RADAR_C dashed bore-sight). Both
 * callers feed the same `radarProjectileSpeed(towerType)` value into
 * `interceptPoint`, so the dashed aim line and the projectile cannot diverge
 * at fire time. The cases below pin the degradations that keep that
 * invariant intact when the closed-form has no usable root.
 */
import { describe, it, expect } from 'vitest'
import { TowerType } from '@/data/constants'
import { interceptPoint, radarProjectileSpeed } from './RadarTargeting'
import type { Enemy } from '@/entities/types'

function enemyAt(x: number, y: number, vx = 0, vy = 0): Enemy {
  // Cast-only — interceptPoint touches just x/y/vx/vy. Avoid pulling the
  // full Enemy factory just for these geometric assertions.
  return { x, y, vx, vy } as unknown as Enemy
}

describe('radarProjectileSpeed', () => {
  it('RADAR_C is slower than RADAR_B (preserves sniper feel)', () => {
    expect(radarProjectileSpeed(TowerType.RADAR_C)).toBeLessThan(
      radarProjectileSpeed(TowerType.RADAR_B),
    )
  })
})

describe('interceptPoint', () => {
  it('static enemy → aim at current position', () => {
    const aim = interceptPoint(0, 0, enemyAt(5, 0, 0, 0), 10)
    expect(aim.x).toBeCloseTo(5)
    expect(aim.y).toBeCloseTo(0)
  })

  it('horizontal mover → leads ahead of current position', () => {
    // Enemy at (10, 0) moving with vx = -2 (toward shooter). Projectile speed 10.
    // Solve |(10 - 2t)| = 10t  →  t = 10/12.  Aim x = 10 - 2*(10/12) = 8.333…
    const aim = interceptPoint(0, 0, enemyAt(10, 0, -2, 0), 10)
    expect(aim.x).toBeCloseTo(10 - 2 * (10 / 12), 5)
    expect(aim.y).toBeCloseTo(0)
  })

  it('vertical-segment enemy (vx=0, vy≠0) is handled by closed-form', () => {
    // Enemy at (5, 0) moving downward at vy = -1, shooter at origin.
    // Quadratic in t: (5)² + (-t)² = (10t)²  →  25 = 99 t²  →  t = 5/√99.
    const aim = interceptPoint(0, 0, enemyAt(5, 0, 0, -1), 10)
    const t = 5 / Math.sqrt(99)
    expect(aim.x).toBeCloseTo(5, 5)
    expect(aim.y).toBeCloseTo(-t, 5)
  })

  it('unreachable enemy (faster than projectile and fleeing) → degrades to current pos', () => {
    // Enemy at (1, 0) moving away at vx = 100, projectile speed 1.
    // Discriminant < 0 (no real intercept) → return current position so the
    // aim line and projectile still agree visually (both shoot a dud).
    const aim = interceptPoint(0, 0, enemyAt(1, 0, 100, 0), 1)
    expect(aim.x).toBeCloseTo(1)
    expect(aim.y).toBeCloseTo(0)
  })

  it('enemy moving at exactly projectile speed (a≈0) → linear branch', () => {
    // |v| = projectileSpeed makes the quadratic coefficient a = 0.
    // Enemy at (5, 0) moving toward shooter at speed = projectile speed = 10.
    // Linear: t = -c/b = -25 / (2 * 5 * -10) = 0.25.  Aim x = 5 - 10*0.25 = 2.5.
    const aim = interceptPoint(0, 0, enemyAt(5, 0, -10, 0), 10)
    expect(aim.x).toBeCloseTo(2.5, 5)
    expect(aim.y).toBeCloseTo(0)
  })

  it('zero velocity returns current position even when speed = 0', () => {
    const aim = interceptPoint(0, 0, enemyAt(3, 4, 0, 0), 0)
    expect(aim.x).toBe(3)
    expect(aim.y).toBe(4)
  })

  it('both roots negative (enemy outruns projectile away from shooter) → degrades', () => {
    // Enemy at (5, 0) sprinting AWAY (vx=20) faster than projectile (speed=10).
    // Quadratic: a=300, b=200, c=25, disc=10000 → roots −1/2 and −1/6, both
    // negative. With no positive root the helper must fall back to the
    // current enemy position so the projectile + aim line still agree (both
    // shoot a dud in the same direction).
    const aim = interceptPoint(0, 0, enemyAt(5, 0, 20, 0), 10)
    expect(aim.x).toBe(5)
    expect(aim.y).toBe(0)
  })
})
