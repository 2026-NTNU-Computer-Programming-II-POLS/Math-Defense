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
 * The client is intentionally stupid: it just delivers parsed payloads to
 * the caller via callbacks. Reconnection on transient disconnect is left
 * to the caller (a few seconds of dropped events is acceptable; the
 * recorded log can be replayed later).
 */
import type { ReplayEventOut } from '@/services/sessionService'

export interface SpectateSnapshot {
  session_id: string
  rng_seed: number | null
  star_rating: number
  events: ReplayEventOut[]
}

export interface SpectatorCallbacks {
  onSnapshot: (s: SpectateSnapshot) => void
  onEvent: (e: ReplayEventOut) => void
  onClose?: (code: number, reason: string) => void
  onError?: (err: Event) => void
}

export class SpectatorClient {
  private _ws: WebSocket | null = null
  private _disposed = false
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
      try {
        const data = JSON.parse(msg.data as string)
        if (data.kind === 'snapshot') {
          this._cb.onSnapshot(data as SpectateSnapshot)
        } else if (data.kind === 'event') {
          // Drop the kind discriminator before forwarding.
          const { kind: _kind, ...event } = data
          this._cb.onEvent(event as ReplayEventOut)
        }
      } catch (e) {
        console.warn('[Spectator] malformed frame', e)
      }
    }
    ws.onclose = (ev) => {
      this._ws = null
      this._cb.onClose?.(ev.code, ev.reason)
    }
    ws.onerror = (ev) => {
      this._cb.onError?.(ev)
    }
  }

  destroy(): void {
    this._disposed = true
    if (this._ws) {
      try { this._ws.close() } catch { /* ignore */ }
      this._ws = null
    }
  }
}
