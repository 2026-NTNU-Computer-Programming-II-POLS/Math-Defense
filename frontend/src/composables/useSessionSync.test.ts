/**
 * Happy-path with retry coverage for bug 3.2 — score lost on a single network blip.
 *
 * useSessionSync.endSession() does NOT retry inside the call: it relies on the
 * NEXT end-triggering event (LEVEL_END or PHASE_CHANGED→GAME_OVER) to retry.
 * That's the contract: clear sessionId only on success, so a transient failure
 * leaves the session in a "still pending" state.
 *
 * This test mocks sessionService.end to fail once then succeed, fires the end
 * trigger twice, and asserts the final state was successfully submitted with
 * the expected score.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// ── Mocks must be hoisted before the SUT imports them ──
vi.mock('@/services/sessionService', () => ({
  sessionService: {
    create: vi.fn(),
    getActive: vi.fn(),
    update: vi.fn(),
    end: vi.fn(),
    abandon: vi.fn(),
  },
}))
vi.mock('@/router', () => ({ default: { push: vi.fn() } }))

import { sessionService } from '@/services/sessionService'
import { useAuthStore } from '@/stores/authStore'
import { useSessionSync } from './useSessionSync'
import { Events, GamePhase } from '@/data/constants'
import { EventBus } from '@/engine/EventBus'
import { ApiError } from '@/services/api'

// Minimal Game stub matching what useSessionSync.bind() actually touches
function makeGameStub() {
  const eventBus = new EventBus<Record<string, unknown>>()
  return {
    eventBus,
    state: {
      score: 1234,
      kills: 7,
      wave: 5,
    },
  } as never
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('useSessionSync — retry on transient end-session failure (bug 3.2)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Pretend the user is logged in so the sync path actually runs
    const auth = useAuthStore()
    // @ts-expect-error — we drive the store directly to avoid mounting auth flow
    auth.token = 'fake-token'
    // @ts-expect-error
    auth.user = { id: 'u1', username: 'tester' }

    // No orphan session at mount
    vi.mocked(sessionService.getActive).mockResolvedValue(null)
    // Successful create returns a session id
    vi.mocked(sessionService.create).mockResolvedValue({
      id: 'sess-abc',
      level: 1,
      status: 'active',
      current_wave: 0,
      gold: 200,
      hp: 20,
      score: 0,
      started_at: new Date().toISOString(),
    })
  })

  it('retries on next end trigger after sessionService.end fails once', async () => {
    // Fail once, then succeed
    vi.mocked(sessionService.end)
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({
        id: 'sess-abc',
        level: 1,
        status: 'completed',
        current_wave: 5,
        gold: 200,
        hp: 0,
        score: 1234,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
      })

    const sync = useSessionSync()
    const game = makeGameStub()
    sync.bind(game)

    // Drive the level start so the session id gets populated
    game.eventBus.emit(Events.LEVEL_START, 1)
    await flushPromises()
    expect(sync.sessionId.value).toBe('sess-abc')

    // First end trigger — fails. The contract: sessionId stays populated so
    // the next trigger can retry.
    game.eventBus.emit(Events.PHASE_CHANGED, { from: GamePhase.WAVE, to: GamePhase.GAME_OVER })
    await flushPromises()
    expect(sessionService.end).toHaveBeenCalledTimes(1)
    expect(sync.sessionId.value).toBe('sess-abc') // still pending — score not lost

    // Second trigger — succeeds. sessionId clears, score was preserved (1234).
    game.eventBus.emit(Events.PHASE_CHANGED, { from: GamePhase.WAVE, to: GamePhase.GAME_OVER })
    await flushPromises()
    expect(sessionService.end).toHaveBeenCalledTimes(2)
    const lastCallArgs = vi.mocked(sessionService.end).mock.calls[1]
    expect(lastCallArgs[0]).toBe('sess-abc')
    expect(lastCallArgs[1]).toEqual({ score: 1234, kills: 7, waves_survived: 5 })
    expect(sync.sessionId.value).toBeNull()
  })

  it('gives up quietly when create exhausts MAX_CREATE_RETRIES (transient failures)', async () => {
    // MAX_CREATE_RETRIES=2 → 3 total attempts. All reject.
    vi.mocked(sessionService.create)
      .mockReset()
      .mockRejectedValue(new Error('network down'))

    const sync = useSessionSync()
    const game = makeGameStub()
    sync.bind(game)

    game.eventBus.emit(Events.LEVEL_START, 1)
    // Wait through all retries (2 retries × 1000ms + margin). Use fake timers
    // would be cleaner but the SUT uses setTimeout() and plain awaits interleaved —
    // draining microtasks in a short loop matches the existing test style.
    for (let i = 0; i < 50; i++) await flushPromises()
    // Not ideal, but deterministic: advance real time past the retry budget.
    await new Promise((r) => setTimeout(r, 2500))

    expect(sessionService.create).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
    expect(sync.sessionId.value).toBeNull()
  }, 10_000)

  it('stops WAVE_END sync after a 401 instead of re-hammering on each wave', async () => {
    const sync = useSessionSync()
    const game = makeGameStub()
    sync.bind(game)

    // Get a session id in place first
    game.eventBus.emit(Events.LEVEL_START, 1)
    await flushPromises()
    expect(sync.sessionId.value).toBe('sess-abc')

    // First WAVE_END: 401 → sessionId should be cleared by the guard
    vi.mocked(sessionService.update).mockRejectedValueOnce(new ApiError(401, 'token expired'))
    game.eventBus.emit(Events.WAVE_END, 1 as never)
    await flushPromises()
    expect(sessionService.update).toHaveBeenCalledTimes(1)
    expect(sync.sessionId.value).toBeNull()

    // Second WAVE_END: should not attempt another update — sessionId is null
    game.eventBus.emit(Events.WAVE_END, 2 as never)
    await flushPromises()
    expect(sessionService.update).toHaveBeenCalledTimes(1)
  })

  it('endSession network failure is carried across two end triggers without losing data', async () => {
    // Covers the exact bug-3.2 regression: a single network blip on end must
    // not drop the final score. The retry path is driven by the NEXT end
    // event (LEVEL_END or GAME_OVER), not an internal retry loop.
    vi.mocked(sessionService.end)
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({
        id: 'sess-abc',
        level: 1,
        status: 'completed',
        current_wave: 5,
        gold: 200,
        hp: 0,
        score: 1234,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
      })

    const sync = useSessionSync()
    const game = makeGameStub()
    sync.bind(game)

    game.eventBus.emit(Events.LEVEL_START, 1)
    await flushPromises()

    // First LEVEL_END fails — sessionId must remain so the next trigger retries.
    game.eventBus.emit(Events.LEVEL_END, undefined)
    await flushPromises()
    expect(sync.sessionId.value).toBe('sess-abc')

    // Second LEVEL_END succeeds with the same payload — score survives.
    game.eventBus.emit(Events.LEVEL_END, undefined)
    await flushPromises()
    expect(sessionService.end).toHaveBeenCalledTimes(2)
    expect(vi.mocked(sessionService.end).mock.calls[1][1]).toEqual({
      score: 1234, kills: 7, waves_survived: 5,
    })
    expect(sync.sessionId.value).toBeNull()
  })

  it('happy path: single end call succeeds first time and clears sessionId', async () => {
    vi.mocked(sessionService.end).mockResolvedValueOnce({
      id: 'sess-abc',
      level: 1,
      status: 'completed',
      current_wave: 5,
      gold: 200,
      hp: 0,
      score: 1234,
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
    })

    const sync = useSessionSync()
    const game = makeGameStub()
    sync.bind(game)

    game.eventBus.emit(Events.LEVEL_START, 1)
    await flushPromises()

    game.eventBus.emit(Events.LEVEL_END, undefined)
    await flushPromises()

    expect(sessionService.end).toHaveBeenCalledTimes(1)
    expect(sync.sessionId.value).toBeNull()
  })
})
