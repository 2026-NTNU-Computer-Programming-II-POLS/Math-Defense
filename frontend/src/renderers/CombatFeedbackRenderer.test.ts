/**
 * CombatFeedbackRenderer — logic tests. Canvas calls are stubbed (consistent
 * with Renderer.test.ts); assertions focus on which texts get drawn and when
 * they are pruned, not pixel output.
 */
import { describe, it, expect } from 'vitest'
import { CombatFeedbackRenderer } from './CombatFeedbackRenderer'
import { Events } from '@/data/constants'
import { createMockGame } from '@/systems/__tests__/helpers'
import type { Renderer } from '@/engine/Renderer'

function createCtxStub(): CanvasRenderingContext2D & { fillTexts: string[] } {
  const fillTexts: string[] = []
  const noop = (): void => {}
  return {
    fillTexts,
    save: noop,
    restore: noop,
    strokeText: noop,
    fillText: (text: string) => {
      fillTexts.push(text)
    },
    globalAlpha: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D & { fillTexts: string[] }
}

function makeRenderer(ctx: CanvasRenderingContext2D): Renderer {
  return { ctx } as unknown as Renderer
}

describe('CombatFeedbackRenderer', () => {
  it('renders "raw → applied" after a capped DAMAGE_RESOLVED event', () => {
    const game = createMockGame()
    const renderer = new CombatFeedbackRenderer()
    renderer.init(game)

    game.eventBus.emit(Events.DAMAGE_RESOLVED, {
      x: 1, y: 2, raw: 40, applied: 14, kind: 'capped',
    })

    const ctx = createCtxStub()
    renderer.render(makeRenderer(ctx), game)
    expect(ctx.fillTexts).toEqual(['40 → 14'])
  })

  it('renders just the reduced number for a reduced hit', () => {
    const game = createMockGame()
    const renderer = new CombatFeedbackRenderer()
    renderer.init(game)

    game.eventBus.emit(Events.DAMAGE_RESOLVED, {
      x: 1, y: 2, raw: 100, applied: 35, kind: 'reduced',
    })

    const ctx = createCtxStub()
    renderer.render(makeRenderer(ctx), game)
    expect(ctx.fillTexts).toEqual(['35'])
  })

  it('prunes the floating text after its lifetime elapses', () => {
    const game = createMockGame()
    const renderer = new CombatFeedbackRenderer()
    renderer.init(game)

    game.eventBus.emit(Events.DAMAGE_RESOLVED, {
      x: 1, y: 2, raw: 40, applied: 14, kind: 'capped',
    })
    renderer.update(0.7, game)

    const ctx = createCtxStub()
    renderer.render(makeRenderer(ctx), game)
    expect(ctx.fillTexts).toEqual([])
  })

  it('keeps the text alive before its lifetime elapses', () => {
    const game = createMockGame()
    const renderer = new CombatFeedbackRenderer()
    renderer.init(game)

    game.eventBus.emit(Events.DAMAGE_RESOLVED, {
      x: 1, y: 2, raw: 40, applied: 14, kind: 'capped',
    })
    renderer.update(0.3, game)

    const ctx = createCtxStub()
    renderer.render(makeRenderer(ctx), game)
    expect(ctx.fillTexts).toEqual(['40 → 14'])
  })

  it('clears all texts on LEVEL_START', () => {
    const game = createMockGame()
    const renderer = new CombatFeedbackRenderer()
    renderer.init(game)

    game.eventBus.emit(Events.DAMAGE_RESOLVED, {
      x: 1, y: 2, raw: 40, applied: 14, kind: 'capped',
    })
    game.eventBus.emit(Events.LEVEL_START, 0)

    const ctx = createCtxStub()
    renderer.render(makeRenderer(ctx), game)
    expect(ctx.fillTexts).toEqual([])
  })
})
