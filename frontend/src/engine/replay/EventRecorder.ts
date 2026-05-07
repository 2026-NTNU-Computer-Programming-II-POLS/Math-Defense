/**
 * EventRecorder — captures the player-input event stream for §24 Replay.
 *
 * Subscribes to a curated set of GameEvents (the ones that represent player
 * decisions, NOT the high-frequency simulation chatter like ENEMY_SPAWNED
 * and TOWER_ATTACK) and ships them to the backend in batches. Combined
 * with the per-session deterministic seed (Game.setSeed / Backlog §24
 * determinism foundation), the input stream is sufficient to re-drive
 * the engine and reconstruct the run.
 *
 * Why a curated set rather than every event?
 *   - Spec §24.1 reads "Persist the input + RNG-seed stream". Output
 *     events (kills, gold deltas, projectile spawns) are derived from the
 *     input + seed by definition; recording them would 10–100× the log
 *     size without adding information.
 *   - Per-session cap (50k) protects the table; with derived events
 *     included, a long Star-5 run could blow that budget.
 *
 * Flush policy:
 *   - One in-flight POST at a time. Buffers writes during a flush so we
 *     never drop events on a slow network.
 *   - Periodic flush every {@link FLUSH_INTERVAL_MS} via setInterval.
 *   - Forced flush on LEVEL_END / GAME_OVER (terminal events) and on
 *     destroy() so a tab-close still ships the tail.
 *   - Best-effort beforeunload flush via sendBeacon for the final chunk
 *     when the user navigates away mid-run.
 */
import { Events } from '@/data/constants'
import type { Game, GameEvents } from '@/engine/Game'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, readCookie } from '@/services/api'
import { sessionService } from '@/services/sessionService'

export interface RecordedEvent {
  seq: number
  ts: number
  event_type: string
  payload: unknown
}

const FLUSH_INTERVAL_MS = 2_000

// Curated set of "input" events — anything driven by a player decision or
// a phase boundary the replayer needs to schedule its own startWave / etc
// against. Keeping this list explicit (rather than "everything") means
// adding a new event type doesn't silently inflate the replay log; the
// person adding the event makes a deliberate choice whether it belongs
// here or in the derived-from-simulation bucket.
//
// BUILD_PHASE_START / BUFF_PHASE_START are intentionally absent — they are
// declared in the GameEvents map but no system actually emits them today
// (PHASE_CHANGED is the canonical channel). Recording them would be dead
// code; if a future system starts emitting either, add them here.
const RECORDED_EVENTS: ReadonlyArray<keyof GameEvents> = [
  // Lifecycle anchors — player-driven (start wave / end level)
  Events.LEVEL_START,
  Events.LEVEL_END,
  Events.GAME_OVER,
  Events.WAVE_START,
  Events.WAVE_END,

  // Tower lifecycle (player decisions)
  Events.TOWER_PLACED,
  Events.TOWER_PARAMS_SET,
  Events.TOWER_UPGRADE,
  Events.TOWER_REFUND,
  Events.TOWER_REMOVED,
  Events.TOWER_TARGETING_CHANGED,

  // Per-tower configuration (player decisions)
  Events.MAGIC_FUNCTION_SELECTED,
  Events.MAGIC_MODE_CHANGED,
  Events.RADAR_ARC_CHANGED,
  Events.MATRIX_PAIR_CHANGED,
  Events.LIMIT_ANSWER,
  Events.CALCULUS_OPERATION,

  // Buff / shop / Monty-Hall / chain-rule (player decisions)
  Events.BUFF_CARD_SELECTED,
  Events.SHOP_PURCHASE,
  Events.MONTY_HALL_DOOR_SELECTED,
  Events.MONTY_HALL_SWITCH_DECISION,
  Events.CHAIN_RULE_ANSWER,

  // Player-cast spells
  Events.SPELL_CAST,
] as const

const TERMINAL_EVENTS: ReadonlyArray<keyof GameEvents> = [
  Events.LEVEL_END,
  Events.GAME_OVER,
] as const

export class EventRecorder {
  private readonly _game: Game
  private readonly _getSessionId: () => string | null
  private _unsubs: (() => void)[] = []
  private _buffer: RecordedEvent[] = []
  private _seq = 0
  private _intervalId: ReturnType<typeof setInterval> | null = null
  private _flushInflight = false
  private _disposed = false
  private _onBeforeUnload: ((ev: BeforeUnloadEvent) => void) | null = null

