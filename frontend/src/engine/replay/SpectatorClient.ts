/**
 * SpectatorClient — WebSocket consumer for §24 Phase D live spectate.
 *
 * Connection lifecycle:
 *   1. Connect to `/api/sessions/{id}/spectate`. Cookie-based auth flows
 *      automatically with the WS handshake.
 *   2. Receive a single `{kind: 'snapshot', events: [...]}` frame with the
 *      historical events recorded so far.
 *   3. Receive subsequent `{kind: 'event', ...}` frames as the live session
 *      flushes new events.
 *
 * The client auto-reconnects on transient closes (network blip, 1006/1001,
 * generic errors) with exponential backoff. Auth-class closes (4401/4403)
 * are surfaced once and NOT retried — a forbidden viewer or expired session
 * cannot be fixed by reconnecting and would otherwise mask the real failure
 * behind an endless reconnect loop. (F-BUG-11)
 */
import type { ReplayEventOut } from '@/services/sessionService'

export interface SpectateSnapshot {
  session_id: string
  rng_seed: number | null
  star_rating: number
  events: ReplayEventOut[]
}

export type SpectatorCloseReason = 'auth' | 'forbidden' | 'normal' | 'error'

export interface SpectatorCallbacks {
  onSnapshot: (s: SpectateSnapshot) => void
  onEvent: (e: ReplayEventOut) => void
  onClose?: (code: number, reason: string, classification: SpectatorCloseReason) => void
  onError?: (err: Event) => void
  onMalformedFrame?: (raw: unknown, error: unknown) => void
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function validateReplayEvent(x: unknown): ReplayEventOut | null {
  if (!isPlainObject(x)) return null
  if (typeof x.seq !== 'number' || !Number.isFinite(x.seq)) return null
  if (typeof x.ts !== 'number' || !Number.isFinite(x.ts)) return null
  if (typeof x.event_type !== 'string') return null
  // payload is `unknown` per the type — we don't validate its shape.
  return x as unknown as ReplayEventOut
}

function validateSnapshot(x: unknown): SpectateSnapshot | null {
  if (!isPlainObject(x)) return null
  if (typeof x.session_id !== 'string') return null
  if (x.rng_seed !== null && typeof x.rng_seed !== 'number') return null
  if (typeof x.star_rating !== 'number') return null
  if (!Array.isArray(x.events)) return null
  const events: ReplayEventOut[] = []
  for (const e of x.events) {
    const ev = validateReplayEvent(e)
    if (!ev) return null
    events.push(ev)
  }
  return {
    session_id: x.session_id,
    rng_seed: x.rng_seed as number | null,
    star_rating: x.star_rating,
    events,
  }
}

const RECONNECT_BASE_DELAY_MS = 1_000
const RECONNECT_MAX_DELAY_MS = 30_000
const RECONNECT_MAX_ATTEMPTS = 8

export class SpectatorClient {
  private _ws: WebSocket | null = null
  private _disposed = false
  private _reconnectAttempts = 0
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private readonly _sessionId: string
  private readonly _cb: SpectatorCallbacks

  constructor(sessionId: string, cb: SpectatorCallbacks) {
    this._sessionId = sessionId
    this._cb = cb
  }

  start(): void {
    if (this._ws || this._disposed) return
    // Prefer wss when the page is https; fall back to ws for local dev.
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/api/sessions/${encodeURIComponent(this._sessionId)}/spectate`
    const ws = new WebSocket(url)
    this._ws = ws
    ws.onmessage = (msg) => {
      let data: unknown
      try {
        data = JSON.parse(msg.data as string)
      } catch (e) {
        console.warn('[Spectator] malformed frame', e)
        this._cb.onMalformedFrame?.(msg.data, e)
        return
      }
      if (!isPlainObject(data)) {
        this._cb.onMalformedFrame?.(data, new Error('frame is not an object'))
        return
      }
      if (data.kind === 'snapshot') {
        const snap = validateSnapshot(data)
        if (!snap) {
          this._cb.onMalformedFrame?.(data, new Error('invalid snapshot shape'))
          return
        }
        // Snapshot means the handshake (incl. auth) succeeded — clear the
        // backoff so a future transient drop gets the full retry budget again.
        this._reconnectAttempts = 0
        this._cb.onSnapshot(snap)
      } else if (data.kind === 'event') {
        const { kind: _kind, ...rest } = data
        const event = validateReplayEvent(rest)
        if (!event) {
          this._cb.onMalformedFrame?.(data, new Error('invalid event shape'))
          return
        }
        this._cb.onEvent(event)
      } else {
        // Unknown frame kind — log and ignore rather than crash the consumer.
        this._cb.onMalformedFrame?.(data, new Error(`unknown frame kind: ${String(data.kind)}`))
      }
    }
    ws.onclose = (ev) => {
      this._ws = null
      // Surface auth-class closes distinctly from network blips. The backend
      // uses 4401 for unauthenticated, 4403 for forbidden (matching the HTTP
      // status convention). Plain network drops show up as 1006 / 1001 etc.
      let classification: SpectatorCloseReason
      if (ev.code === 4401) classification = 'auth'
      else if (ev.code === 4403) classification = 'forbidden'
      else if (ev.code === 1000) classification = 'normal'
      else classification = 'error'
      this._cb.onClose?.(ev.code, ev.reason, classification)
      // Auto-reconnect transient closes; never retry auth/forbidden so a
      // stale cookie or revoked permission surfaces instead of looping.
      if (
        !this._disposed
        && classification === 'error'
        && this._reconnectAttempts < RECONNECT_MAX_ATTEMPTS
      ) {
        const delay = Math.min(
          RECONNECT_BASE_DELAY_MS * 2 ** this._reconnectAttempts,
          RECONNECT_MAX_DELAY_MS,
        )
        this._reconnectAttempts += 1
        this._reconnectTimer = setTimeout(() => {
          this._reconnectTimer = null
          if (!this._disposed) this.start()
        }, delay)
      }
    }
    ws.onerror = (ev) => {
      this._cb.onError?.(ev)
    }
  }

  destroy(): void {
    this._disposed = true
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    if (this._ws) {
      try { this._ws.close() } catch { /* ignore */ }
      this._ws = null
    }
  }
}
