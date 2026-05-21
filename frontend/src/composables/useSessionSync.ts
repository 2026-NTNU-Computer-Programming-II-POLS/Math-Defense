import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { achievementService } from '@/services/achievementService'
import { ApiError } from '@/services/api'
import {
  cleanupOrphanSession,
  createSessionWithRetry,
  pushWaveSnapshot,
  endSession as endSessionRequest,
  abandonSession as abandonSessionRequest,
} from '@/services/sessionLifecycleService'
import { Events, GamePhase } from '@/data/constants'
import type { Game, WaveEndSnapshot } from '@/engine/Game'
import { isUsingWasm } from '@/math/WasmBridge'

const UPDATE_FAIL_ALERT_THRESHOLD = 3

// Backlog §23 — ChallengeView.vue writes the active challenge id here before
// navigating to /level-select; this composable reads it on session creation
// and clears it after a successful create. Kept in sessionStorage rather than
// a Pinia store so a hard reload mid-flow drops the binding cleanly.
const CHALLENGE_ID_STORAGE_KEY = 'mg_active_challenge_id'

function readActiveChallengeId(): string | null {
  try {
    return sessionStorage.getItem(CHALLENGE_ID_STORAGE_KEY)
  } catch {
    return null
  }
}

function clearActiveChallengeId(): void {
  try {
    sessionStorage.removeItem(CHALLENGE_ID_STORAGE_KEY)
  } catch {
    // sessionStorage may be unavailable in private mode; non-critical.
  }
}

export interface UnlockedAchievement {
  id: string
  talent_points: number
}

/**
 * Vue glue around `sessionLifecycleService` (audit F-ARCH-8). Holds the
 * reactive session state, subscribes to engine events, and surfaces UI
 * concerns (modals on persistent sync failure, achievement-cache
 * invalidation, sessionStorage challenge binding). All API traffic goes
 * through the service.
 */
