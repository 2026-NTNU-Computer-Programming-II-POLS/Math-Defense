/**
 * AssetManager — Pedagogical Backlog §15 (Audio Land, extended pass).
 *
 * Loads the full SFX set + music beds, gates playback on the Chromium
 * autoplay policy (HTMLAudioElement.play() rejects until the first user
 * gesture), and exposes per-bus mute / volume controls bridged to uiStore.
 *
 * Design notes:
 *   - HTMLAudioElement (not WebAudio) — §15.5 calls out mocking `Audio`, and
 *     the SFX set is small enough that the latency cost is irrelevant.
 *   - Bus model: every SfxDef belongs to one of {music, sfx, ui}. Effective
 *     volume = master × bus[def.bus] × def.volume × runtimeJitter.
 *   - Polyphony: one-shots clone the source so overlapping triggers layer,
 *     but each slug has a polyphonyCap (default 4) to prevent runaway clone
 *     accumulation when e.g. 30 enemies die in the same frame.
 *   - Throttle: a slug with minIntervalMs ignores triggers that arrive too
 *     soon after the previous one — protects against TOWER_ATTACK spam.
 *   - Jitter: pitch/volume randomisation gives repeated SFX organic variety
 *     so 60 consecutive `kill` plays don't sound mechanical.
 *   - Music beds crossfade between each other (linear, ~250ms) so the
 *     BUILD↔WAVE transition isn't an audible hard cut.
 *   - All mutations of unlock/mute/volume state are idempotent so the
 *     uiStore can re-sync at any time.
 */
import { SFX_DEFS, type SfxBus, type SfxSlug } from './sfx-defs'

export interface PlayOptions {
  /** Per-call override of the SfxDef default volume (still scaled by master/bus). */
  volume?: number
  /** Per-call override of pitch (multiplied with any def.pitchJitter sample). */
  pitch?: number
}

const FADE_MS = 250
const DEFAULT_POLYPHONY = 4

interface ActiveClone {
  el: HTMLAudioElement
  slug: SfxSlug
  startedAt: number
}

interface MusicBed {
  slug: SfxSlug
  el: HTMLAudioElement
  /** Target volume after any in-flight fade completes (pre-mute). */
  targetVolume: number
  /** Current fade animation handle so we can cancel mid-flight. */
  fadeTimer: ReturnType<typeof setInterval> | null
}

const BUS_DEFAULT: Record<SfxBus, number> = { music: 1, sfx: 1, ui: 1 }

export class AssetManager {
  private sources = new Map<SfxSlug, HTMLAudioElement>()
  /** Currently-playing music beds, keyed by slug. Multiple beds = crossfade. */
  private musicBeds = new Map<SfxSlug, MusicBed>()
  /** Active one-shot clones keyed by slug — used for polyphony eviction. */
  private actives = new Map<SfxSlug, ActiveClone[]>()
  /** Last play timestamp per slug — used for minIntervalMs throttling. */
  private lastPlayAt = new Map<SfxSlug, number>()
  private masterVolume = 1.0
  private busVolume: Record<SfxBus, number> = { ...BUS_DEFAULT }
  private muted = false
  private unlocked = false
  private loaded = false
  private gestureBound = false
  private gestureHandler: (() => void) | null = null
  /** Music slugs requested before unlock — played on first gesture. */
  private pendingMusic = new Set<SfxSlug>()
  /** Global menu playlist pool. Empty when no playlist is active. */
  private playlist: SfxSlug[] = []
  /** Whether the playlist should keep advancing on `ended`. */
  private playlistActive = false
  /** The track currently owning the playlist (null when suspended). */
  private currentPlaylistSlug: SfxSlug | null = null
  /** The `ended` listener wired to the current track, so we can detach it. */
  private playlistEnded: { src: HTMLAudioElement; fn: () => void } | null = null

