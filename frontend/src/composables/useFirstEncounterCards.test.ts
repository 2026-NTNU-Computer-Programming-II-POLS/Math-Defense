/**
 * Component tests for useFirstEncounterCards (V3 Phase 6 §6.2).
 *
 * Verifies the trigger fires once per never-before-seen counter-enemy type,
 * soft-pauses via Game.stop, ignores non-counter-enemies and already-seen
 * types, queues multiple types one at a time, and resumes via Game.start only
 * once the whole queue is drained.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, nextTick, type Ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { EventBus } from '@/engine/EventBus'
import type { GameEvents } from '@/engine/Game'
import { Events, EnemyType } from '@/data/constants'
import type { Enemy } from '@/entities/types'
import { useFirstEncounterCards, type FirstEncounterGameLike } from './useFirstEncounterCards'
import { useUiStore } from '@/stores/uiStore'

function makeFakeGame() {
  return {
    eventBus: new EventBus<GameEvents>(),
    start: vi.fn<() => void>(),
    stop: vi.fn<() => void>(),
  }
}

let _enemyId = 0
function spawn(type: EnemyType): Enemy {
  return { id: `e_${++_enemyId}`, type } as Enemy
}

function mountComposable(gameRef: Ref<FirstEncounterGameLike | null>) {
  let api!: ReturnType<typeof useFirstEncounterCards>
  const Wrapper = defineComponent({
    setup() {
      api = useFirstEncounterCards(gameRef)
      return () => h('div')
    },
  })
  const wrapper = mount(Wrapper)
  return { wrapper, api }
}

describe('useFirstEncounterCards (V3 Phase 6 §6.2)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(createPinia())
  })

  it('opens a card and soft-pauses on the first sighting of an unseen counter-enemy', () => {
    const game = makeFakeGame()
    const { wrapper, api } = mountComposable(ref(game))

    game.eventBus.emit(Events.ENEMY_SPAWNED, spawn(EnemyType.BULWARK))

    expect(api.activeCard.value).toBe(EnemyType.BULWARK)
    expect(game.stop).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('ignores spawns that are not counter-enemies', () => {
    const game = makeFakeGame()
    const { wrapper, api } = mountComposable(ref(game))

    game.eventBus.emit(Events.ENEMY_SPAWNED, spawn(EnemyType.GENERAL))

    expect(api.activeCard.value).toBeNull()
    expect(game.stop).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not re-open for a type already marked seen', () => {
    useUiStore().markCounterEnemySeen(EnemyType.SWARMLING)
    const game = makeFakeGame()
    const { wrapper, api } = mountComposable(ref(game))

    game.eventBus.emit(Events.ENEMY_SPAWNED, spawn(EnemyType.SWARMLING))

    expect(api.activeCard.value).toBeNull()
    expect(game.stop).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not queue the same type twice when it spawns repeatedly in one wave', () => {
    const game = makeFakeGame()
    const { wrapper, api } = mountComposable(ref(game))

    game.eventBus.emit(Events.ENEMY_SPAWNED, spawn(EnemyType.SWARMLING))
    game.eventBus.emit(Events.ENEMY_SPAWNED, spawn(EnemyType.SWARMLING))

    expect(api.activeCard.value).toBe(EnemyType.SWARMLING)
    expect(game.stop).toHaveBeenCalledTimes(1)
    api.dismiss()
    expect(api.activeCard.value).toBeNull()
    wrapper.unmount()
  })

  it('dismiss marks the type seen, clears the card, and resumes the game', () => {
    const game = makeFakeGame()
    const { wrapper, api } = mountComposable(ref(game))

    game.eventBus.emit(Events.ENEMY_SPAWNED, spawn(EnemyType.REGENERATOR))
    api.dismiss()

    expect(api.activeCard.value).toBeNull()
    expect(useUiStore().hasSeenCounterEnemy(EnemyType.REGENERATOR)).toBe(true)
    expect(game.start).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('queues two unseen types from one wave and shows them sequentially, not stacked', () => {
    const game = makeFakeGame()
    const { wrapper, api } = mountComposable(ref(game))

    game.eventBus.emit(Events.ENEMY_SPAWNED, spawn(EnemyType.BULWARK))
    game.eventBus.emit(Events.ENEMY_SPAWNED, spawn(EnemyType.REGENERATOR))

    // Only the first card shows; the game is soft-paused exactly once.
    expect(api.activeCard.value).toBe(EnemyType.BULWARK)
    expect(game.stop).toHaveBeenCalledTimes(1)

    api.dismiss()
    // Second card now showing; the game stays paused (not resumed yet).
    expect(api.activeCard.value).toBe(EnemyType.REGENERATOR)
    expect(game.start).not.toHaveBeenCalled()

    api.dismiss()
    // Queue drained — now the game resumes.
    expect(api.activeCard.value).toBeNull()
    expect(game.start).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('subscribes once the game ref becomes available', async () => {
    const gameRef = ref<FirstEncounterGameLike | null>(null)
    const { wrapper, api } = mountComposable(gameRef)

    const game = makeFakeGame()
    gameRef.value = game
    await nextTick() // let the gameRef watcher resubscribe
    game.eventBus.emit(Events.ENEMY_SPAWNED, spawn(EnemyType.BULWARK))

    expect(api.activeCard.value).toBe(EnemyType.BULWARK)
    wrapper.unmount()
  })
})
