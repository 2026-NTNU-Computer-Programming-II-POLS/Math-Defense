/**
 * SFX definitions — Pedagogical Backlog §15.2 (extended audio pass).
 *
 * Slug → SfxDef mapping consumed by AssetManager. The extended set covers
 * full tower-defense feedback: UI affordances, build/combat/wave flow, and
 * a music bed that cross-fades between BUILD and WAVE phases.
 *
 * Asset licensing: only CC0 / self-recorded / synthesised content. Files are
 * procedurally synthesised by `frontend/scripts/synth-audio.py`, so the repo
 * carries no third-party audio licence.
 *
 * Bus model (see AssetManager):
 *   - 'music': long-running ambient beds; obey music volume + master.
 *   - 'sfx'  : gameplay events (kills, attacks, spells); obey sfx volume + master.
 *   - 'ui'   : button clicks, hovers, settings affordances; obey ui volume + master.
 *
 * Variation knobs:
 *   - polyphonyCap : max concurrent clones for one-shots; older clones evict.
 *   - minIntervalMs: minimum spacing between successive plays of the slug.
 *   - pitchJitter  : random playbackRate scale in [1 - j, 1 + j].
 *   - volumeJitter : random multiplicative gain in [1 - j, 1 + j].
 */

export type SfxSlug =
  // Legacy slugs (kept for backward-compat with persisted prefs + tests)
  | 'cast-spell'
  | 'kill'
  | 'wave-end'
  | 'mh-reveal'
  | 'achievement'
  | 'ambient-build'
  // UI affordances
  | 'ui-click'
  | 'ui-hover'
  | 'ui-confirm'
  | 'ui-cancel'
  // Build / economy
  | 'tower-place'
  | 'tower-upgrade'
  | 'tower-refund'
  | 'tower-select'
  // Combat
  | 'tower-attack-light'
  | 'tower-attack-heavy'
  // Enemy lifecycle
  | 'enemy-spawn'
  | 'boss-spawn'
  | 'enemy-reached'
  // Wave / level flow
  | 'wave-start'
  | 'level-victory'
  | 'game-over'
  // Music bed for WAVE phase (mirror of ambient-build for BUILD)
  | 'ambient-wave'

export type SfxBus = 'music' | 'sfx' | 'ui'

export interface SfxDef {
  url: string
  /** Default mix volume in [0, 1]. Multiplied by master × bus volume. */
  volume: number
  /** Bus assignment. Determines which volume slider scales the slug. */
  bus: SfxBus
  /** Whether the asset loops on play. Used for music beds. */
  loop?: boolean
  /** Max concurrent clones; older clones are evicted (paused). Default 4. */
  polyphonyCap?: number
  /** Minimum ms between successive triggers of this slug. Default 0. */
  minIntervalMs?: number
  /** Random playbackRate scale ±j applied per trigger. Default 0. */
  pitchJitter?: number
  /** Random volume scale ±j applied per trigger. Default 0. */
  volumeJitter?: number
}

export const SFX_DEFS: Record<SfxSlug, SfxDef> = {
  // ─── Music beds ────────────────────────────────────────────────────────
  'ambient-build': { url: '/audio/ambient-build.wav', volume: 0.3, bus: 'music', loop: true },
  'ambient-wave':  { url: '/audio/ambient-wave.wav',  volume: 0.32, bus: 'music', loop: true },

  // ─── UI ────────────────────────────────────────────────────────────────
  'ui-click':   { url: '/audio/ui-click.wav',   volume: 0.4,  bus: 'ui', polyphonyCap: 3, minIntervalMs: 40, pitchJitter: 0.03 },
  'ui-hover':   { url: '/audio/ui-hover.wav',   volume: 0.18, bus: 'ui', polyphonyCap: 2, minIntervalMs: 80 },
  'ui-confirm': { url: '/audio/ui-confirm.wav', volume: 0.55, bus: 'ui' },
  'ui-cancel':  { url: '/audio/ui-cancel.wav',  volume: 0.45, bus: 'ui' },

  // ─── Build / economy ───────────────────────────────────────────────────
  'tower-place':   { url: '/audio/tower-place.wav',   volume: 0.6,  bus: 'sfx' },
  'tower-upgrade': { url: '/audio/tower-upgrade.wav', volume: 0.65, bus: 'sfx' },
  'tower-refund':  { url: '/audio/tower-refund.wav',  volume: 0.5,  bus: 'sfx' },
  'tower-select':  { url: '/audio/tower-select.wav',  volume: 0.35, bus: 'sfx', minIntervalMs: 100, pitchJitter: 0.04 },

  // ─── Spell / combat ────────────────────────────────────────────────────
  'cast-spell': { url: '/audio/cast-spell.wav', volume: 0.6, bus: 'sfx' },
  'tower-attack-light': {
    url: '/audio/tower-attack-light.wav', volume: 0.22, bus: 'sfx',
    polyphonyCap: 6, minIntervalMs: 55, pitchJitter: 0.08, volumeJitter: 0.15,
  },
  'tower-attack-heavy': {
    url: '/audio/tower-attack-heavy.wav', volume: 0.32, bus: 'sfx',
    polyphonyCap: 3, minIntervalMs: 120, pitchJitter: 0.05,
  },

  // ─── Enemy lifecycle ───────────────────────────────────────────────────
  'kill': {
    url: '/audio/kill.wav', volume: 0.4, bus: 'sfx',
    polyphonyCap: 6, pitchJitter: 0.1, volumeJitter: 0.15,
  },
  'enemy-spawn': {
    url: '/audio/enemy-spawn.wav', volume: 0.28, bus: 'sfx',
    polyphonyCap: 2, minIntervalMs: 220, pitchJitter: 0.08,
  },
  'boss-spawn':    { url: '/audio/boss-spawn.wav',    volume: 0.7,  bus: 'sfx' },
  'enemy-reached': { url: '/audio/enemy-reached.wav', volume: 0.55, bus: 'sfx', minIntervalMs: 250 },

  // ─── Flow ──────────────────────────────────────────────────────────────
  'wave-start':    { url: '/audio/wave-start.wav',    volume: 0.65, bus: 'sfx' },
  'wave-end':      { url: '/audio/wave-end.wav',      volume: 0.7,  bus: 'sfx' },
  'level-victory': { url: '/audio/level-victory.wav', volume: 0.8,  bus: 'sfx' },
  'game-over':     { url: '/audio/game-over.wav',     volume: 0.75, bus: 'sfx' },
  'mh-reveal':     { url: '/audio/mh-reveal.wav',     volume: 0.7,  bus: 'sfx' },
  'achievement':   { url: '/audio/achievement.wav',   volume: 0.8,  bus: 'sfx' },
}

/** Slugs that loop forever (music beds). Used by AssetManager for crossfade. */
export const MUSIC_SLUGS: ReadonlyArray<SfxSlug> =
  (Object.keys(SFX_DEFS) as SfxSlug[]).filter((s) => SFX_DEFS[s].loop === true)