  /**
   * Preload every SFX. Resolves once all `<audio>` elements have at least
   * fired `loadedmetadata` (or errored out — a missing asset must not block
   * the rest of the bundle from working).
   */
  load(): Promise<void> {
    if (this.loaded) return Promise.resolve()
    this.loaded = true
    if (typeof Audio === 'undefined') return Promise.resolve()

    this.bindFirstGestureUnlock()

    const tasks: Promise<void>[] = []
    for (const slug of Object.keys(SFX_DEFS) as SfxSlug[]) {
      const def = SFX_DEFS[slug]
      const el = new Audio(def.url)
      el.preload = 'auto'
      if (def.loop) el.loop = true
      this.sources.set(slug, el)
      tasks.push(new Promise<void>((resolve) => {
        const done = (): void => {
          el.removeEventListener('loadedmetadata', done)
          el.removeEventListener('error', done)
          resolve()
        }
        el.addEventListener('loadedmetadata', done)
        el.addEventListener('error', done)
      }))
    }
    return Promise.all(tasks).then(() => undefined)
  }

  /**
   * Fire-and-forget SFX trigger. For looping slugs (music) keeps a single
   * instance per slug + crossfades against other active beds. One-shots
   * clone the source so overlapping plays layer, subject to polyphonyCap.
   */
  play(slug: SfxSlug, opts: PlayOptions = {}): void {
    const def = SFX_DEFS[slug]
    if (!def) return
    const src = this.sources.get(slug)
    if (!src) return

    // Throttle: drop the call entirely if it arrives inside minIntervalMs.
    const interval = def.minIntervalMs ?? 0
    if (interval > 0) {
      const now = performance.now()
      const last = this.lastPlayAt.get(slug) ?? -Infinity
      if (now - last < interval) return
      this.lastPlayAt.set(slug, now)
    }

    if (def.loop) {
      this.playMusic(slug, opts)
      return
    }

    if (!this.unlocked) return

    // Jittered volume — clamp at the end after all scaling.
    const volJitter = def.volumeJitter ?? 0
    const volScale = volJitter > 0 ? 1 + (Math.random() * 2 - 1) * volJitter : 1
    const base = opts.volume ?? def.volume
    const effective = this.effective(base * volScale, def.bus)

    // Jittered pitch via playbackRate.
    const pitchJitter = def.pitchJitter ?? 0
    const pitchScale = pitchJitter > 0 ? 1 + (Math.random() * 2 - 1) * pitchJitter : 1
    const playbackRate = (opts.pitch ?? 1) * pitchScale

    // Clone so overlapping triggers layer; evict oldest if at polyphonyCap.
    const cap = def.polyphonyCap ?? DEFAULT_POLYPHONY
    const clones = this.actives.get(slug) ?? []
    while (clones.length >= cap) {
      const oldest = clones.shift()
      if (oldest) {
        try { oldest.el.pause() } catch { /* ignore */ }
      }
    }

    const clone = src.cloneNode(true) as HTMLAudioElement
    clone.volume = effective
    clone.playbackRate = playbackRate
    const entry: ActiveClone = { el: clone, slug, startedAt: performance.now() }
    clones.push(entry)
    this.actives.set(slug, clones)

    const onEnd = (): void => {
      clone.removeEventListener('ended', onEnd)
      const arr = this.actives.get(slug)
      if (!arr) return
      const idx = arr.indexOf(entry)
      if (idx >= 0) arr.splice(idx, 1)
    }
    clone.addEventListener('ended', onEnd)

    void clone.play().catch(() => { /* user-gesture race — ignore */ })
  }

  /** Stop a single slug. For music beds this fades out; for one-shots this
   *  pauses every active clone immediately. */
  stop(slug: SfxSlug): void {
    const def = SFX_DEFS[slug]
    if (def?.loop) {
      this.stopMusic(slug)
      return
    }
    const arr = this.actives.get(slug)
    if (arr) {
      for (const c of arr) {
        try { c.el.pause() } catch { /* ignore */ }
      }
      arr.length = 0
    }
    const src = this.sources.get(slug)
    if (src) {
      try { src.pause(); src.currentTime = 0 } catch { /* ignore */ }
    }
  }

  /** Stop every music bed AND the menu playlist (full music teardown). */
  stopAllMusic(): void {
    this.detachPlaylistEnded()
    this.playlistActive = false
    this.currentPlaylistSlug = null
    for (const slug of [...this.musicBeds.keys()]) this.stopMusic(slug)
    this.pendingMusic.clear()
  }

