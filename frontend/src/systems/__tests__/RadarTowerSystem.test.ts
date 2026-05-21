/**
 * RADAR_A sweep — the focus-sector (×1.5) bonus must be decided by each
 * ENEMY's angle, not by where the sweep needle currently points. Keying it on
 * the needle smeared the bonus across the arc boundary by ±aoeWidth: an in-arc
 * enemy could be denied ×1.5 (needle not yet in the arc) and an out-of-arc
 * enemy could be over-credited. RADAR_B/C never had this — they already key on
 * the target's own angle (_getArcBonusForTarget). These tests pin RADAR_A to
 * that same contract, and cover the optional arcRestrict hard filter.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { RadarTowerSystem } from '../RadarTowerSystem'
import { GamePhase, TowerType } from '@/data/constants'
import { createMockGame, createMockTower, createMockEnemy } from './helpers'
import type { Enemy } from '@/entities/types'

// Place an enemy on a circle of radius `r` around a tower at the origin, so
// atan2(y, x) === theta exactly. hp is large enough that no sweep tick kills it.
function enemyAtAngle(theta: number, r = 3): Enemy {
  return createMockEnemy({
    x: r * Math.cos(theta),
    y: r * Math.sin(theta),
    hp: 1000,
    maxHp: 1000,
  })
}

const damageTaken = (e: Enemy) => e.maxHp - e.hp

describe('RadarTowerSystem — RADAR_A focus-sector bonus', () => {
  let game: ReturnType<typeof createMockGame>
  let system: RadarTowerSystem

  beforeEach(() => {
    game = createMockGame({ phase: GamePhase.WAVE })
    system = new RadarTowerSystem()
    system.init(game)
  })

  // Arc [1.0, 2.0] rad. The sweep needle starts at 0 and advances at the base
  // sweepSpeed of 2.0 rad/s, so a single update(dt) parks it at exactly 2.0*dt.
  function radarA() {
    return createMockTower({
      type: TowerType.RADAR_A, x: 0, y: 0,
      arcStart: 1.0, arcEnd: 2.0,
    })
  }

  it('credits ×1.5 by the enemy angle even when the needle sits inside the arc', () => {
    // update(0.5) → needle parked at 1.0 (the arc's start edge). Both enemies
    // fall within aoeWidth (0.5) of it, so both are struck this tick.
    const inArc = enemyAtAngle(1.3)   // inside [1.0, 2.0]
    const outArc = enemyAtAngle(0.7)  // outside
    game.towers.push(radarA())
    game.enemies.push(inArc, outArc)

    system.update(0.5, game)

    expect(damageTaken(outArc)).toBeGreaterThan(0)
    // Pre-fix the needle (1.0, in-arc) credited BOTH enemies ×1.5 → ratio 1.0.
    expect(damageTaken(inArc)).toBeCloseTo(damageTaken(outArc) * 1.5, 3)
  })

  it('credits ×1.5 by the enemy angle even when the needle sits outside the arc', () => {
    // update(0.35) → needle parked at 0.7, outside [1.0, 2.0].
    const inArc = enemyAtAngle(1.1)   // inside
    const outArc = enemyAtAngle(0.4)  // outside
    game.towers.push(radarA())
    game.enemies.push(inArc, outArc)

    system.update(0.35, game)

    expect(damageTaken(outArc)).toBeGreaterThan(0)
    // Pre-fix the needle (0.7, out-of-arc) denied BOTH enemies the bonus → 1.0.
    expect(damageTaken(inArc)).toBeCloseTo(damageTaken(outArc) * 1.5, 3)
  })

  it('arcRestrict skips enemies outside the arc entirely (hard filter)', () => {
    const tower = radarA()
    tower.arcRestrict = true
    const inArc = enemyAtAngle(1.3)
    const outArc = enemyAtAngle(0.7)
    game.towers.push(tower)
    game.enemies.push(inArc, outArc)

    system.update(0.5, game)

    expect(damageTaken(outArc)).toBe(0)
    expect(damageTaken(inArc)).toBeGreaterThan(0)
  })
})
