/**
 * PetRenderer — render-smoke tests.
 *
 * Visual Redesign Phase 6.5-A recasts pets as math-helper glyph bodies with
 * an allied cyan-only chromatic fringe. Per the plan's per-entity task
 * shape, every trait needs a render-smoke test that exercises the draw
 * path against a stubbed CanvasRenderingContext2D. The assertion is "does
 * not throw"; pixel-level output is not checked here.
 */
import { describe, it, expect } from 'vitest'
import { PetRenderer } from './PetRenderer'
import { createMockGame } from '@/systems/__tests__/helpers'
import type { Renderer, RendererPalette } from '@/engine/Renderer'
import type { PetTrait } from '@/engine/projections/views'
import type { Pet } from '@/entities/types'
import { GamePhase } from '@/data/constants'

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
    axis: '#ffd700',
    boardBase: '#E8EFF5',
    boardBaseAlt: '#DCE5ED',
    boardAxis: '#ADA284',
    gridLine: 'rgba(79, 74, 72, 0.18)',
    forbiddenFill: '#E8EFF5',
    forbiddenHatch: 'rgba(122, 141, 168, 0.55)',
  }
  return { ctx, palette } as unknown as Renderer
}

function makePet(trait: PetTrait): Pet {
  return {
    id: `pet-${trait}`,
    ownerId: 'tower-1',
    x: 5,
    y: 5,
    homeX: 5,
    homeY: 5,
    damage: 1,
    speed: 1,
    attackSpeed: 1,
    range: 3,
    trait,
    abilityMod: 0,
    cooldownTimer: 0,
    targetId: null,
    active: true,
    critChance: 0,
  }
}

describe('PetRenderer — Phase 6.5-A glyph helpers', () => {
  const traits: PetTrait[] = ['slow', 'fast', 'heavy', 'basic']

  for (const trait of traits) {
    it(`renders ${trait} pet glyph body without throwing`, () => {
      const game = createMockGame()
      game.state.phase = GamePhase.WAVE
      game.pets.push(makePet(trait))
      const renderer = new PetRenderer()
      renderer.update(0.5, game)
      const ctx = createCtxStub()
      expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
    })
  }

  it('skips render outside WAVE phase (no pets in view)', () => {
    const game = createMockGame()
    game.state.phase = GamePhase.BUILD
    game.pets.push(makePet('slow'))
    const renderer = new PetRenderer()
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
  })
})