  /** Master volume in [0, 1]. Applied multiplicatively to bus × per-sfx. */
  setVolume(v: number): void {
    this.masterVolume = clamp01(v)
    this.rescaleMusic()
  }

  /** Per-bus volume in [0, 1]. */
  setBusVolume(bus: SfxBus, v: number): void {
    this.busVolume[bus] = clamp01(v)
    this.rescaleMusic()
  }

  mute(m: boolean): void {
    this.muted = m
    this.rescaleMusic()
  }

  /** Test/debug accessor — not part of the §15.3 spec but cheap to expose. */
  get isUnlocked(): boolean { return this.unlocked }

  /** The slug currently playing from the menu playlist (null = suspended). */
  get currentTrack(): SfxSlug | null { return this.currentPlaylistSlug }

  // ─── Global menu playlist ─────────────────────────────────────────────

  /**
   * Start (or refresh) the global menu playlist. Plays a random track from
   * `slugs` and, when it ends, advances to another random track — never the
   * same one twice in a row. Consecutive tracks do not overlap (the WAVs
   * carry their own edge fades); the bed crossfade only kicks in when the
   * playlist hands the bus to/from the engine phase beds. Idempotent: if a
   * playlist is already running this only refreshes the pool and lets the
   * current track finish.
   *
   * Like a music bed, a track requested before the autoplay unlock is queued
   * and kicked off on the first user gesture.
   */
  startPlaylist(slugs: ReadonlyArray<SfxSlug>): void {
    const pool = slugs.filter((s) => SFX_DEFS[s])
    if (pool.length === 0) return
    this.playlist = [...pool]
    if (this.playlistActive) return
    this.playlistActive = true
    this.advancePlaylist()
  }

  /** Suspend the playlist: stop the current track and halt auto-advance.
   *  Used when entering a game session so the BUILD/WAVE beds own the bus. */
  stopPlaylist(): void {
    this.playlistActive = false
    this.detachPlaylistEnded()
    if (this.currentPlaylistSlug !== null) {
      this.stopMusic(this.currentPlaylistSlug)
      this.currentPlaylistSlug = null
    }
  }

  private advancePlaylist(): void {
    if (!this.playlistActive || this.playlist.length === 0) return
    this.playPlaylistTrack(this.pickNextPlaylistSlug())
  }

  private pickNextPlaylistSlug(): SfxSlug {
    const pool = this.playlist
    if (pool.length === 1) return pool[0]
    let next: SfxSlug
    do {
      next = pool[Math.floor(Math.random() * pool.length)]
    } while (next === this.currentPlaylistSlug)
    return next
  }

  private playPlaylistTrack(slug: SfxSlug): void {
    const src = this.sources.get(slug)
    if (!src || !SFX_DEFS[slug]) return
    this.currentPlaylistSlug = slug
    // loop=false so the element fires `ended`, which advances the playlist.
    // playMusic handles the crossfade-out of any other bed + the unlock queue.
    this.playMusic(slug, {}, false)
    this.detachPlaylistEnded()
    const fn = (): void => {
      this.detachPlaylistEnded()
      if (!this.playlistActive) return
      this.stopMusic(slug)
      this.advancePlaylist()
    }
    this.playlistEnded = { src, fn }
    src.addEventListener('ended', fn)
  }

  private detachPlaylistEnded(): void {
    if (this.playlistEnded) {
      this.playlistEnded.src.removeEventListener('ended', this.playlistEnded.fn)
      this.playlistEnded = null
    }
  }

  // ─── Music bed implementation ─────────────────────────────────────────

