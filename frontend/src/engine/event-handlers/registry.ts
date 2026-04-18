/**
 * EVENT_HANDLER_REGISTRY — single source of truth for every EventBus
 * subscription in the frontend. When adding, removing, or moving a
 * `eventBus.on(...)` call anywhere in `frontend/src/`, update the matching
 * entry here. A missing or stale entry is a review-blocker.
 *
 * Addresses audit V-14: listeners were scattered across systems, composables
 * and stores, making it hard to answer "who reacts to event X?". This table
 * answers that question in one place.
 *
 * The registry is typed against `Events` so renaming/removing an event key
 * surfaces a compile error here.
 *
 * Conventions:
 *   - `module`  — path under `frontend/src/` where the subscription lives.
 *   - `handler` — method or brief description of what runs on the event.
 *   - `purpose` — why the subscription exists (one short clause).
 *   - Events with no listeners use `[]` — they are broadcast-only and the
 *     empty array is deliberate documentation, not an oversight.
 */
import { Events } from '@/data/constants'

export interface EventSubscriberEntry {
  readonly module: string
  readonly handler: string
  readonly purpose: string
}

type EventKey = keyof typeof Events

export const EVENT_HANDLER_REGISTRY: Readonly<
  Record<EventKey, readonly EventSubscriberEntry[]>
> = Object.freeze({
  // ── Phase / lifecycle ──
  PHASE_CHANGED: [
    { module: 'stores/gameStore',             handler: 'anonymous', purpose: 'Mirror phase into reactive store' },
    { module: 'composables/useSessionSync',   handler: 'anonymous', purpose: 'Detect game-over transition' },
    { module: 'systems/TowerPlacementSystem', handler: 'anonymous', purpose: 'Clear placement preview on phase change' },
  ],
  LEVEL_START: [
    { module: 'composables/useGameLoop',    handler: 'anonymous',   purpose: 'Generate path function for the level' },
    { module: 'composables/useSessionSync', handler: 'anonymous',   purpose: 'Create backend session + pin sessionGeneration' },
    { module: 'systems/BuffSystem',         handler: 'anonymous',   purpose: 'Reset buff tracking + revert tower-scoped buffs' },
    { module: 'systems/CombatSystem',       handler: 'anonymous',   purpose: 'Reset shield / combat transient state' },
    { module: 'stores/gameStore',           handler: 'anonymous',   purpose: 'Reset level-scoped UI state' },
  ],
  LEVEL_END: [
    { module: 'composables/useSessionSync', handler: 'endSession',  purpose: 'Finalize backend session' },
  ],
  GAME_OVER: [],

  // ── Build phase ──
  BUILD_PHASE_START: [],
  BUILD_PHASE_END:   [],
  TOWER_PLACED: [
    { module: 'composables/useGameLoop', handler: 'anonymous', purpose: 'UI feedback on tower placement' },
  ],
  TOWER_SELECTED: [
    { module: 'composables/useGameLoop', handler: 'anonymous', purpose: 'Open build/inspect panel' },
  ],
  TOWER_PARAMS_SET: [
    { module: 'systems/CombatSystem', handler: 'anonymous', purpose: 'Apply updated tower params' },
  ],
  CAST_SPELL: [],

  // ── Wave / enemies ──
  WAVE_START: [
    { module: 'systems/WaveSystem',   handler: '_startWave',  purpose: 'Load wave spawn queue + timers' },
    { module: 'systems/CombatSystem', handler: 'anonymous',   purpose: 'Reset per-wave cooldowns' },
    { module: 'stores/gameStore',     handler: 'anonymous',   purpose: 'Track current wave in store' },
  ],
  WAVE_END: [
    { module: 'composables/useSessionSync', handler: 'anonymous', purpose: 'Persist wave snapshot to backend (generation-guarded)' },
    { module: 'systems/BuffSystem',         handler: '_tickBuffs', purpose: 'Decrement buff durations, revert expired' },
  ],
  ENEMY_SPAWNED: [],
  ENEMY_KILLED: [
    { module: 'systems/EconomySystem', handler: 'anonymous', purpose: 'Award gold + score on kill' },
    { module: 'stores/gameStore',      handler: 'anonymous', purpose: 'Mirror kill count for UI' },
  ],
  ENEMY_REACHED_ORIGIN: [
    { module: 'systems/EconomySystem', handler: 'anonymous', purpose: 'Apply HP damage unless shielded' },
  ],
  TOWER_ATTACK: [],

  // ── Buff phase ──
  BUFF_PHASE_START: [
    { module: 'systems/BuffSystem', handler: '_drawCards', purpose: 'Draw buff/curse card options' },
  ],
  BUFF_CARDS_UPDATED: [
    { module: 'stores/gameStore', handler: 'anonymous', purpose: 'Mirror current card set to UI' },
  ],
  BUFF_CARD_SELECTED: [
    { module: 'systems/BuffSystem', handler: '_applyCard', purpose: 'Apply selected buff / curse' },
  ],
  BUFF_RESULT:      [],
  BUFF_PHASE_END:   [],

  // ── Boss shield ──
  BOSS_SHIELD_START: [
    { module: 'composables/useGameLoop', handler: 'anonymous', purpose: 'Sync shield target to UI store' },
  ],
  BOSS_SHIELD_ATTEMPT: [
    { module: 'systems/CombatSystem', handler: 'anonymous', purpose: 'Evaluate match + break shield' },
  ],
  BOSS_SHIELD_END: [
    { module: 'composables/useGameLoop', handler: 'anonymous', purpose: 'Clear shield UI state' },
  ],

  // ── Resource mirrors ──
  GOLD_CHANGED:  [{ module: 'stores/gameStore', handler: 'anonymous', purpose: 'Mirror gold to reactive store' }],
  HP_CHANGED:    [{ module: 'stores/gameStore', handler: 'anonymous', purpose: 'Mirror HP to reactive store' }],
  SCORE_CHANGED: [{ module: 'stores/gameStore', handler: 'anonymous', purpose: 'Mirror score to reactive store' }],

  // ── Input ──
  CANVAS_CLICK: [
    { module: 'systems/TowerPlacementSystem', handler: '_handleClick', purpose: 'Place tower on valid cell' },
  ],
  CANVAS_HOVER: [
    { module: 'systems/TowerPlacementSystem', handler: 'anonymous', purpose: 'Update placement preview' },
  ],
})

/**
 * Modules that own EventBus subscriptions. Helpful when auditing cleanup —
 * every entry here must also dispose its subscriptions on unmount / destroy.
 */
export const EVENT_SUBSCRIBER_MODULES = Object.freeze([
  'composables/useGameLoop',      // Vue onUnmounted
  'composables/useSessionSync',   // Vue onUnmounted
  'stores/gameStore',             // unbindEngine()
  'systems/BuffSystem',           // destroy()
  'systems/CombatSystem',         // destroy()
  'systems/EconomySystem',        // destroy()
  'systems/TowerPlacementSystem', // destroy()
  'systems/WaveSystem',           // destroy()
] as const)
