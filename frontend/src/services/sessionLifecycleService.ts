/**
 * sessionLifecycleService — pure API operations around a play-session
 * lifecycle. Extracted from useSessionSync (audit F-ARCH-8) so the composable
 * can stay a thin Vue glue layer (refs, modal toasts, cache invalidation,
 * sessionStorage) and keep all server-talk here.
 *
 * Nothing in this module imports from `vue`, `pinia`, or any UI store; the
 * surface is Promise-returning calls that work in tests with a mocked
 * `sessionService`.
 */
import { sessionService, type SessionOut, type SessionEndPayload } from './sessionService'
import { ApiError } from './api'
import type { Game, WaveEndSnapshot } from '@/engine/Game'

export const MAX_CREATE_RETRIES = 2
export const RETRY_DELAY_MS = 1000

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface CreateSessionInput {
  starRating: number
  initialAnswer: boolean
  practiceMode: boolean
  challengeId: string | null
  seed: number | null
  replayVersion: 1 | 2
}

/**
 * Best-effort cleanup of any session left in `active` status from a prior
 * tab/visit. Called once when the engine binds; failure is non-fatal.
 */
export async function cleanupOrphanSession(): Promise<void> {
  try {
    const active = await sessionService.getActive()
    if (!active) return
    await sessionService.abandon(active.id)
  } catch (e) {
    console.warn('[SessionLifecycle] Failed to clean up orphan session:', e)
  }
}

/**
 * Create a session with bounded retry on transient failures. The
 * `isCurrent` callback lets the caller cancel the in-flight create when its
 * generation token has been bumped (e.g. the player restarted before the
 * create resolved). When `isCurrent()` returns false after a successful
 * create, the late-arrival session is abandoned server-side.
 *
 * 4xx responses (401/403/422) are not retried — they're contract failures,
 * not transient ones.
 */
export async function createSessionWithRetry(
  input: CreateSessionInput,
  isCurrent: () => boolean,
): Promise<SessionOut | null> {
  for (let attempt = 0; attempt <= MAX_CREATE_RETRIES; attempt++) {
    if (!isCurrent()) return null
    try {
      const session = await sessionService.create(
        input.starRating,
        undefined,
        input.initialAnswer,
        input.practiceMode,
        input.challengeId,
        input.seed,
        input.replayVersion,
      )
      if (!isCurrent()) {
        sessionService.abandon(session.id).catch((err) =>
          console.warn('[SessionLifecycle] Failed to abandon late-arrival session:', err),
        )
        return null
      }
      return session
    } catch (e) {
      console.warn(`[SessionLifecycle] Create attempt ${attempt + 1} failed:`, e)
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

/** PATCH /api/sessions/:id with a wave-end snapshot. */
export function pushWaveSnapshot(
  sessionId: string,
  snapshot: WaveEndSnapshot,
): Promise<SessionOut> {
  return sessionService.update(sessionId, {
    current_wave: snapshot.wave,
    score: snapshot.score,
    kill_value: snapshot.killValue,
    cost_total: snapshot.costTotal,
  })
}

/**
 * Build the `SessionEndPayload` from the engine's terminal state. Pure
 * function: no API call, no side effects.
 *
 * F-BUG-6: never include a client-computed `score` / `total_score` here —
 * the backend recomputes the canonical total from the raw inputs.
 */
export function buildEndPayload(s: Game['state']): SessionEndPayload {
  return {
    kills: s.kills,
    waves_survived: s.wave,
    kill_value: s.cumulativeKillValue,
    cost_total: s.costTotal,
    time_total: s.timeTotal,
    health_origin: s.healthOrigin,
    health_final: s.hp,
    time_exclude_prepare: s.timeExcludePrepare,
    n_prep_phases: s.timeExcludePrepare.length,
  }
}

/** POST /api/sessions/:id/end with the terminal payload. */
export function endSession(
  sessionId: string,
  state: Game['state'],
): Promise<SessionOut> {
  return sessionService.end(sessionId, buildEndPayload(state))
}

/** POST /api/sessions/:id/abandon without scoring or leaderboard submission. */
export function abandonSession(sessionId: string): Promise<SessionOut> {
  return sessionService.abandon(sessionId)
}
