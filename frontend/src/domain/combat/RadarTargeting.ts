import { TowerType } from '@/data/constants'
import { distance } from '@/math/MathUtils'
import type { Enemy, TargetingMode, Tower } from '@/entities/types'

export interface InterceptPoint {
  x: number
  y: number
}

// Single source of truth for radar projectile launch speeds. RadarTowerSystem
// uses it when constructing the projectile; RadarRangeRenderer feeds the same
// value into `interceptPoint` so the dashed bore-sight ends exactly where the
// projectile will land.
//
// RADAR_C bumped 8→10 alongside the lead-aim rollout: still slower than B's
// 15 (preserving the "heavy sniper round" feel) but shortens max-range
// flight time enough that mid-flight segment crossings no longer produce a
// visible "ghost line" between aim and impact.
export function radarProjectileSpeed(towerType: TowerType): number {
  return towerType === TowerType.RADAR_C ? 10 : 15
}

export function radarTargetCount(tower: Tower): number {
  return 1
    + Math.floor(tower.talentMods['target_count'] ?? 0)
    + Math.floor(tower.upgradeExtras?.['targetCount'] ?? 0)
}

// Shared between RadarTowerSystem (firing) and RadarRangeRenderer (bore-sight
// line) so the dashed aim and the actual projectile cannot diverge.
export function selectRadarTargets(tower: Tower, enemies: Enemy[], count: number): Enemy[] {
  const range = tower.effectiveRange
  const candidates: { enemy: Enemy; dist: number }[] = []
  for (const enemy of enemies) {
    if (!enemy.alive) continue
    const d = distance(tower.x, tower.y, enemy.x, enemy.y)
    if (d > range) continue
    if (tower.arcRestrict && !isInArc(tower, enemy)) continue
    candidates.push({ enemy, dist: d })
  }

  // Game convention (see MovementSystem): enemies travel from larger x → smaller x
  // toward the origin. So "first" (closest to goal) = smallest x.
  const mode: TargetingMode = tower.targetingMode ?? 'first'
  switch (mode) {
    case 'first':     candidates.sort((a, b) => a.enemy.x - b.enemy.x); break
    case 'last':      candidates.sort((a, b) => b.enemy.x - a.enemy.x); break
    case 'strongest': candidates.sort((a, b) => b.enemy.hp - a.enemy.hp); break
    case 'closest':
    default:          candidates.sort((a, b) => a.dist - b.dist); break
  }
  return candidates.slice(0, count).map(c => c.enemy)
}

// Closed-form quadratic intercept: solve |E + v·t − S|² = (s·t)² for the
// smallest positive t, then extrapolate. Used by both RadarTowerSystem
// (projectile velocity) and RadarRangeRenderer (dashed bore-sight) so they
// stay byte-identical. Velocity is the measured (vx, vy) written by
// MovementSystem each tick, so segment-kind awareness isn't needed here.
//
// Degradations (return current enemy position) are intentional safety nets:
//   - no measured velocity (fresh spawn): nothing to lead
//   - discriminant < 0: enemy outruns projectile in the relevant direction
//   - no positive root: enemy already past the intercept window
// All keep visual & projectile consistent because both callers share this fn.
export function interceptPoint(
  shooterX: number,
  shooterY: number,
  enemy: Enemy,
  projectileSpeed: number,
): InterceptPoint {
  const vx = enemy.vx
  const vy = enemy.vy
  if (vx === 0 && vy === 0) return { x: enemy.x, y: enemy.y }

  const dx = enemy.x - shooterX
  const dy = enemy.y - shooterY
  const a = vx * vx + vy * vy - projectileSpeed * projectileSpeed
  const b = 2 * (dx * vx + dy * vy)
  const c = dx * dx + dy * dy

  let t: number
  if (Math.abs(a) < 1e-9) {
    // Enemy speed ≈ projectile speed — quadratic collapses to linear.
    if (Math.abs(b) < 1e-9) return { x: enemy.x, y: enemy.y }
    t = -c / b
  } else {
    const disc = b * b - 4 * a * c
    if (disc < 0) return { x: enemy.x, y: enemy.y }
    const sq = Math.sqrt(disc)
    const t1 = (-b - sq) / (2 * a)
    const t2 = (-b + sq) / (2 * a)
    // Pick smallest strictly positive root.
    const pos = [t1, t2].filter((v) => v > 0)
    if (pos.length === 0) return { x: enemy.x, y: enemy.y }
    t = Math.min(...pos)
  }

  if (!Number.isFinite(t) || t <= 0) return { x: enemy.x, y: enemy.y }
  return { x: enemy.x + vx * t, y: enemy.y + vy * t }
}

function isInArc(tower: Tower, enemy: Enemy): boolean {
  // allow-non-deterministic-math: visual/geometric arc check, not in RNG draw schedule.
  const angle = Math.atan2(enemy.y - tower.y, enemy.x - tower.x)
  return isAngleInArc(angle, tower.arcStart ?? 0, tower.arcEnd ?? Math.PI / 2)
}

function isAngleInArc(angle: number, start: number, end: number): boolean {
  const a = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const s = ((start % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const e = ((end % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  if (s <= e) return a >= s && a <= e
  return a >= s || a <= e
}
