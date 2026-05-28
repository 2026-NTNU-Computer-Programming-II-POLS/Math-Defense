/**
 * LimitBurstRenderer — logic tests. Canvas calls are stubbed; assertions
 * focus on which texts get drawn (per-hit damage, result badge) and when
 * effects get pruned, not pixel output. Matches CombatFeedbackRenderer.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { LimitBurstRenderer } from './LimitBurstRenderer'
import { Events } from '@/data/constants'
import { createMockGame } from '@/systems/__tests__/helpers'
import type { Renderer } from '@/engine/Renderer'
import type { LimitBurstPayload } from '@/engine/Game'

function createCtxStub(): CanvasRenderingContext2D & { fillTexts: string[]; arcCalls: number } {
  const fillTexts: string[] = []
  let arcCalls = 0
  const noop = (): void => {}
  const stub = {
    get fillTexts() { return fillTexts },
    get arcCalls() { return arcCalls },
    save: noop,
    restore: noop,
    beginPath: noop,
    stroke: noop,
    strokeText: noop,
    arc: () => { arcCalls += 1 },
    fillText: (text: string) => { fillTexts.push(text) },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineWidth: 1,
    lineCap: 'butt',
    strokeStyle: '',
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D & { fillTexts: string[]; arcCalls: number }
  return stub
}

function makeRenderer(ctx: CanvasRenderingContext2D): Renderer {
  return { ctx } as unknown as Renderer
}

function basePayload(over: Partial<LimitBurstPayload> = {}): LimitBurstPayload {
  return {
    towerId: 't1',
    x: 5, y: 5,
    range: 4,
    color: '#abcdef',
    outcome: '+c',
    multiplier: 1.5,
    answerValue: 3,
    hits: [],
    ...over,
  }
}

describe('LimitBurstRenderer', () => {
  it('spawns a shockwave + result badge even when no enemies were hit', () => {
    const game = createMockGame()
    const renderer = new LimitBurstRenderer()
    renderer.init(game)

    game.eventBus.emit(Events.LIMIT_BURST, basePayload({ outcome: 'zero', hits: [] }))

    const ctx = createCtxStub()
    renderer.render(makeRenderer(ctx), game)
    expect(ctx.arcCalls).toBe(1)           // shockwave ring
    expect(ctx.fillTexts).toEqual(['0 → chip'])  // chip badge only
  })

  it('paints one damage popup per hit plus the badge', () => {
    const game = createMockGame()
    const renderer = new LimitBurstRenderer()
    renderer.init(game)

    game.eventBus.emit(Events.LIMIT_BURST, basePayload({
      outcome: '+c',
      answerValue: 3,
      hits: [
        { x: 1, y: 1, damage: 45, killed: false },
        { x: 2, y: 2, damage: 90, killed: false },
      ],
    }))

    const ctx = createCtxStub()
    renderer.render(makeRenderer(ctx), game)
    expect(ctx.fillTexts).toEqual(['45', '90', '+C ×3'])
  })

  it('renders KILL for +inf instakill hits and the kill badge', () => {
    const game = createMockGame()
    const renderer = new LimitBurstRenderer()
    renderer.init(game)

    game.eventBus.emit(Events.LIMIT_BURST, basePayload({
      outcome: '+inf',
      answerValue: Infinity,
      hits: [
        { x: 1, y: 1, damage: 0, killed: true },
        { x: 2, y: 2, damage: 0, killed: true },
      ],
    }))

    const ctx = createCtxStub()
    renderer.render(makeRenderer(ctx), game)
    expect(ctx.fillTexts).toEqual(['KILL', 'KILL', '+∞ INSTAKILL'])
  })

  it('prunes effects after the longest lifetime elapses', () => {
    const game = createMockGame()
    const renderer = new LimitBurstRenderer()
    renderer.init(game)

    game.eventBus.emit(Events.LIMIT_BURST, basePayload({
      hits: [{ x: 1, y: 1, damage: 45, killed: false }],
    }))
    renderer.update(1.0, game)  // > BADGE_LIFETIME (0.9)

    const ctx = createCtxStub()
    renderer.render(makeRenderer(ctx), game)
    expect(ctx.fillTexts).toEqual([])
    expect(ctx.arcCalls).toBe(0)
  })

  it('clears all effects on LEVEL_START', () => {
    const game = createMockGame()
    const renderer = new LimitBurstRenderer()
    renderer.init(game)

    game.eventBus.emit(Events.LIMIT_BURST, basePayload({
      hits: [{ x: 1, y: 1, damage: 45, killed: false }],
    }))
    game.eventBus.emit(Events.LEVEL_START, 0)

    const ctx = createCtxStub()
    renderer.render(makeRenderer(ctx), game)
    expect(ctx.fillTexts).toEqual([])
    expect(ctx.arcCalls).toBe(0)
  })
})
