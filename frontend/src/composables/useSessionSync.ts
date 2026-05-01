import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { sessionService } from '@/services/sessionService'
import { ApiError } from '@/services/api'
import { Events, GamePhase } from '@/data/constants'
import type { Game, WaveEndSnapshot } from '@/engine/Game'
import { calculateScore } from '@/domain/scoring/score-calculator'

const MAX_CREATE_RETRIES = 2
const RETRY_DELAY_MS = 1000
const UPDATE_FAIL_ALERT_THRESHOLD = 3

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface UnlockedAchievement {
  id: string
  talent_points: number
}

export function useSessionSync() {
  const authStore = useAuthStore()
  const uiStore = useUiStore()
  const sessionId = ref<string | null>(null)
  const lastCompletedSessionId = ref<string | null>(null)
  const syncing = ref(false)
  const newlyUnlockedAchievements = ref<UnlockedAchievement[]>([])
  let pendingLevel: number | null = null
  let createGeneration = 0
  let sessionGeneration = 0
  let consecutiveUpdateFailures = 0
  let alertedForFailures = false
  let lastSyncedWave = -1

  async function createSessionWithRetry(_levelNum: number, gen: number, game: Game): Promise<string | null> {
    for (let attempt = 0; attempt <= MAX_CREATE_RETRIES; attempt++) {
      if (gen !== createGeneration) return null
      try {
        const session = await sessionService.create(
          game.state.starRating,
          undefined,
          game.state.initialAnswer === 1,
        )
        if (gen !== createGeneration) {
          sessionService.abandon(session.id).catch((err) =>
            console.warn('[SessionSync] Failed to abandon late-arrival session:', err),
          )
          return null
        }
        return session.id
      } catch (e) {
        console.warn(`[SessionSync] Create attempt ${attempt + 1} failed:`, e)
        if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 422)) {
          return null
        }
        if (attempt < MAX_CREATE_RETRIES) {
          await wait(RETRY_DELAY_MS)
        }
      }
    }
    return null
  }

  async function cleanupOrphanSession(): Promise<void> {
    if (!authStore.isLoggedIn) return
    try {
      const active = await sessionService.getActive()
      if (!active) return
      await sessionService.abandon(active.id)
    } catch (e) {
      console.warn('[SessionSync] Failed to clean up orphan session:', e)
    }
  }

  function bind(game: Game): (() => void)[] {
    const unsubs: (() => void)[] = []

    cleanupOrphanSession()

    // LEVEL_START → create session
    unsubs.push(game.eventBus.on(Events.LEVEL_START, async (levelNum) => {
      if (!authStore.isLoggedIn) return
      sessionId.value = null
      pendingLevel = levelNum as number
      const gen = ++createGeneration
      const id = await createSessionWithRetry(pendingLevel, gen, game)
      if (gen !== createGeneration) return
      sessionId.value = id
      sessionGeneration = gen
      lastSyncedWave = -1
    }))

    // WAVE_END → update session with V2 payload
    type PendingWrite = { snapshot: WaveEndSnapshot; gen: number }
    const pending = ref<PendingWrite | null>(null)
    unsubs.push(game.eventBus.on(Events.WAVE_END, async (snapshot) => {
      if (!sessionId.value) return
      pending.value = { snapshot, gen: sessionGeneration }
      if (syncing.value) return
      syncing.value = true
      try {
        while (pending.value) {
          const job = pending.value
          pending.value = null
          if (!sessionId.value) break
          if (job.gen !== sessionGeneration) break
          if (job.snapshot.wave === lastSyncedWave) continue
          await sessionService.update(sessionId.value, {
            current_wave: job.snapshot.wave,
            gold: job.snapshot.gold,
            hp: job.snapshot.hp,
            score: job.snapshot.score,
            kill_value: job.snapshot.killValue,
            cost_total: job.snapshot.costTotal,
          })
          lastSyncedWave = job.snapshot.wave
          consecutiveUpdateFailures = 0
          alertedForFailures = false
        }
      } catch (e) {
        console.warn('[SessionSync] Failed to update session:', e)
        if (e instanceof ApiError && e.status === 401) {
          sessionId.value = null
          consecutiveUpdateFailures = 0
          alertedForFailures = false
          return
        }
        consecutiveUpdateFailures++
        if (
          !alertedForFailures &&
          consecutiveUpdateFailures >= UPDATE_FAIL_ALERT_THRESHOLD &&
          authStore.isLoggedIn
        ) {
          alertedForFailures = true
          uiStore.showModal(
            'Sync Failed',
            'Your progress could not be saved to the server. The leaderboard may not reflect your final score.',
            undefined,
            { sticky: true },
          )
        }
      } finally {
        syncing.value = false
        pending.value = null
      }
    }))

    // LEVEL_END → end session with V2 scoring payload
    unsubs.push(game.eventBus.on(Events.LEVEL_END, async () => {
      await endSession(game)
    }))

    // GAME_OVER → end session
    unsubs.push(game.eventBus.on(Events.PHASE_CHANGED, async ({ to }) => {
      if (to === GamePhase.GAME_OVER) {
        await endSession(game)
      }
    }))

    unsubs.push(() => { pendingLevel = null })

    return unsubs
  }

  async function endSession(game: Game): Promise<void> {
    if (!authStore.isLoggedIn) return

    if (!sessionId.value && pendingLevel != null) {
      const gen = ++createGeneration
      sessionId.value = await createSessionWithRetry(pendingLevel, gen, game)
    }

    if (!sessionId.value) return
    const id = sessionId.value
    const s = game.state
    try {
      const { totalScore } = calculateScore({
        killValue: s.cumulativeKillValue,
        timeTotal: s.timeTotal,
        timeExcludePrepare: s.timeExcludePrepare,
        costTotal: s.costTotal,
        healthOrigin: s.healthOrigin,
        healthFinal: s.hp,
        initialAnswer: s.initialAnswer,
      })
      const result = await sessionService.end(id, {
        score: s.score,
        kills: s.kills,
        waves_survived: s.wave,
        kill_value: s.cumulativeKillValue,
        cost_total: s.costTotal,
        time_total: s.timeTotal,
        health_origin: s.healthOrigin,
        health_final: s.hp,
        time_exclude_prepare: s.timeExcludePrepare,
        n_prep_phases: s.timeExcludePrepare.length,
        total_score: totalScore,
      })
      if (result.newly_unlocked_achievements?.length) {
        newlyUnlockedAchievements.value = result.newly_unlocked_achievements
      }
      lastCompletedSessionId.value = id
      sessionId.value = null
      pendingLevel = null
    } catch (e) {
      console.warn('[SessionSync] Failed to end session (will retry on next end event):', e)
    }
  }

  return { sessionId, lastCompletedSessionId, newlyUnlockedAchievements, bind }
}
