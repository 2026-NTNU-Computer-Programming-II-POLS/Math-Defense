/**
 * useFirstEncounterCards — V3 Phase 6 §6.2 first-encounter telegraph.
 *
 * The first time each counter-enemy type is ever spawned, this queues a
 * one-time explanatory card and soft-pauses the simulation until it is
 * dismissed. "First time ever" is persisted via `uiStore.seenCounterEnemies`.
 *
 * Soft-pause reuses the existing pause mechanism (`Game.stop` / `Game.start`)
 * rather than introducing a new `GamePhase` — a first-encounter card is a
 * presentation concern, so `PhaseStateMachine` stays untouched.
 *
 * The owning view renders <FirstEncounterCard :type="activeCard"> and wires
 * its `dismiss` event back to {@link dismiss}.
 */
import { ref, computed, watch, onUnmounted, type Ref } from 'vue'
import { Events } from '@/data/constants'
import type { EnemyType } from '@/data/constants'
import { isCounterEnemy } from '@/data/counter-enemy-info'
import { useUiStore } from '@/stores/uiStore'
import type { EventBus } from '@/engine/EventBus'
import type { GameEvents } from '@/engine/Game'
import type { Enemy } from '@/entities/types'

/** The slice of `Game` this composable needs — kept minimal for testability. */
export interface FirstEncounterGameLike {
  readonly eventBus: Pick<EventBus<GameEvents>, 'on'>
  start(): void
  stop(): void
}

export function useFirstEncounterCards(gameRef: Ref<FirstEncounterGameLike | null>) {
  const uiStore = useUiStore()

  // Types waiting to be shown. The head is the card currently on screen; if
  // several counter-enemy types first appear in one wave they queue here and
  // are shown one at a time rather than stacking modals.
  const queue = ref<EnemyType[]>([])
  const activeCard = computed<EnemyType | null>(() => queue.value[0] ?? null)

  let off: (() => void) | null = null

  function onSpawn(enemy: Enemy): void {
    const type = enemy.type
    if (!isCounterEnemy(type)) return
    if (uiStore.hasSeenCounterEnemy(type)) return
    // A type stays "unseen" until its card is dismissed, so guard against the
    // same type queueing twice when several spawn in the same wave.
    if (queue.value.includes(type)) return
    const wasEmpty = queue.value.length === 0
    queue.value = [...queue.value, type]
    // Soft-pause on the first queued card only; later cards just extend the
    // queue while the game is already stopped.
    if (wasEmpty) gameRef.value?.stop()
  }

  function dismiss(): void {
    const type = queue.value[0]
    if (type === undefined) return
    uiStore.markCounterEnemySeen(type)
    queue.value = queue.value.slice(1)
    // Resume only once the whole queue is drained.
    if (queue.value.length === 0) gameRef.value?.start()
  }

  function subscribe(game: FirstEncounterGameLike | null): void {
    off?.()
    off = game ? game.eventBus.on(Events.ENEMY_SPAWNED, onSpawn) : null
  }

  watch(gameRef, (game) => { subscribe(game) }, { immediate: true })

  onUnmounted(() => {
    off?.()
    off = null
  })

  return { activeCard, dismiss }
}
