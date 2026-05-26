/**
 * Phase 6 Q8 — projectTowerScene.chargeProgress contract pin.
 *
 * The LIMIT renderer's asymptote-point ascent + baseplate charge arc are
 * driven from this single ratio, so the projection contract has to stay
 * stable across refactors: configured-and-ticking LIMIT → number in [0,1];
 * every other case → null. Anything else and the burst visual either
 * vanishes (renderer falls back to idle sawtooth) or paints inappropriately.
 */
import { describe, it, expect } from 'vitest'
import { projectTowerScene } from './project-towers'
import { TowerType } from '@/data/constants'
import { createMockGame, createMockTower } from '@/systems/__tests__/helpers'

describe('projectTowerScene — chargeProgress for LIMIT', () => {
  it('a fresh LIMIT with cooldownTimer=0 projects chargeProgress=1', () => {
    const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
    game.towers.push(createMockTower({
      type: TowerType.LIMIT,
      cooldown: 3.0,
      cooldownTimer: 0,
      configured: true,
    }))

    const view = projectTowerScene(game)

    expect(view.towers[0].chargeProgress).toBe(1)
  })

  it('a LIMIT mid-charge projects chargeProgress = 1 - timer/cooldown', () => {
    const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
    game.towers.push(createMockTower({
      type: TowerType.LIMIT,
      cooldown: 3.0,
      cooldownTimer: 1.5,
      configured: true,
    }))

    const view = projectTowerScene(game)

    expect(view.towers[0].chargeProgress).toBeCloseTo(0.5, 5)
  })

  it('an unconfigured LIMIT projects chargeProgress=null', () => {
    const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
    game.towers.push(createMockTower({
      type: TowerType.LIMIT,
      cooldown: 3.0,
      cooldownTimer: 0,
      configured: false,
    }))

    const view = projectTowerScene(game)

    expect(view.towers[0].chargeProgress).toBeNull()
  })

  it('a disabled LIMIT projects chargeProgress=null even if configured', () => {
    const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
    game.towers.push(createMockTower({
      type: TowerType.LIMIT,
      cooldown: 3.0,
      cooldownTimer: 0,
      configured: true,
      disabled: true,
    }))

    const view = projectTowerScene(game)

    expect(view.towers[0].chargeProgress).toBeNull()
  })

  it('non-LIMIT towers project chargeProgress=null even when configured', () => {
    const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
    game.towers.push(createMockTower({
      type: TowerType.MAGIC,
      cooldown: 1.0,
      cooldownTimer: 0,
      configured: true,
    }))
    game.towers.push(createMockTower({
      type: TowerType.RADAR_B,
      cooldown: 0.3,
      cooldownTimer: 0.15,
      configured: true,
    }))
    game.towers.push(createMockTower({
      type: TowerType.CALCULUS,
      cooldown: 0,
      cooldownTimer: 0,
      configured: true,
    }))

    const view = projectTowerScene(game)

    for (const t of view.towers) {
      expect(t.chargeProgress).toBeNull()
    }
  })

  it('clamps to [0, 1] when the timer drifts outside the cooldown window', () => {
    // Cooldown timer >= cooldown can happen for a single frame after a reset;
    // the projection must not surface a negative chargeProgress to the renderer.
    const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
    game.towers.push(createMockTower({
      type: TowerType.LIMIT,
      cooldown: 3.0,
      cooldownTimer: 5.0,  // would yield 1 - 5/3 = -0.67 unclamped
      configured: true,
    }))

    const view = projectTowerScene(game)

    expect(view.towers[0].chargeProgress).toBe(0)
  })
})