  private playMusic(slug: SfxSlug, opts: PlayOptions, loop = true): void {
    const def = SFX_DEFS[slug]
    const src = this.sources.get(slug)
    if (!src || !def) return

    // Already playing — cancel any in-flight fade-out (a previous
    // switch-away may have left a timer fading this bed toward 0 with an
    // onDone that would call stopMusic), rescale, and exit. Without the
    // clearInterval the bed gets silently removed mid-flight even though
    // the player just navigated back to it.
    const existing = this.musicBeds.get(slug)
    if (existing) {
      if (existing.fadeTimer !== null) {
        clearInterval(existing.fadeTimer)
        existing.fadeTimer = null
      }
      const baseVol = opts.volume ?? def.volume
      existing.targetVolume = baseVol
      existing.el.volume = this.effective(baseVol, def.bus)
      return
    }

    // Fade out every other bed (the audible "crossfade" lives on the outgoing
    // side — fading IN as well would require coupling test envs to rAF).
    for (const other of this.musicBeds.values()) {
      this.fadeMusic(other, 0, () => this.stopMusic(other.slug))
    }

    src.loop = loop
    const target = opts.volume ?? def.volume
    const bed: MusicBed = {
      slug, el: src,
      targetVolume: target,
      fadeTimer: null,
    }
    // Drop in at full target volume — no fade-in. The previous bed fades
    // out (above), so the transition is smooth on the outgoing side.
    src.volume = this.effective(target, def.bus)
    this.musicBeds.set(slug, bed)

    if (!this.unlocked) {
      this.pendingMusic.add(slug)
      return
    }
    this.pendingMusic.delete(slug)
    void src.play().catch(() => { /* autoplay blocked — silently ignore */ })
  }

  private stopMusic(slug: SfxSlug): void {
    const bed = this.musicBeds.get(slug)
    if (!bed) return
    if (bed.fadeTimer !== null) {
      clearInterval(bed.fadeTimer)
      bed.fadeTimer = null
    }
    try {
      bed.el.pause()
      bed.el.currentTime = 0
    } catch { /* ignore */ }
    this.musicBeds.delete(slug)
    this.pendingMusic.delete(slug)
  }

  /**
   * Linearly fade `bed.el.volume` toward `target` over FADE_MS, ticking on
   * setInterval (predictable across test envs and prod). Falls back to an
   * immediate assignment if setInterval is unavailable.
   */
  private fadeMusic(bed: MusicBed, target: number, onDone?: () => void): void {
    if (bed.fadeTimer !== null) {
      clearInterval(bed.fadeTimer)
      bed.fadeTimer = null
    }
    if (typeof setInterval === 'undefined') {
      bed.el.volume = clamp01(target)
      onDone?.()
      return
    }
    const start = performance.now()
    const from = bed.el.volume
    const stepMs = 16
    bed.fadeTimer = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / FADE_MS)
      bed.el.volume = clamp01(from + (target - from) * t)
      if (t >= 1) {
        if (bed.fadeTimer !== null) {
          clearInterval(bed.fadeTimer)
          bed.fadeTimer = null
        }
        onDone?.()
      }
    }, stepMs)
  }

  /** Re-apply mute/master/bus scaling to every live music bed. */
  private rescaleMusic(): void {
    for (const bed of this.musicBeds.values()) {
      const def = SFX_DEFS[bed.slug]
      const target = this.effective(bed.targetVolume, def.bus)
      // Direct write — no fade. Volume slider drags should feel immediate.
      if (bed.fadeTimer !== null) {
        clearInterval(bed.fadeTimer)
        bed.fadeTimer = null
      }
      bed.el.volume = target
    }
  }

  private effective(base: number, bus: SfxBus): number {
    if (this.muted) return 0
    return clamp01(base * this.busVolume[bus] * this.masterVolume)
  }

  private bindFirstGestureUnlock(): void {
    if (this.gestureBound || typeof window === 'undefined') return
    this.gestureBound = true
    this.gestureHandler = (): void => {
      this.unlocked = true
      window.removeEventListener('pointerdown', this.gestureHandler!, true)
      window.removeEventListener('keydown', this.gestureHandler!, true)
      this.gestureHandler = null
      // Kick off any music beds that were requested before the gesture.
      for (const slug of [...this.pendingMusic]) {
        const bed = this.musicBeds.get(slug)
        if (!bed) { this.pendingMusic.delete(slug); continue }
        const def = SFX_DEFS[slug]
        void bed.el.play().catch(() => { /* ignore */ })
        this.fadeMusic(bed, this.effective(bed.targetVolume, def.bus))
      }
      this.pendingMusic.clear()
    }
    window.addEventListener('pointerdown', this.gestureHandler, true)
    window.addEventListener('keydown', this.gestureHandler, true)
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** Process-wide singleton — the engine has exactly one audio surface. */
export const assetManager = new AssetManager()