  constructor(game: Game, getSessionId: () => string | null) {
    this._game = game
    this._getSessionId = getSessionId
  }

  start(): void {
    if (this._unsubs.length > 0) return
    for (const eventType of RECORDED_EVENTS) {
      const unsub = this._game.eventBus.on(eventType, (payload) => {
        this._record(eventType, payload)
        if ((TERMINAL_EVENTS as readonly string[]).includes(eventType as string)) {
          // Don't await — terminal events fire from synchronous game code
          // and we don't want to block the event dispatch on a network
          // round-trip. The error path is logged inside _flush.
          void this._flush()
        }
      })
      this._unsubs.push(unsub)
    }

    this._intervalId = setInterval(() => { void this._flush() }, FLUSH_INTERVAL_MS)

    // Best-effort tail flush on hard navigation. sendBeacon is fire-and-
    // forget but survives unload where fetch() does not.
    if (typeof window !== 'undefined') {
      this._onBeforeUnload = () => { this._beaconFlush() }
      window.addEventListener('beforeunload', this._onBeforeUnload)
    }
  }

  destroy(): void {
    if (this._disposed) return
    this._disposed = true
    this._unsubs.forEach((fn) => { try { fn() } catch { /* ignore */ } })
    this._unsubs = []
    if (this._intervalId !== null) {
      clearInterval(this._intervalId)
      this._intervalId = null
    }
    if (this._onBeforeUnload && typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this._onBeforeUnload)
      this._onBeforeUnload = null
    }
    void this._flush()
  }

  private _record(eventType: string, payload: unknown): void {
    if (this._disposed) return
    this._buffer.push({
      seq: this._seq++,
      ts: this._game.time,
      event_type: eventType,
      payload: this._sanitize(payload),
    })
  }

  /**
   * Drop unserializable members (functions, DOM nodes) before queueing.
   * Most payloads are plain objects (numbers, strings, ids), but a few
   * carry rich domain entities — Tower / Enemy / Pet — that hold callable
   * methods like `evaluate`. Strip those rather than letting JSON.stringify
   * silently produce a corrupt payload at flush time.
   *
   * We use a try/catch round-trip rather than walking the object: simpler,
   * and any payload too exotic for JSON is by definition not replayable
   * either, so dropping it is the right call.
   */
  private _sanitize(payload: unknown): unknown {
    if (payload === null || payload === undefined) return payload
    if (typeof payload === 'number' || typeof payload === 'string' || typeof payload === 'boolean') {
      return payload
    }
    try {
      return JSON.parse(JSON.stringify(payload, (_k, v) => {
        if (typeof v === 'function') return undefined
        return v
      }))
    } catch {
      return null
    }
  }

  private async _flush(): Promise<void> {
    if (this._flushInflight) return
    if (this._buffer.length === 0) return
    const sessionId = this._getSessionId()
    if (!sessionId) return

    const batch = this._buffer
    this._buffer = []
    this._flushInflight = true
    try {
      await sessionService.appendReplayEvents(sessionId, batch)
    } catch (e) {
      // Re-queue on failure; the next interval will retry. We splice
      // rather than concat-prepend so the merged buffer keeps event order.
      this._buffer = [...batch, ...this._buffer]
      console.warn('[EventRecorder] flush failed; will retry', e)
    } finally {
      this._flushInflight = false
    }
  }

  private _beaconFlush(): void {
    if (this._buffer.length === 0) return
    const sessionId = this._getSessionId()
    if (!sessionId) return
    // sendBeacon doesn't support custom headers, so it can't carry the
    // CSRF token the backend's CsrfMiddleware demands on POST. fetch with
    // keepalive: true is the modern equivalent that DOES support headers
    // — the request survives the page unload and the browser keeps the
    // socket open until it completes (subject to a 64 KB body cap, which
    // a typical replay tail batch comfortably fits within).
    if (typeof fetch !== 'function') return
    try {
      const url = `/api/sessions/${encodeURIComponent(sessionId)}/events`
      const body = JSON.stringify({ events: this._buffer })
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      const csrf = readCookie(CSRF_COOKIE_NAME)
      if (csrf) headers[CSRF_HEADER_NAME] = csrf
      // Fire-and-forget: the unload event has already begun; we don't await.
      void fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers,
        body,
        keepalive: true,
      })
      this._buffer = []
    } catch {
      // Best-effort; drop on failure rather than holding up unload.
    }
  }
}
