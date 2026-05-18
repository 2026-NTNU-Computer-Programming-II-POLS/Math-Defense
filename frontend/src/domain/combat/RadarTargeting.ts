import { distance } from '@/math/MathUtils'
import type { Tower, Enemy, TargetingMode } from '@/entities/types'

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
