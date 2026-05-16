/**
 * EnemyRenderer — render-smoke tests.
 *
 * Visual Redesign Phase 6a/6b/6c/6d/6e/6f introduces math-error glyph bodies
 * for the General, Fast, Strong, Split, Helper, Regenerator, Bulwark,
 * Swarmling, Boss A, and Boss B enemies. Per the plan's per-enemy task shape,
 * each new body needs a render-smoke test that exercises the draw method
 * against a stubbed CanvasRenderingContext2D. The assertion is "does not
 * throw"; pixel output is not checked here.
 */
import { describe, it, expect } from 'vitest'
import { EnemyRenderer } from './EnemyRenderer'
import { createMockGame, createMockEnemy } from '@/systems/__tests__/helpers'
import type { Renderer, RendererPalette } from '@/engine/Renderer'
import type { EnemyType } from '@/data/constants'

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
    lineCap: 'butt',
    lineJoin: 'miter',
    strokeStyle: '',
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D
}

function makeRenderer(ctx: CanvasRenderingContext2D): Renderer {
  const palette: RendererPalette = {
    stoneDark: '#7a8da8',
    stoneLight: '#8ea1bd',
    gridLine: 'rgba(255, 255, 255, 0.25)',
    axis: '#ffd700',
    forbiddenFill: '#6a7d99',
  }
  return {
    ctx,
    palette,
    drawHealthBar: () => {},
  } as unknown as Renderer
}

describe('EnemyRenderer — Phase 6a/6b/6c/6d/6e/6f glyph bodies', () => {
  const glyphTypes: EnemyType[] = [
    'general' as EnemyType,
    'fast' as EnemyType,
    'strong' as EnemyType,
    'split' as EnemyType,
    'helper' as EnemyType,
    'regenerator' as EnemyType,
    'bulwark' as EnemyType,
    'swarmling' as EnemyType,
    'bossA' as EnemyType,
    'bossB' as EnemyType,
  ]

  for (const type of glyphTypes) {
    it(`renders ${type} glyph body without throwing`, () => {
      const game = createMockGame()
      game.enemies.push(createMockEnemy({ type, x: 5, y: 5 }))
      const renderer = new EnemyRenderer()
      const ctx = createCtxStub()
      expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
    })

    it(`renders ${type} glyph body with hit-flash + frost without throwing`, () => {
      const game = createMockGame()
      game.enemies.push(createMockEnemy({
        type,
        x: 5,
        y: 5,
        slowFactor: 0.5,
        slowTimer: 1,
        hp: 60,
      }))
      const renderer = new EnemyRenderer()
      const ctx = createCtxStub()
      expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
    })
  }

  // Phase 6c — Split's fraction body literally tears apart on death: the
  // numerator drifts up and the denominator down. Exercise the separation
  // branch with a mid-death-window enemy.
  it('renders split fraction mid-death separation without throwing', () => {
    const game = createMockGame()
    game.enemies.push(createMockEnemy({
      type: 'split' as EnemyType,
      x: 5,
      y: 5,
      alive: false,
      dying: true,
      dyingTimer: 0.18,
      deathMaxTime: 0.35,
    }))
    const renderer = new EnemyRenderer()
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })

  // Phase 6b — Strong's chromatic fringe widens with HP loss. Exercise the
  // distress branch with an enemy at low HP so the wider-fringe code path
  // runs at least once under the stubbed context.
  it('renders strong glyph cluster at low HP without throwing', () => {
    const game = createMockGame()
    game.enemies.push(createMockEnemy({
      type: 'strong' as EnemyType,
      x: 5,
      y: 5,
      hp: 5,
    }))
    const renderer = new EnemyRenderer()
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })

  // Phase 6d — Regenerator's rotating dashed ring and rising "+ε" glyph
  // particles only paint while the enemy is below max HP. Exercise the
  // aura branch explicitly so drawGlyphBody is called for "+ε" at least
  // once under the stubbed context.
  it('renders regenerator with active heal aura (rising +ε glyphs) without throwing', () => {
    const game = createMockGame()
    game.enemies.push(createMockEnemy({
      type: 'regenerator' as EnemyType,
      x: 5,
      y: 5,
      hp: 30,
      maxHp: 100,
      regenPerSec: 5,
    }))
    const renderer = new EnemyRenderer()
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })

  // Phase 6d — Helper's Σ glyph breathes only while helperRadius > 0; cover
  // that branch as well so the breath multiplier is exercised in CI.
  it('renders helper with active support aura (breathing Σ) without throwing', () => {
    const game = createMockGame()
    game.enemies.push(createMockEnemy({
      type: 'helper' as EnemyType,
      x: 5,
      y: 5,
      helperRadius: 3,
      helperHealPerSec: 4,
    }))
    const renderer = new EnemyRenderer()
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })

  // Phase 6f — Boss A's flickering QED halo is deterministic on
  // sin(time, index), but exercising several time points helps catch any
  // drift in the orbit math under the stubbed context.
  it('renders bossA equation body with flickering QED halo without throwing', () => {
    const game = createMockGame()
    game.enemies.push(createMockEnemy({ type: 'bossA' as EnemyType, x: 5, y: 5 }))
    const renderer = new EnemyRenderer()
    renderer.update(0.5, game)
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })

  // Phase 6f — Boss B's lemniscate path uses bezier curves; the orbiting `↻`
  // satellites depend on `_time`, so advance the clock once to exercise the
  // rotated-satellite path explicitly.
  it('renders bossB lemniscate body with orbiting paradox satellites without throwing', () => {
    const game = createMockGame()
    game.enemies.push(createMockEnemy({ type: 'bossB' as EnemyType, x: 5, y: 5 }))
    const renderer = new EnemyRenderer()
    renderer.update(0.5, game)
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })
})
