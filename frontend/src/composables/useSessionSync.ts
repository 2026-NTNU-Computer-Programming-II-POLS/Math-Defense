/**
 * useSessionSync — frontend/backend session lifecycle synchronization
 * Listens to engine events to automatically manage session create / update / end + leaderboard submit.
 * Only active when the user is logged in; silently skips when not.
 */
import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { sessionService } from '@/services/sessionService'
import { ApiError } from '@/services/api'
import { Events, GamePhase } from '@/data/constants'
import type { Game } from '@/engine/Game'

const MAX_CREATE_RETRIES = 2
const RETRY_DELAY_MS = 1000
// Surface a modal to the user after this many consecutive WAVE_END sync failures.
// Single blips are expected on flaky networks — only alert when divergence is real.
const UPDATE_FAIL_ALERT_THRESHOLD = 3

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function useSessionSync() {
  const authStore = useAuthStore()
  const uiStore = useUiStore()
  const sessionId = ref<string | null>(null)
  const syncing = ref(false)
  let pendingLevel: number | null = null
  let createGeneration = 0  // guards against rapid level-switch race condition
  let consecutiveUpdateFailures = 0
  let alertedForFailures = false

  async function createSessionWithRetry(levelNum: number, gen: number): Promise<string | null> {
    for (let attempt = 0; attempt <= MAX_CREATE_RETRIES; attempt++) {
      if (gen !== createGeneration) return null  // stale request — abort
      try {
        const session = await sessionService.create(levelNum)
        // Late arrival: a newer LEVEL_START fired while we were awaiting.
        // The session we just created is still ACTIVE server-side and would
        // linger for 2h until the stale sweep — abandon it now so the next
        // create doesn't collide with the one-active-per-user index and so
        // we don't leak resources. Fire-and-forget; a failing abandon will
        // be cleaned up by cleanupOrphanSession on next mount.
        if (gen !== createGeneration) {
          sessionService.abandon(session.id).catch((err) =>
            console.warn('[SessionSync] Failed to abandon late-arrival session:', err),
          )
          return null
        }
        return session.id
      } catch (e) {
        console.warn(`[SessionSync] Create attempt ${attempt + 1} failed:`, e)
        // Auth failures are not recoverable without a refresh endpoint (which
        // the backend does not expose). The 401 interceptor in api.ts has
        // already cleared auth and navigated away; looping would just re-send
        // a token we know is stale. Same for 403 / 422 — server-side schema or
        // authorization mismatches won't resolve on retry.
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
    // On mount, abandon any active session the server still holds for this
    // user. This covers the rapid-LEVEL_START race where the first create
    // succeeded server-side but its id was dropped client-side: the session
    // would otherwise linger until the 2-hour stale sweep. Abandoning on
    // mount ensures a clean slate for the new game.
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

    // Fire-and-forget cleanup of any lingering active session
    cleanupOrphanSession()

    // LEVEL_START → create session
    unsubs.push(game.eventBus.on(Events.LEVEL_START, async (levelNum) => {
      if (!authStore.isLoggedIn) return
      sessionId.value = null
      pendingLevel = levelNum as number
      const gen = ++createGeneration
      const id = await createSessionWithRetry(pendingLevel, gen)
      if (gen !== createGeneration) return  // another LEVEL_START fired while we awaited
      sessionId.value = id
    }))

    // WAVE_END → update session with the frozen snapshot carried by the event.
    // Reading from the payload (rather than game.state) ensures the values
    // sent to the server reflect wave-end exactly, even if another listener
    // mutates resources before this handler runs.
    let pendingSync = false
    let latestSnapshot: { wave: number; gold: number; hp: number; score: number } | null = null
    unsubs.push(game.eventBus.on(Events.WAVE_END, async (snapshot) => {
      latestSnapshot = snapshot
      if (!sessionId.value) return
      if (syncing.value) {
        pendingSync = true
        return
      }
      syncing.value = true
      try {
        do {
          pendingSync = false
          if (!sessionId.value || !latestSnapshot) break
          await sessionService.update(sessionId.value, {
            current_wave: latestSnapshot.wave,
            gold: latestSnapshot.gold,
            hp: latestSnapshot.hp,
            score: latestSnapshot.score,
          })
          // success → reset the failure counter and alert latch
          consecutiveUpdateFailures = 0
          alertedForFailures = false
        } while (pendingSync)
      } catch (e) {
        console.warn('[SessionSync] Failed to update session:', e)
        // 401 means the access token was rejected; api.ts has already cleared
        // auth and navigated to /auth. Drop the sessionId so subsequent
        // WAVE_END events don't keep hammering the server with a dead token.
        if (e instanceof ApiError && e.status === 401) {
          sessionId.value = null
          consecutiveUpdateFailures = 0
          alertedForFailures = false
          return
        }
        consecutiveUpdateFailures++
        // After repeated consecutive failures, surface a modal once so the
        // player knows server score has diverged from what they see on screen.
        // 401s are handled separately by api.ts (logout + redirect), so here we
        // only need to cover the plain network-failure / 5xx case.
        if (
          !alertedForFailures &&
          consecutiveUpdateFailures >= UPDATE_FAIL_ALERT_THRESHOLD &&
          authStore.isLoggedIn
        ) {
          alertedForFailures = true
          uiStore.showModal(
            'Sync Failed',
            'Your progress could not be saved to the server. The leaderboard may not reflect your final score.',
          )
        }
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

    // Teardown: whoever calls this is responsible for unsubscribing engine
    // listeners too (useGameLoop does so). We add one cleanup here that clears
    // `pendingLevel` so a subsequent mount doesn't reuse the stale level after
    // a failing create/end — otherwise a late retry from endSession() below
    // would target the wrong level.
    unsubs.push(() => { pendingLevel = null })

    return unsubs
  }

  async function endSession(game: Game): Promise<void> {
    if (!authStore.isLoggedIn) return

    // Late creation: if session was never created (network was down at start),
    // try once more before giving up
    if (!sessionId.value && pendingLevel != null) {
      const gen = ++createGeneration
      sessionId.value = await createSessionWithRetry(pendingLevel, gen)
    }

    if (!sessionId.value) return
    const id = sessionId.value
    try {
      await sessionService.end(id, {
        score: game.state.score,
        kills: game.state.kills,
        waves_survived: game.state.wave,
      })
      // Clear only on success so a transient failure can be retried by the next LEVEL_END / GAME_OVER
      sessionId.value = null
      pendingLevel = null
    } catch (e) {
      console.warn('[SessionSync] Failed to end session (will retry on next end event):', e)
    }
  }

  return { sessionId, bind }
}
