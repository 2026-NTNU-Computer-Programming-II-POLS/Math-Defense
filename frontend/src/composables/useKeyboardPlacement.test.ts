/**
 * Component tests for useKeyboardPlacement (Pedagogical Backlog §19).
 *
 * Verifies the spec §19.5 acceptance: keydown events on the composable move
 * the cursor across the LegalPositionSet, Enter triggers placement at the
 * cursor, Tab cycles tower types, Escape cancels the held tower, and the
 * cursor is cleared when phase leaves BUILD.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, type Ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

const mockPositions: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1, 0], [2, 0], [-1, 0],
  [0, 1], [1, 1], [-1, 1],
  [0, -1], [1, -1],
]

vi.mock('@/domain/placement/legal-positions', () => ({
  computeLegalPositions: vi.fn(() => ({
    has: (gx: number, gy: number) =>
      mockPositions.some(([x, y]) => x === gx && y === gy),
    positions: mockPositions,
  })),
}))

import { computeLegalPositions } from '@/domain/placement/legal-positions'
import { useKeyboardPlacement, type GameLike } from './useKeyboardPlacement'
import { Events, GamePhase, TowerType } from '@/data/constants'
import { EventBus } from '@/engine/EventBus'
import type { GameEvents } from '@/engine/Game'
import { useUiStore } from '@/stores/uiStore'
import { useGameStore } from '@/stores/gameStore'

function makeGameStub(phase: GamePhase = GamePhase.BUILD): GameLike {
  const eventBus = new EventBus<GameEvents>()
  return {
    eventBus,
    state: { phase } as GameLike['state'],
    levelContext: { path: {} } as unknown as GameLike['levelContext'],
    hud: { keyboardCursor: null },
  }
}

function mountComposable(gameRef: Ref<GameLike | null>) {
  const Wrapper = defineComponent({
    setup() {
      useKeyboardPlacement(gameRef)
      return () => h('div')
    },
  })
  return mount(Wrapper)
}

function dispatchKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }))
}

describe('useKeyboardPlacement — keydown navigation (§19.5)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // Unlock all tower types so Tab/digit selection has the full set.
    useGameStore().level = 5
  })

  it('does not show the cursor on attach — waits for first arrow keydown', () => {
    const game = makeGameStub()
    const gameRef = ref<GameLike | null>(game)
    const wrapper = mountComposable(gameRef)
    // Lazy reveal: pure-mouse players never see the §19 focus ring.
    expect(game.hud.keyboardCursor).toBeNull()
    wrapper.unmount()
  })

  it('first arrow keydown seeds the cursor at the first legal position', () => {
    const game = makeGameStub()
    const wrapper = mountComposable(ref<GameLike | null>(game))
    expect(game.hud.keyboardCursor).toBeNull()
    dispatchKey('ArrowRight')
    expect(game.hud.keyboardCursor).toEqual({ gx: 0, gy: 0 })
    wrapper.unmount()
  })

  it('moves cursor with arrow keys among legal positions', () => {
    const game = makeGameStub()
    const wrapper = mountComposable(ref<GameLike | null>(game))

    dispatchKey('ArrowRight') // reveal at (0,0); does not move
    expect(game.hud.keyboardCursor).toEqual({ gx: 0, gy: 0 })

    dispatchKey('ArrowRight')
    expect(game.hud.keyboardCursor).toEqual({ gx: 1, gy: 0 })

    dispatchKey('ArrowUp')
    expect(game.hud.keyboardCursor).toEqual({ gx: 1, gy: 1 })

    dispatchKey('ArrowLeft')
    expect(game.hud.keyboardCursor).toEqual({ gx: 0, gy: 1 })

    dispatchKey('ArrowDown')
    expect(game.hud.keyboardCursor).toEqual({ gx: 0, gy: 0 })

    wrapper.unmount()
  })

  it('does not move past the rightmost legal position', () => {
    const game = makeGameStub()
    const wrapper = mountComposable(ref<GameLike | null>(game))
    dispatchKey('ArrowRight') // reveal at (0,0)
    dispatchKey('ArrowRight') // (0,0) → (1,0)
    dispatchKey('ArrowRight') // (1,0) → (2,0)
    expect(game.hud.keyboardCursor).toEqual({ gx: 2, gy: 0 })
    dispatchKey('ArrowRight') // no candidate further right; cursor stays
    expect(game.hud.keyboardCursor).toEqual({ gx: 2, gy: 0 })
    wrapper.unmount()
  })

  it('emits CANVAS_CLICK at cursor when Enter is pressed', () => {
    const game = makeGameStub()
    const handler = vi.fn()
    game.eventBus.on(Events.CANVAS_CLICK, handler)
    const wrapper = mountComposable(ref<GameLike | null>(game))

    dispatchKey('ArrowRight') // reveal at (0,0)
    dispatchKey('ArrowRight') // cursor → (1, 0)
    dispatchKey('Enter')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toMatchObject({ game: { x: 1, y: 0 } })
    wrapper.unmount()
  })

  it('Tab cycles unlocked tower types', () => {
    const ui = useUiStore()
    const game = makeGameStub()
    const wrapper = mountComposable(ref<GameLike | null>(game))

    expect(ui.selectedTowerType).toBeNull()
    dispatchKey('Tab')
    const first = ui.selectedTowerType
    expect(first).not.toBeNull()
    dispatchKey('Tab')
    expect(ui.selectedTowerType).not.toBe(first)
    wrapper.unmount()
  })

  it('Escape clears the held tower', () => {
    const ui = useUiStore()
    ui.selectTower(TowerType.MAGIC)
    const game = makeGameStub()
    const wrapper = mountComposable(ref<GameLike | null>(game))

    dispatchKey('Escape')
    expect(ui.selectedTowerType).toBeNull()
    wrapper.unmount()
  })

  it('digit 1 picks the first unlocked tower type', () => {
    const ui = useUiStore()
    const game = makeGameStub()
    const wrapper = mountComposable(ref<GameLike | null>(game))

    dispatchKey('Digit1')
    expect(ui.selectedTowerType).toBe(TowerType.MAGIC)
    wrapper.unmount()
  })

  it('after opt-in, clears cursor on WAVE and auto-restores on BUILD re-entry', () => {
    const game = makeGameStub()
    const wrapper = mountComposable(ref<GameLike | null>(game))

    // First arrow flips the sticky opt-in and seeds the cursor.
    dispatchKey('ArrowRight')
    expect(game.hud.keyboardCursor).toEqual({ gx: 0, gy: 0 })

    game.state.phase = GamePhase.WAVE
    game.eventBus.emit(Events.PHASE_CHANGED, { from: GamePhase.BUILD, to: GamePhase.WAVE })
    expect(game.hud.keyboardCursor).toBeNull()

    game.state.phase = GamePhase.BUILD
    game.eventBus.emit(Events.PHASE_CHANGED, { from: GamePhase.WAVE, to: GamePhase.BUILD })
    // Sticky opt-in: BUILD re-entry auto-restores the cursor for the
    // keyboard player without forcing them to re-tap an arrow.
    expect(game.hud.keyboardCursor).toEqual({ gx: 0, gy: 0 })

    wrapper.unmount()
  })

  it('pure-mouse player (no arrow keydown) never sees the cursor across BUILD↔WAVE cycles', () => {
    const game = makeGameStub()
    const wrapper = mountComposable(ref<GameLike | null>(game))
    expect(game.hud.keyboardCursor).toBeNull()

    game.state.phase = GamePhase.WAVE
    game.eventBus.emit(Events.PHASE_CHANGED, { from: GamePhase.BUILD, to: GamePhase.WAVE })
    expect(game.hud.keyboardCursor).toBeNull()

    game.state.phase = GamePhase.BUILD
    game.eventBus.emit(Events.PHASE_CHANGED, { from: GamePhase.WAVE, to: GamePhase.BUILD })
    // Opt-in never flipped → cursor stays hidden on BUILD re-entry.
    expect(game.hud.keyboardCursor).toBeNull()

    wrapper.unmount()
  })

  it('LEVEL_START resets the cursor; auto-restores only after opt-in', () => {
    const game = makeGameStub()
    const wrapper = mountComposable(ref<GameLike | null>(game))

    // Before opt-in, LEVEL_START leaves the cursor null.
    game.eventBus.emit(Events.LEVEL_START, 1)
    expect(game.hud.keyboardCursor).toBeNull()

    // After opt-in, LEVEL_START re-seeds the cursor at the first legal cell.
    dispatchKey('ArrowRight')
    game.eventBus.emit(Events.LEVEL_START, 2)
    expect(game.hud.keyboardCursor).toEqual({ gx: 0, gy: 0 })

    wrapper.unmount()
  })

  it('lets Enter pass through to focused buttons (Start Wave keyboard path)', () => {
    const game = makeGameStub()
    const handler = vi.fn()
    game.eventBus.on(Events.CANVAS_CLICK, handler)
    const wrapper = mountComposable(ref<GameLike | null>(game))

    const button = document.createElement('button')
    document.body.appendChild(button)
    try {
      const evt = new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true })
      button.dispatchEvent(evt)
      expect(handler).not.toHaveBeenCalled()
      expect(evt.defaultPrevented).toBe(false)
    } finally {
      document.body.removeChild(button)
      wrapper.unmount()
    }
  })

  it('ignores keydown when phase is not BUILD', () => {
    const game = makeGameStub(GamePhase.WAVE)
    const handler = vi.fn()
    game.eventBus.on(Events.CANVAS_CLICK, handler)
    const wrapper = mountComposable(ref<GameLike | null>(game))

    expect(game.hud.keyboardCursor).toBeNull()
    dispatchKey('ArrowRight')
    dispatchKey('Enter')
    expect(game.hud.keyboardCursor).toBeNull()
    expect(handler).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('useKeyboardPlacement — concealed placement (paths hidden)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useGameStore().level = 5
    vi.mocked(computeLegalPositions).mockClear()
  })

  function makeGeneratedStub(pathsVisible: boolean): GameLike {
    const game = makeGameStub()
    game.state.pathsVisible = pathsVisible
    game.levelContext = {
      isGenerated: true,
      paths: [],
      decoyCells: [[1, 1]],
      path: {},
    } as unknown as GameLike['levelContext']
    return game
  }

  it('requests the full lattice for cursor movement while paths are hidden', () => {
    const game = makeGeneratedStub(false)
    const wrapper = mountComposable(ref<GameLike | null>(game))
    // No paths and no decoys passed: nothing is excluded, so arrow keys can
    // visit every lattice point and the cursor's reachable set leaks nothing.
    expect(vi.mocked(computeLegalPositions)).toHaveBeenLastCalledWith({ paths: [] })
    wrapper.unmount()
  })

  it('restricts the cursor to legal positions when paths are visible', () => {
    const game = makeGeneratedStub(true)
    const ctx = game.levelContext as unknown as {
      paths: unknown
      decoyCells: unknown
    }
    const wrapper = mountComposable(ref<GameLike | null>(game))
    expect(vi.mocked(computeLegalPositions)).toHaveBeenLastCalledWith({
      paths: ctx.paths,
      decoyCells: ctx.decoyCells,
    })
    wrapper.unmount()
  })
})