export function useSessionSync() {
  const authStore = useAuthStore()
  const uiStore = useUiStore()
  const sessionId = ref<string | null>(null)
  const lastCompletedSessionId = ref<string | null>(null)
  const syncing = ref(false)
  const newlyUnlockedAchievements = ref<UnlockedAchievement[]>([])
  // Backlog §20 — mirrors the server-confirmed practice_mode flag on the
  // active session. GameView reads this to render the practice badge during
  // WAVE/BUILD; ScoreResultView reads it to show the leaderboard-ineligible
  // notice on the run summary.
  const isPracticeMode = ref(false)
  // Backlog §23 — non-null when the run was launched from a challenge deep-
  // link. ScoreResultView reads this to surface a "View challenge ranking"
  // CTA instead of the global leaderboard link.
  const activeChallengeId = ref<string | null>(null)
  let pendingLevel: number | null = null
  let createGeneration = 0
  let sessionGeneration = 0
  let consecutiveUpdateFailures = 0
  let alertedForFailures = false
  let lastSyncedWave = -1
  let isEnding = false

  type PendingWrite = { snapshot: WaveEndSnapshot; gen: number }
  const pending = ref<PendingWrite | null>(null)

  async function createSession(_levelNum: number, gen: number, game: Game): Promise<string | null> {
    const challengeId = readActiveChallengeId()
    // construction plan §3.8 — tag the session with replay protocol version 2
    // only when the WASM determinism module is loaded *and* in use.
    // Otherwise the session keeps the default v1 acceptance budget,
    // which is what the JS-fallback bit stream actually delivers.
    const replayVersion = isUsingWasm() ? 2 : 1
    const session = await createSessionWithRetry(
      {
        starRating: game.state.starRating,
        initialAnswer: game.state.initialAnswer === 1,
        practiceMode: uiStore.sliderFallbackEnabled,
        challengeId,
        // Backlog §24 — persist the seed so a Replay can reconstruct the
        // exact same RNG stream when re-driving the engine against the
        // recorded event log.
        seed: game.seed,
        replayVersion,
      },
      () => gen === createGeneration,
    )
    if (!session || gen !== createGeneration) return null
    // Reflect the server-confirmed flag (server is authoritative — it
    // could in principle reject practice_mode for a tournament account).
    isPracticeMode.value = !!session.practice_mode
    activeChallengeId.value = session.challenge_id ?? null
    // Single-shot: a successful create consumes the stored challenge_id so
    // the next freshly-launched run isn't accidentally tagged.
    clearActiveChallengeId()
    return session.id
  }

  function bind(game: Game): (() => void)[] {
    const unsubs: (() => void)[] = []

    if (authStore.isLoggedIn) {
      cleanupOrphanSession()
    }

    // LEVEL_START → create session
    unsubs.push(game.eventBus.on(Events.LEVEL_START, async (levelNum) => {
      if (!authStore.isLoggedIn) return
      sessionId.value = null
      isPracticeMode.value = false
      pendingLevel = levelNum as number
      const gen = ++createGeneration
      const id = await createSession(pendingLevel, gen, game)
      if (gen !== createGeneration) return
      sessionId.value = id
      sessionGeneration = gen
      lastSyncedWave = -1
    }))

    // WAVE_END → update session with V2 payload
    pending.value = null
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
          if (job.gen !== sessionGeneration) continue
          if (job.snapshot.wave === lastSyncedWave) continue
          await pushWaveSnapshot(sessionId.value, job.snapshot)
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
      await endRun(game)
    }))

    // GAME_OVER → end session
    unsubs.push(game.eventBus.on(Events.PHASE_CHANGED, async ({ to }) => {
      if (to === GamePhase.GAME_OVER) {
        await endRun(game)
      }
    }))

    unsubs.push(() => { pendingLevel = null })

    return unsubs
  }

  async function endRun(game: Game): Promise<void> {
    if (!authStore.isLoggedIn) return

    // Concurrency guard: LEVEL_END and PHASE_CHANGED→GAME_OVER can both fire
    // for a single run (and a rapid retry can re-trigger an end event). Since
    // endRun awaits the drain loop below before it reads sessionId, two
    // overlapping calls would each see a non-null sessionId and POST
    // /sessions/:id/end twice. Bail out if an end is already in flight; the
    // in-flight call owns the terminal payload.
    if (isEnding) return
    isEnding = true
    try {
      // F-BUG-20: a WAVE_END flush may still be in flight (or queued in
      // `pending`) when LEVEL_END / GAME_OVER fires. If we POST /end before
      // those updates land, the server's snapshot is stale and the final
      // score+leaderboard row are computed against pre-final-wave state.
      // Wait for the in-flight WAVE_END loop to drain (and any newly enqueued
      // job to flush) before sending the terminal payload. Bounded so a wedged
      // request (server hang past the 10s fetch timeout) can't permanently
      // block the score-submission path; better to send a slightly-stale
      // wave snapshot than never end the session at all.
      const drainDeadline = Date.now() + 12_000
      while ((syncing.value || pending.value) && Date.now() < drainDeadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, 25))
      }

      if (!sessionId.value && pendingLevel != null) {
        const gen = ++createGeneration
        sessionId.value = await createSession(pendingLevel, gen, game)
      }

      if (!sessionId.value) return
      const id = sessionId.value
      try {
        const result = await endSessionRequest(id, game.state)
        if (result.newly_unlocked_achievements?.length) {
          newlyUnlockedAchievements.value = result.newly_unlocked_achievements
          // Drop the cached unlocked-id set so panels (e.g. MagicModePanel's
          // curve-family gate) see freshly-unlocked achievements on next read.
          achievementService.invalidateUnlockedIds()
        }
        lastCompletedSessionId.value = id
        sessionId.value = null
        pendingLevel = null
      } catch (e) {
        console.warn('[SessionSync] Failed to end session (will retry on next end event):', e)
      }
    } finally {
      isEnding = false
    }
  }

  async function abandonRun(): Promise<void> {
    createGeneration++
    sessionGeneration++
    pending.value = null
    pendingLevel = null
    consecutiveUpdateFailures = 0
    alertedForFailures = false
    lastSyncedWave = -1

    const id = sessionId.value
    sessionId.value = null
    isPracticeMode.value = false
    activeChallengeId.value = null

    if (!id) return
    try {
      await abandonSessionRequest(id)
    } catch (e) {
      console.warn('[SessionSync] Failed to abandon session:', e)
    }
  }

  return {
    sessionId,
    lastCompletedSessionId,
    newlyUnlockedAchievements,
    isPracticeMode,
    activeChallengeId,
    bind,
    abandonRun,
  }
}

export { CHALLENGE_ID_STORAGE_KEY }
