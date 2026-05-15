/**
 * Component tests for GameView.vue — first-encounter keydown guard.
 *
 * GameView's window `keydown` handler toggles the manual pause on Space / Esc.
 * The V3 Phase 6 first-encounter card soft-pauses the game through its own
 * Game.stop/start owner (useFirstEncounterCards). These tests pin the guard
 * that defers to the card: while a card is showing, Space / Esc must NOT drive
 * the manual pause, otherwise the two pause owners desync (game resuming behind
 * a stale pause overlay, or the card's pause lifted out from under it).
 *
 * useGameLoop / useKeyboardPlacement / useFirstEncounterCards / vue-router are
 * mocked so the view mounts without booting the engine; `ready: false` keeps
 * the heavy overlay subtree (and all its child components) out of the render.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { GamePhase, EnemyType } from '@/data/constants'
import { useGameStore } from '@/stores/gameStore'

// Mutable holders shared with the mock factories below. `game` and `card` are
// plain `.value` boxes (not refs) — GameView only reads `game.value` /
// `firstEncounterCard.value` in JS, never bare in the rendered template.
const mocks = vi.hoisted(() => ({
  game: { value: null as { start: () => void; stop: () => void } | null },
  card: { value: null as EnemyType | null },
}))

// authStore (pulled in transitively by GameView) imports the real router,
// which calls createRouter/createWebHistory — so keep the rest of vue-router
// intact and only override the two composables GameView uses directly.
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn() }),
    onBeforeRouteLeave: vi.fn(),
  }
})

vi.mock('@/composables/useGameLoop', () => ({
  useGameLoop: () => ({
    game: mocks.game,
    ready: false,
    loadError: null,
    retry: vi.fn(),
    newlyUnlockedAchievements: [],
    lastCompletedSessionId: null,
    currentPrincipleId: null,
    clearPrinciple: vi.fn(),
    restoreFromCheckpoint: vi.fn(),
    isPracticeMode: false,
    abandonRun: vi.fn(),
  }),
}))

vi.mock('@/composables/useKeyboardPlacement', () => ({
  useKeyboardPlacement: vi.fn(),
}))

vi.mock('@/composables/useFirstEncounterCards', () => ({
  useFirstEncounterCards: () => ({
    activeCard: mocks.card,
    dismiss: vi.fn(),
  }),
}))

import GameView from './GameView.vue'

function makeFakeGame() {
  return { start: vi.fn<() => void>(), stop: vi.fn<() => void>() }
}

function dispatchKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true }))
}

describe('GameView.vue — first-encounter keydown guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    window.history.replaceState({}, '')
    mocks.game.value = makeFakeGame()
    mocks.card.value = null
    // GameView's onMounted constructs a ResizeObserver; provide a no-op if the
    // test DOM doesn't supply one.
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver
    }
    // togglePause only acts during the WAVE phase — which is also the only
    // phase a first-encounter card can appear in.
    useGameStore().phase = GamePhase.WAVE
  })

  it('Space toggles the manual pause when no first-encounter card is showing', () => {
    const wrapper = mount(GameView)
    dispatchKey('Space')
    expect(mocks.game.value!.stop).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('Escape toggles the manual pause when no first-encounter card is showing', () => {
    const wrapper = mount(GameView)
    dispatchKey('Escape')
    expect(mocks.game.value!.stop).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('Space does not toggle the manual pause while a first-encounter card is showing', () => {
    mocks.card.value = EnemyType.BULWARK
    const wrapper = mount(GameView)
    dispatchKey('Space')
    expect(mocks.game.value!.stop).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('Escape does not toggle the manual pause while a first-encounter card is showing', () => {
    mocks.card.value = EnemyType.BULWARK
    const wrapper = mount(GameView)
    dispatchKey('Escape')
    expect(mocks.game.value!.stop).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('re-enables the manual pause once the card is dismissed (guard is dynamic, not mount-time)', () => {
    mocks.card.value = EnemyType.BULWARK
    const wrapper = mount(GameView)

    dispatchKey('Space')
    expect(mocks.game.value!.stop).not.toHaveBeenCalled()

    // Card dismissed — the guard reads the holder live, so Space works again.
    mocks.card.value = null
    dispatchKey('Space')
    expect(mocks.game.value!.stop).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })
})
