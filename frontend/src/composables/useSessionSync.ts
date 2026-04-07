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

export function useSessionSync() {
  const authStore = useAuthStore()
  const sessionId = ref<string | null>(null)
  const syncing = ref(false)

  function bind(game: Game): (() => void)[] {
    const unsubs: (() => void)[] = []

    // LEVEL_START → create session
    unsubs.push(game.eventBus.on(Events.LEVEL_START, async (levelNum) => {
      if (!authStore.isLoggedIn) return
      sessionId.value = null
      try {
        const session = await sessionService.create(levelNum as number)
        sessionId.value = session.id
      } catch (e) {
        console.warn('[SessionSync] Failed to create session:', e)
      }
    }))

    // WAVE_END → update session with current state
    unsubs.push(game.eventBus.on(Events.WAVE_END, async () => {
      if (!sessionId.value || syncing.value) return
      syncing.value = true
      try {
        await sessionService.update(sessionId.value, {
          current_wave: game.state.wave,
          gold: game.state.gold,
          hp: game.state.hp,
          score: game.state.score,
        })
      } catch (e) {
        console.warn('[SessionSync] Failed to update session:', e)
      } finally {
        syncing.value = false
      }
    }))

    // LEVEL_END → end session (victory)
    // WaveSystem emits LEVEL_END directly before phase transition
    unsubs.push(game.eventBus.on(Events.LEVEL_END, async () => {
      await endSession(game)
    }))

    // GAME_OVER → end session (defeat)
    // Engine never emits GAME_OVER directly; it transitions via setPhase()
    // which only emits PHASE_CHANGED. Listen for that instead.
    unsubs.push(game.eventBus.on(Events.PHASE_CHANGED, async ({ to }) => {
      if (to === GamePhase.GAME_OVER) {
        await endSession(game)
      }
    }))

    return unsubs
  }

  async function endSession(game: Game): Promise<void> {
    if (!sessionId.value) return
    const id = sessionId.value
    sessionId.value = null
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
