/**
 * AssetManager — Pedagogical Backlog §15 (Audio Land).
 *
 * Loads the minimal SFX set + BUILD-phase ambient loop, gates playback on the
 * Chromium autoplay policy (HTMLAudioElement.play() rejects until the first
 * user gesture), and exposes mute/volume controls bridged to uiStore.
 *
 * Design notes:
 *   - HTMLAudioElement (not WebAudio) — §15.5 calls out mocking `Audio`, and
 *     the SFX set is small enough that the latency cost is irrelevant.
 *   - Cloning the source on each play() keeps overlapping SFX (rapid kills)
 *     from cutting each other off — a single element would re-seek to 0.
 *   - The ambient loop keeps a single element so we can stop it cleanly when
 *     the BUILD phase ends.
 *   - All mutations of the unlock/mute/volume state are idempotent so the
 *     uiStore can re-sync at any time.
 */
import { SFX_DEFS, type SfxSlug } from './sfx-defs'

export interface PlayOptions {
  /** Per-call override of the SfxDef default volume (still scaled by master). */
  volume?: number
}

export class AssetManager {
  private sources = new Map<SfxSlug, HTMLAudioElement>()
  private ambient: HTMLAudioElement | null = null
  private ambientPending = false
  private masterVolume = 1.0
  private muted = false
  private unlocked = false
  private loaded = false
  private gestureBound = false
  private gestureHandler: (() => void) | null = null

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
   * Fire-and-forget SFX trigger. For looping slugs (ambient) keeps a single
   * instance so it can be stopped; for one-shots, clones the source so
   * overlapping plays don't truncate each other.
   */
  play(slug: SfxSlug, opts: PlayOptions = {}): void {
    const def = SFX_DEFS[slug]
    if (!def) return
    const src = this.sources.get(slug)
    if (!src) return

    const baseVolume = opts.volume ?? def.volume
    const effective = this.muted ? 0 : Math.max(0, Math.min(1, baseVolume * this.masterVolume))

    if (def.loop) {
      // Reuse the single ambient element so stop() can target it.
      if (this.ambient && this.ambient !== src) {
        try { this.ambient.pause() } catch { /* ignore */ }
      }
      this.ambient = src
      src.loop = true
      src.volume = effective
      if (!this.unlocked) {
        // Defer until the first user gesture — playing now would reject and
        // log a Chromium console warning on every BUILD phase.
        this.ambientPending = true
        return
      }
      this.ambientPending = false
      void src.play().catch(() => { /* autoplay blocked — silently ignore */ })
      return
    }

    if (!this.unlocked) return

    // Clone so overlapping triggers (e.g. multiple kills in one frame) layer.
    const clone = src.cloneNode(true) as HTMLAudioElement
    clone.volume = effective
    void clone.play().catch(() => { /* user-gesture race — ignore */ })
  }

  /** Stop a looping slug (only meaningful for `ambient-build`). */
  stop(slug: SfxSlug): void {
    const src = this.sources.get(slug)
    if (!src) return
    try {
      src.pause()
      src.currentTime = 0
    } catch { /* ignore */ }
    if (this.ambient === src) {
      this.ambient = null
      this.ambientPending = false
    }
  }

  /** Master volume in [0, 1]. Applied multiplicatively to each SfxDef.volume. */
  setVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v))
    this.applyAmbientVolume()
  }

  mute(m: boolean): void {
    this.muted = m
    this.applyAmbientVolume()
  }

  /** Test/debug accessor — not part of the §15.3 spec but cheap to expose. */
  get isUnlocked(): boolean { return this.unlocked }

  private applyAmbientVolume(): void {
    if (!this.ambient) return
    const def = SFX_DEFS['ambient-build']
    this.ambient.volume = this.muted ? 0 : Math.max(0, Math.min(1, def.volume * this.masterVolume))
  }

  private bindFirstGestureUnlock(): void {
    if (this.gestureBound || typeof window === 'undefined') return
    this.gestureBound = true
    this.gestureHandler = (): void => {
      this.unlocked = true
      window.removeEventListener('pointerdown', this.gestureHandler!, true)
      window.removeEventListener('keydown', this.gestureHandler!, true)
      this.gestureHandler = null
      // If a BUILD phase already requested ambient, kick it off now.
      if (this.ambientPending && this.ambient) {
        this.ambientPending = false
        void this.ambient.play().catch(() => { /* ignore */ })
      }
    }
    window.addEventListener('pointerdown', this.gestureHandler, true)
    window.addEventListener('keydown', this.gestureHandler, true)
  }
}

/** Process-wide singleton — the engine has exactly one audio surface. */
export const assetManager = new AssetManager()
