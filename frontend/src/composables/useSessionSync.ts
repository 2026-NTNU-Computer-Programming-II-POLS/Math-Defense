/**
 * useSessionSync — 前後端 Session 生命週期同步
 * 監聽引擎事件，自動管理 session create / update / end + leaderboard submit。
 * 僅在使用者已登入時啟動，未登入時靜默跳過。
 */
import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { sessionService } from '@/services/sessionService'
import { Events, GamePhase } from '@/data/constants'
import type { Game } from '@/engine/Game'

const MAX_CREATE_RETRIES = 2
const RETRY_DELAY_MS = 1000

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function useSessionSync() {
  const authStore = useAuthStore()
  const sessionId = ref<string | null>(null)
  const syncing = ref(false)
  let pendingLevel: number | null = null

  async function createSessionWithRetry(levelNum: number): Promise<string | null> {
    for (let attempt = 0; attempt <= MAX_CREATE_RETRIES; attempt++) {
      try {
        const session = await sessionService.create(levelNum)
        return session.id
      } catch (e) {
        console.warn(`[SessionSync] Create attempt ${attempt + 1} failed:`, e)
        if (attempt < MAX_CREATE_RETRIES) {
          await wait(RETRY_DELAY_MS)
        }
      }
    }
    return null
  }

  function bind(game: Game): (() => void)[] {
    const unsubs: (() => void)[] = []

    // LEVEL_START → create session
    unsubs.push(game.eventBus.on(Events.LEVEL_START, async (levelNum) => {
      if (!authStore.isLoggedIn) return
      sessionId.value = null
      pendingLevel = levelNum as number
      sessionId.value = await createSessionWithRetry(pendingLevel)
    }))

    // WAVE_END → update session with current state (queued to avoid dropping rapid events)
    let pendingSync = false
    unsubs.push(game.eventBus.on(Events.WAVE_END, async () => {
      if (!sessionId.value) return
      if (syncing.value) {
        pendingSync = true
        return
      }
      syncing.value = true
      try {
        do {
          pendingSync = false
          if (!sessionId.value) break
          await sessionService.update(sessionId.value, {
            current_wave: game.state.wave,
            gold: game.state.gold,
            hp: game.state.hp,
            score: game.state.score,
          })
        } while (pendingSync)
      } catch (e) {
        console.warn('[SessionSync] Failed to update session:', e)
      } finally {
        syncing.value = false
        pendingSync = false
      }
    }))

    // LEVEL_END → end session (victory)
    unsubs.push(game.eventBus.on(Events.LEVEL_END, async () => {
      await endSession(game)
    }))

    // GAME_OVER → end session (defeat)
    unsubs.push(game.eventBus.on(Events.PHASE_CHANGED, async ({ to }) => {
      if (to === GamePhase.GAME_OVER) {
        await endSession(game)
      }
    }))

    return unsubs
  }

  async function endSession(game: Game): Promise<void> {
    if (!authStore.isLoggedIn) return

    // Late creation: if session was never created (network was down at start),
    // try once more before giving up
    if (!sessionId.value && pendingLevel != null) {
      sessionId.value = await createSessionWithRetry(pendingLevel)
    }

    if (!sessionId.value) return
    const id = sessionId.value
    sessionId.value = null
    pendingLevel = null
    try {
      await sessionService.end(id, {
        score: game.state.score,
        kills: game.state.kills,
        waves_survived: game.state.wave,
      })
    } catch (e) {
      console.warn('[SessionSync] Failed to end session:', e)
    }
  }

  return { sessionId, bind }
}
