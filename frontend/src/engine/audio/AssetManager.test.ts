/**
 * Pedagogical Backlog §15.5 — AssetManager unit tests.
 *
 * Runs under happy-dom; we stub the global `Audio` constructor with a fake
 * that records play()/volume/loop interactions. The real DOM `<audio>` in
 * happy-dom is half-implemented and would silently swallow play() calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetManager } from './AssetManager'
import { SFX_DEFS } from './sfx-defs'

interface FakeAudio {
  src: string
  volume: number
  loop: boolean
  preload: string
  paused: boolean
  currentTime: number
  playbackRate: number
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  cloneNode: (deep?: boolean) => FakeAudio
  addEventListener: (ev: string, fn: () => void) => void
  removeEventListener: (ev: string, fn: () => void) => void
  __listeners: Record<string, Set<() => void>>
}

const allInstances: FakeAudio[] = []

function makeFakeAudio(src = ''): FakeAudio {
  const inst: FakeAudio = {
    src,
    volume: 1,
    loop: false,
    preload: '',
    paused: true,
    currentTime: 0,
    playbackRate: 1,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    cloneNode: (_deep?: boolean) => {
      const clone = makeFakeAudio(inst.src)
      clone.volume = inst.volume
      clone.loop = inst.loop
      clone.playbackRate = inst.playbackRate
      return clone
    },
    addEventListener: (ev, fn) => {
      if (!inst.__listeners[ev]) inst.__listeners[ev] = new Set()
      inst.__listeners[ev].add(fn)
    },
    removeEventListener: (ev, fn) => {
      inst.__listeners[ev]?.delete(fn)
    },
    __listeners: {},
  }
  allInstances.push(inst)
  return inst
}

// `new Audio(src)` requires a constructable target — a vi.fn() returning a
// plain object isn't constructable, so we wrap a class that records calls
// and delegates instance shape to makeFakeAudio.
const ctorCalls: string[] = []
class FakeAudio {
  constructor(src?: string) {
    ctorCalls.push(src ?? '')
    return makeFakeAudio(src ?? '') as unknown as FakeAudio
  }
}

beforeEach(() => {
  allInstances.length = 0
  ctorCalls.length = 0
  ;(globalThis as unknown as { Audio: typeof FakeAudio }).Audio = FakeAudio
})

afterEach(() => {
  delete (globalThis as Partial<{ Audio: unknown }>).Audio
})

function fireLoaded(): void {
  for (const a of allInstances) {
    a.__listeners['loadedmetadata']?.forEach((fn) => fn())
  }
}

function unlock(): void {
  // The AssetManager binds `pointerdown` / `keydown` capture-phase listeners
  // on `window`. happy-dom's Window dispatches synthetic events, so a
  // PointerEvent is enough to trip the gesture handler.
  window.dispatchEvent(new Event('pointerdown'))
}

describe('AssetManager', () => {
  it('load() instantiates one Audio per slug with the right URL', async () => {
    const am = new AssetManager()
    const p = am.load()
    fireLoaded()
    await p
    const slugs = Object.keys(SFX_DEFS)
    expect(ctorCalls).toHaveLength(slugs.length)
    for (const slug of slugs) {
      const def = SFX_DEFS[slug as keyof typeof SFX_DEFS]
      expect(allInstances.some((a) => a.src === def.url)).toBe(true)
    }
  })

  it('play(slug) requires a user gesture before audible output', async () => {
    const am = new AssetManager()
    const p = am.load()
    fireLoaded()
    await p
    am.play('kill')
    // Before unlock, no clone should have been instantiated/played.
    const sourceCount = Object.keys(SFX_DEFS).length
    expect(ctorCalls).toHaveLength(sourceCount)
    unlock()
    am.play('kill')
    // After unlock, a clone is created and played.
    expect(ctorCalls).toHaveLength(sourceCount) // clones don't go through ctor
    const lastClone = allInstances[allInstances.length - 1]
    expect(lastClone.play).toHaveBeenCalled()
  })

  it('one-shot play() clones the source so overlapping triggers layer', async () => {
    const am = new AssetManager()
    const p = am.load()
    fireLoaded()
    await p
    unlock()
    const killSource = allInstances.find((a) => a.src === SFX_DEFS.kill.url)!
    const cloneSpy = vi.spyOn(killSource, 'cloneNode')
    am.play('kill')
    am.play('kill')
    am.play('kill')
    expect(cloneSpy).toHaveBeenCalledTimes(3)
  })

  it('ambient loop reuses the single source and stop() pauses it', async () => {
    const am = new AssetManager()
    const p = am.load()
    fireLoaded()
    await p
    unlock()
    const ambient = allInstances.find((a) => a.src === SFX_DEFS['ambient-build'].url)!
    am.play('ambient-build')
    expect(ambient.play).toHaveBeenCalledTimes(1)
    expect(ambient.loop).toBe(true)
    am.stop('ambient-build')
    expect(ambient.pause).toHaveBeenCalled()
  })

  it('ambient queued before unlock kicks off on first gesture', async () => {
    const am = new AssetManager()
    const p = am.load()
    fireLoaded()
    await p
    am.play('ambient-build')
    const ambient = allInstances.find((a) => a.src === SFX_DEFS['ambient-build'].url)!
    expect(ambient.play).not.toHaveBeenCalled()
    unlock()
    expect(ambient.play).toHaveBeenCalledTimes(1)
  })

  it('mute(true) zeroes the effective volume of new plays and the ambient bed', async () => {
    const am = new AssetManager()
    const p = am.load()
    fireLoaded()
    await p
    unlock()
    am.play('ambient-build')
    const ambient = allInstances.find((a) => a.src === SFX_DEFS['ambient-build'].url)!
    expect(ambient.volume).toBeGreaterThan(0)
    am.mute(true)
    expect(ambient.volume).toBe(0)
    am.play('kill')
    const lastClone = allInstances[allInstances.length - 1]
    expect(lastClone.volume).toBe(0)
  })

  it('setVolume() rescales the ambient bed live', async () => {
    const am = new AssetManager()
    const p = am.load()
    fireLoaded()
    await p
    unlock()
    am.setVolume(1.0)
    am.setBusVolume('music', 1.0)
    am.play('ambient-build')
    const ambient = allInstances.find((a) => a.src === SFX_DEFS['ambient-build'].url)!
    const fullVol = ambient.volume
    am.setVolume(0.5)
    expect(ambient.volume).toBeCloseTo(fullVol * 0.5, 5)
  })

  it('setBusVolume() scales SFX on the matching bus only', async () => {
    const am = new AssetManager()
    const p = am.load()
    fireLoaded()
    await p
    unlock()
    am.setVolume(1.0)
    am.setBusVolume('sfx', 1.0)
    am.setBusVolume('ui', 1.0)

    // Use tower-place (no jitter) for deterministic ratio assertions.
    am.play('tower-place')
    const sfxFull = allInstances[allInstances.length - 1].volume

    am.setBusVolume('sfx', 0.5)
    am.play('tower-place')
    const sfxHalved = allInstances[allInstances.length - 1].volume
    expect(sfxHalved).toBeCloseTo(sfxFull * 0.5, 5)

    // UI bus is independent — ui-confirm (no jitter, no throttle) still full.
    am.play('ui-confirm')
    const uiClone = allInstances[allInstances.length - 1]
    expect(uiClone.volume).toBeGreaterThan(0)
  })

  it('polyphonyCap evicts the oldest active clone', async () => {
    const am = new AssetManager()
    const p = am.load()
    fireLoaded()
    await p
    unlock()
    // kill has polyphonyCap: 6 — fire 8 in quick succession, expect the
    // earliest 2 to have been pause()d by eviction.
    const evicted: FakeAudio[] = []
    for (let i = 0; i < 8; i++) {
      am.play('kill')
      const clone = allInstances[allInstances.length - 1]
      if (i < 2) evicted.push(clone as unknown as FakeAudio)
    }
    for (const c of evicted) {
      expect(c.pause).toHaveBeenCalled()
    }
  })

  it('minIntervalMs drops triggers fired too soon after the previous one', async () => {
    const am = new AssetManager()
    const p = am.load()
    fireLoaded()
    await p
    unlock()
    // ui-click has minIntervalMs: 40 — back-to-back calls drop the second.
    const countBefore = allInstances.length
    am.play('ui-click')
    am.play('ui-click')  // dropped — same frame
    am.play('ui-click')  // dropped
    const created = allInstances.length - countBefore
    expect(created).toBe(1)
  })

  it('pitchJitter randomises playbackRate around 1.0 within bounds', async () => {
    const am = new AssetManager()
    const p = am.load()
    fireLoaded()
    await p
    unlock()
    // kill has pitchJitter: 0.1 — playbackRate must land in [0.9, 1.1].
    const rates: number[] = []
    for (let i = 0; i < 8; i++) {
      am.play('kill')
      rates.push(allInstances[allInstances.length - 1].playbackRate)
    }
    for (const r of rates) {
      expect(r).toBeGreaterThanOrEqual(0.9 - 1e-6)
      expect(r).toBeLessThanOrEqual(1.1 + 1e-6)
    }
    // With 8 samples and ±10% jitter, at least one should differ from 1.0.
    expect(rates.some((r) => Math.abs(r - 1) > 1e-9)).toBe(true)
  })

  it('switching music slugs starts the new bed and fades out the previous one', async () => {
    vi.useFakeTimers()
    try {
      const am = new AssetManager()
      const p = am.load()
      fireLoaded()
      await p
      unlock()
      am.play('ambient-build')
      const build = allInstances.find((a) => a.src === SFX_DEFS['ambient-build'].url)!
      expect(build.play).toHaveBeenCalledTimes(1)
      am.play('ambient-wave')
      const wave = allInstances.find((a) => a.src === SFX_DEFS['ambient-wave'].url)!
      expect(wave.play).toHaveBeenCalledTimes(1)
      // Crossfade is driven by setInterval — advance past FADE_MS to land
      // the onDone callback that pauses the outgoing bed.
      vi.advanceTimersByTime(400)
      expect(build.pause).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stopAllMusic() pauses every active music bed', async () => {
    const am = new AssetManager()
    const p = am.load()
    fireLoaded()
    await p
    unlock()
    am.play('ambient-build')
    am.stopAllMusic()
    const build = allInstances.find((a) => a.src === SFX_DEFS['ambient-build'].url)!
    expect(build.pause).toHaveBeenCalled()
  })

  it('switching back to a fading-out bed cancels the pending stopMusic', async () => {
    vi.useFakeTimers()
    try {
      const am = new AssetManager()
      const p = am.load()
      fireLoaded()
      await p
      unlock()
      am.play('ambient-build')
      const build = allInstances.find((a) => a.src === SFX_DEFS['ambient-build'].url)!
      // Switch away: build starts fading out toward 0 with onDone = stop.
      am.play('ambient-wave')
      // Advance partway through the fade — not enough to complete.
      vi.advanceTimersByTime(100)
      // Switch back before fade completes. The fade-out's onDone must NOT
      // fire after this point, or build's element gets pause()d behind us.
      am.play('ambient-build')
      vi.advanceTimersByTime(500)  // well past FADE_MS
      expect(build.pause).not.toHaveBeenCalled()
      // Volume should be at the rescaled target, not 0.
      expect(build.volume).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stopAllMusic() is a no-op when nothing is playing', async () => {
    const am = new AssetManager()
    const p = am.load()
    fireLoaded()
    await p
    expect(() => am.stopAllMusic()).not.toThrow()
  })
})
