/**
 * SpellEffectRenderer — render-smoke tests.
 *
 * Spell Re-skin Phase 1 (Option A) introduces glyph-centred bodies for each
 * of the four spells. Per the plan's per-spell task shape, each new draw
 * method needs a render-smoke against a stubbed CanvasRenderingContext2D.
 * Assertion is "does not throw"; pixel output is not checked here.
 */
import { describe, it, expect } from 'vitest'
import { Events } from '@/data/constants'
import { SpellEffectRenderer } from './SpellEffectRenderer'
import { createMockGame } from '@/systems/__tests__/helpers'
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
    forbidden: '#ff0000',
    axis: '#ffd700',
  } as RendererPalette
  return {
    ctx,
    palette,
    drawHealthBar: () => {},
  } as unknown as Renderer
}

describe('SpellEffectRenderer — Phase 1 glyph bodies', () => {
  const spells = [
    { id: 'fireball', radius: 3 },
    { id: 'slow', radius: 4 },
    { id: 'lightning', radius: 2 },
    { id: 'haste', radius: 2 },
  ] as const

  for (const spell of spells) {
    it(`renders ${spell.id} glyph body without throwing`, () => {
      const game = createMockGame()
      const renderer = new SpellEffectRenderer()
      renderer.init(game)
      game.eventBus.emit(Events.SPELL_EFFECT, {
        spellId: spell.id,
        x: 5,
        y: 5,
        radius: spell.radius,
      })
      // Advance through a few timestamps to exercise the easing branches
      // (cast frame, mid-life, end-of-life).
      for (const dt of [0.01, 0.2, 0.4, 0.6]) {
        renderer.update(dt, game)
        const ctx = createCtxStub()
        expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
      }
      renderer.destroy()
    })
  }

  it('renders all spells without throwing under prefers-reduced-motion', () => {
    // Stub matchMedia so prefersReducedMotion() returns true; the renderer
    // must take the drop-motion branch for every spell without crashing.
    const originalMatchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    try {
      for (const spell of spells) {
        const game = createMockGame()
        const renderer = new SpellEffectRenderer()
        renderer.init(game)
        game.eventBus.emit(Events.SPELL_EFFECT, {
          spellId: spell.id,
          x: 5,
          y: 5,
          radius: spell.radius,
        })
        for (const dt of [0.01, 0.3, 0.6]) {
          renderer.update(dt, game)
          const ctx = createCtxStub()
          expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
        }
        renderer.destroy()
      }
    } finally {
      window.matchMedia = originalMatchMedia
    }
  })

  it('falls back gracefully for an unknown spell id', () => {
    const game = createMockGame()
    const renderer = new SpellEffectRenderer()
    renderer.init(game)
    game.eventBus.emit(Events.SPELL_EFFECT, {
      spellId: 'unknown-spell',
      x: 3,
      y: 3,
      radius: 1,
    })
    const ctx = createCtxStub()
    expect(() => renderer.render(makeRenderer(ctx), game)).not.toThrow()
    renderer.destroy()
  })
})
