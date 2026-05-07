/**
 * SFX definitions — Pedagogical Backlog §15.2.
 *
 * Slug → URL + default volume mapping consumed by AssetManager.
 *
 * Asset licensing: only CC0 / self-recorded / synthesised content. The shipped
 * files are procedurally synthesised so the repo carries no third-party audio
 * licence. See `frontend/public/audio/README.md` for re-generation steps.
 *
 * Format note: §15.2 lists `.mp3` slugs, but the synthesiser script ships
 * `.wav` (uncompressed PCM) since the build toolchain has no MP3 encoder.
 * File sizes are a few hundred KB total — well below the network budget the
 * spec implies.
 */

export type SfxSlug =
  | 'cast-spell'
  | 'kill'
  | 'wave-end'
  | 'mh-reveal'
  | 'achievement'
  | 'ambient-build'

export interface SfxDef {
  url: string
  /** Default mix volume in [0, 1]. Multiplied by the master volume. */
  volume: number
  /** Whether the asset loops on play. Used for the BUILD-phase ambient bed. */
  loop?: boolean
}

export const SFX_DEFS: Record<SfxSlug, SfxDef> = {
  'cast-spell':    { url: '/audio/cast-spell.wav',    volume: 0.6 },
  'kill':          { url: '/audio/kill.wav',          volume: 0.4 },
  'wave-end':      { url: '/audio/wave-end.wav',      volume: 0.7 },
  'mh-reveal':     { url: '/audio/mh-reveal.wav',     volume: 0.7 },
  'achievement':   { url: '/audio/achievement.wav',   volume: 0.8 },
  'ambient-build': { url: '/audio/ambient-build.wav', volume: 0.3, loop: true },
}
