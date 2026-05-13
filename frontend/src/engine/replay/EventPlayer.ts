/**
 * EventPlayer — drives a recorded input stream into a live engine for §24 Replay.
 *
 * The engine still runs its own update loop (RAF + fixed-dt simulation);
 * the player's job is to inject the recorded player-decision events at the
 * correct {@link Game.time}. Combined with {@link Game.setSeed}, this
 * reproduces the live run's RNG-driven outcomes (buff disable target,
 * Monty-Hall door, Radar crit roll, chain-rule question).
 *
 * Acceptance criterion (spec §24.5): final score within ε = 0.0005 of the
 * recorded run. The engine's update loop is deterministic on a fixed dt
 * (FIXED_DT in constants.ts), so within-frame floating-point drift is the
 * only legitimate divergence.
 *
 * Caveats:
 *   - Events emitted by the SIMULATION (ENEMY_KILLED, BUFF_RESULT, etc) are
 *     NOT in the recorded log — the simulation re-derives them. If a
 *     listener for those events is on the bus during playback (e.g. the
 *     HUD reactive store), it sees the replayed sim's emissions, which is
 *     what we want.
 *   - Recorder events are TYPED at compile time but UNTYPED at runtime
 *     (JSON round-tripped). The player casts payloads loosely; a malformed
 *     payload from a tampered backend response surfaces as a system bug
 *     in playback, not a hard error.
 */
import type { Game, GameEvents } from '@/engine/Game'
import type { ReplayEventOut } from '@/services/sessionService'
import { Events } from '@/data/constants'

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'ended'

export interface PlayerOptions {
  /**
   * Multiplier on game.time progression — the engine itself isn't sped up
   * (FIXED_DT is fixed by name), but we can fast-forward by playing
   * multiple events per frame when the recorded gap is bigger than a
   * single dt. Future-leaning hook; for v1 the caller pins this at 1.
   */
  speed?: number

  /**
   * Optional callback when playback reaches a recorded event. Used by the
   * replay UI to surface "now showing: TOWER_PLACED at t=12.4s" in a
   * timeline strip.
   */
  onEventDispatched?: (event: ReplayEventOut) => void
}

/**
 * Events the player MUST NOT replay through the EventBus, because the
 * live engine emits them itself from its own update path. Re-emitting
 * them would double-count (e.g. WAVE_END would tick the score-sync
 * twice).
 */
const ENGINE_EMITTED: ReadonlySet<string> = new Set<string>([
  Events.LEVEL_START,
  Events.LEVEL_END,
  Events.GAME_OVER,
  Events.WAVE_START,
  Events.WAVE_END,
  Events.BUILD_PHASE_START,
  Events.BUFF_PHASE_START,
  Events.TOWER_PLACED,        // emitted by TowerPlacementSystem on click
  Events.TOWER_REMOVED,       // emitted by TowerPlacementSystem
])

export class EventPlayer {
  readonly events: ReadonlyArray<ReplayEventOut>
  private _game: Game
  private _options: Required<PlayerOptions>
  private _cursor = 0
  private _state: PlaybackState = 'idle'
  private _unsubFrame: (() => void) | null = null
  private _onTick: () => void

  constructor(game: Game, events: ReadonlyArray<ReplayEventOut>, options: PlayerOptions = {}) {
    this._game = game
    // Defensive copy + sort by seq — backend already orders by seq, but a
    // tampered or reordered cache shouldn't desync the player.
    this.events = [...events].sort((a, b) => a.seq - b.seq)
    this._options = {
      speed: options.speed ?? 1,
      onEventDispatched: options.onEventDispatched ?? (() => {}),
    }
    this._onTick = this._tick.bind(this)
  }

  get state(): PlaybackState { return this._state }

  /** Number of events dispatched so far. */
  get cursor(): number { return this._cursor }

  /** Latest event's recorded ts, or 0 if no events yet. */
  get totalDuration(): number {
    if (this.events.length === 0) return 0
    return this.events[this.events.length - 1].ts
  }

  play(): void {
    if (this._state === 'playing') return
    if (this._cursor >= this.events.length) return
    this._state = 'playing'
    this._installFrameHook()
  }

  pause(): void {
    if (this._state !== 'playing') return
    this._state = 'paused'
    this._uninstallFrameHook()
    this._game.stop()
  }

  /**
   * Fast-forward (or rewind, when {@link reset} is called first) to a
   * target game-time. Dispatches every queued event whose recorded ts
   * is ≤ target. Engine state advances naturally as those events take
   * effect; the simulation loop resumes from the new cursor on play().
   *
   * Note: rewinding requires resetting first because the engine does not
   * support undo. The Replay UI does this by tearing down + re-creating
   * the engine via the parent component.
   */
  seekTo(targetTs: number): void {
    while (
      this._cursor < this.events.length &&
      this.events[this._cursor].ts <= targetTs
    ) {
      this._dispatch(this.events[this._cursor])
      this._cursor++
    }
  }

  destroy(): void {
    this._uninstallFrameHook()
    this._state = 'idle'
  }

  private _installFrameHook(): void {
    if (this._unsubFrame) return
    // Drive the player off requestAnimationFrame in lock-step with the
    // engine. The engine's own loop advances game.time on FIXED_DT; we
    // sample game.time each rAF and dispatch all events whose ts has
    // been crossed.
    let rafId: number | null = null
    const loop = () => {
      this._onTick()
      if (this._state === 'playing') {
        rafId = requestAnimationFrame(loop)
      }
    }
    this._game.start()
    rafId = requestAnimationFrame(loop)
    this._unsubFrame = () => { if (rafId !== null) cancelAnimationFrame(rafId) }
  }

  private _uninstallFrameHook(): void {
    if (!this._unsubFrame) return
    this._unsubFrame()
    this._unsubFrame = null
  }

  private _tick(): void {
    if (this._cursor >= this.events.length) {
      this._state = 'ended'
      this._uninstallFrameHook()
      this._game.stop()
      return
    }
    const now = this._game.time
    while (
      this._cursor < this.events.length &&
      this.events[this._cursor].ts <= now
    ) {
      this._dispatch(this.events[this._cursor])
      this._cursor++
    }
  }

  private _dispatch(event: ReplayEventOut): void {
    if (!ENGINE_EMITTED.has(event.event_type)) {
      // Cast through unknown — at runtime the EventBus only checks the
      // string key, not the payload shape.
      this._game.eventBus.emit(
        event.event_type as keyof GameEvents,
        event.payload as never,
      )
    } else {
      // Engine-emitted lifecycle event: do NOT re-emit. We still call the
      // engine's own commands so the live loop reaches the same phase at
      // the same time. WAVE_START is the most common case — the original
      // run captured the player pressing the start-wave button at a
      // specific game.time, so we trigger startWave at that moment.
      if (event.event_type === Events.WAVE_START) {
        this._game.startWave()
      } else if (event.event_type === Events.LEVEL_END) {
        // The replay engine reaches LEVEL_END from its own simulation;
        // the recorded event marks the timeline anchor for the UI but
        // doesn't drive engine state.
      }
    }
    this._options.onEventDispatched(event)
  }
}
