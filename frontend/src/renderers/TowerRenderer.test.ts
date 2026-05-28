/**
 * TowerRenderer — render-smoke tests.
 *
 * Visual Redesign Phase 5a requires a per-instrument smoke test that
 * exercises the new draw method against a stubbed CanvasRenderingContext2D.
 * The assertion is "does not throw"; pixel-level output is not checked.
 *
 * Coverage extends to every tower type so future 5b–5e rewrites land with
 * the same protection.
 */
import { describe, it, expect } from 'vitest'
import { TowerRenderer } from './TowerRenderer'
import { TowerType, ANIM } from '@/data/constants'
import { createMockGame, createMockTower, createMockEnemy } from '@/systems/__tests__/helpers'
import type { Renderer, RendererPalette } from '@/engine/Renderer'

function createCtxStub(): CanvasRenderingContext2D {
  const noop = (): void => {}
  const gradient = { addColorStop: noop }
  return {
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    roundRect: noop,
    bezierCurveTo: noop,
    quadraticCurveTo: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    strokeText: noop,
    setLineDash: noop,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D
}

function makeRenderer(ctx: CanvasRenderingContext2D): Renderer {
  const palette: RendererPalette = {
    stoneDark: '#7a8da8',
    stoneLight: '#8ea1bd',
    axis: '#ffd700',
    boardBase: '#E8EFF5',
    boardBaseAlt: '#DCE5ED',
    boardAxis: '#ADA284',
    gridLine: 'rgba(79, 74, 72, 0.18)',
    forbiddenFill: '#E8EFF5',
    forbiddenHatch: 'rgba(122, 141, 168, 0.55)',
    outsideFill: '#DCE5ED',
  }
  return { ctx, palette } as unknown as Renderer
}

describe('TowerRenderer — smoke tests', () => {
  const types: TowerType[] = [
    TowerType.MAGIC,
    TowerType.RADAR_A,
    TowerType.RADAR_B,
    TowerType.RADAR_C,
    TowerType.MATRIX,
    TowerType.LIMIT,
    TowerType.CALCULUS,
  ]

  for (const type of types) {
    it(`renders ${type} body without throwing`, () => {
      const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
      game.towers.push(createMockTower({ type, x: 5, y: 5, level: 1 }))
      const renderer = new TowerRenderer()
      const ctx = createCtxStub()
      expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
    })
  }

  it('Magic tower paints firing-flash branch when firingFlashAge < ANIM.TOWER_FIRE_FLASH', () => {
    const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
    game.towers.push(createMockTower({
      type: TowerType.MAGIC,
      x: 5,
      y: 5,
      firingFlashAge: ANIM.TOWER_FIRE_FLASH * 0.3,
    }))
    const renderer = new TowerRenderer()
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })

  it('Magic tower paints idle branch when firingFlashAge >= ANIM.TOWER_FIRE_FLASH', () => {
    const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
    game.towers.push(createMockTower({
      type: TowerType.MAGIC,
      x: 5,
      y: 5,
      firingFlashAge: ANIM.TOWER_FIRE_FLASH + 1,
    }))
    const renderer = new TowerRenderer()
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })

  it('tier-3 Magic tower paints the rotating rune ring', () => {
    const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
    game.towers.push(createMockTower({ type: TowerType.MAGIC, x: 5, y: 5, level: 3 }))
    const renderer = new TowerRenderer()
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })

  // Visual Redesign Phase 5b — Radar instruments. The brass telescope (RADAR_C)
  // rotates its tube toward the enemy RadarTowerSystem would fire at next
  // (selectRadarTargets); we want a no-throw assertion on both the tracking
  // branch (enemy present, finite aimAngle) and the idle branch (no enemies,
  // aimAngle === null falls back to arc midpoint). RADAR_B shares the
  // aim-tracking projection path even though its astrolabe body is
  // rotation-static.
  // Visual Redesign Phase 5c — Matrix tower paints two diagonal cells on
  // fire. The smoke test asserts the firing branch runs without throwing;
  // the parameterized loop above already covers the idle (no-fire) branch.
  it('Matrix tower paints the diagonal-cell firing flash', () => {
    const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
    game.towers.push(createMockTower({
      type: TowerType.MATRIX,
      x: 5,
      y: 5,
      firingFlashAge: ANIM.TOWER_FIRE_FLASH * 0.3,
    }))
    const renderer = new TowerRenderer()
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })

  // Visual Redesign Phase 5d — Limit tower paints the asymptote-snap branch
  // on fire. The parameterized loop above already covers the idle branch
  // where the point ascends without firing.
  it('Limit tower paints the bound-snap firing branch', () => {
    const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
    game.towers.push(createMockTower({
      type: TowerType.LIMIT,
      x: 5,
      y: 5,
      firingFlashAge: ANIM.TOWER_FIRE_FLASH * 0.3,
    }))
    const renderer = new TowerRenderer()
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })

  // Phase 6 Q8 — Limit tower also has an "idle hint" branch when the player
  // hasn't yet picked an answer (configured=false → chargeProgress=null) so
  // the asymptote-approach sawtooth still plays as a teaser. Smoke-test it.
  it('Limit tower paints the unconfigured idle-sawtooth branch (chargeProgress=null)', () => {
    const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
    game.towers.push(createMockTower({
      type: TowerType.LIMIT,
      x: 5,
      y: 5,
      configured: false,
    }))
    const renderer = new TowerRenderer()
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })

  // Phase 6 Q8 — Limit tower mid-charge paints both the charge-driven point
  // height *and* the baseplate charge arc (partial sweep).
  it('Limit tower paints the mid-charge arc branch', () => {
    const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
    game.towers.push(createMockTower({
      type: TowerType.LIMIT,
      x: 5,
      y: 5,
      configured: true,
      cooldown: 3.0,
      cooldownTimer: 1.5,
    }))
    const renderer = new TowerRenderer()
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })

  // Visual Redesign Phase 5e — Calculus tower sheds `dx`/`dy` particles on
  // fire. Exercise the firing branch with an enemy in range so aimAngle is
  // populated (idle branch is covered by the parameterized loop above).
  it('Calculus tower paints the dx/dy shed-particle firing branch', () => {
    const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
    game.towers.push(createMockTower({
      type: TowerType.CALCULUS,
      x: 5,
      y: 5,
      firingFlashAge: ANIM.TOWER_FIRE_FLASH * 0.3,
    }))
    game.enemies.push(createMockEnemy({ x: 7, y: 5 }))
    const renderer = new TowerRenderer()
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })

  it('Radar C with an enemy in range paints the tracking telescope branch', () => {
    const game = createMockGame();
    (game as unknown as { hud: { keyboardCursor: null } }).hud = { keyboardCursor: null }
    game.towers.push(createMockTower({ type: TowerType.RADAR_C, x: 5, y: 5 }))
    // Place an enemy near the tower so projectTowerScene populates aimAngle.
    game.enemies.push(createMockEnemy({ x: 7, y: 5 }))
    const renderer = new TowerRenderer()
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })
})
