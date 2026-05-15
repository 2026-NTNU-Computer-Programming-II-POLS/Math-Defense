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
 * surfaces a compile error here. Subscription counts are enforced at CI time
 * by `scripts/event-registry-check.ts` (npm run event-registry-check), which
 * walks production source for `eventBus.on(Events.X, ...)` calls and fails on
 * any drift — added subscriptions, removed subscriptions, or unknown events.
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
    { module: 'stores/gameStore',                  handler: 'anonymous', purpose: 'Mirror phase into reactive store' },
    { module: 'composables/useSessionSync',        handler: 'anonymous', purpose: 'Detect game-over transition' },
    { module: 'composables/useEngineAudio',        handler: 'anonymous', purpose: 'Trigger phase-transition SFX' },
    { module: 'composables/useEngineUiBridges',    handler: 'anonymous', purpose: 'Bridge phase changes to UI store' },
    { module: 'systems/TowerPlacementSystem',      handler: 'anonymous', purpose: 'Clear placement preview on phase change' },
    { module: 'composables/useKeyboardPlacement',  handler: 'anonymous', purpose: 'Show/hide keyboard cursor on BUILD entry/exit (§19)' },
  ],
  LEVEL_START: [
    { module: 'composables/useGameLoop',            handler: 'anonymous', purpose: 'Generate path function for the level' },
    { module: 'composables/useSessionSync',         handler: 'anonymous', purpose: 'Create backend session + pin sessionGeneration' },
    { module: 'composables/usePrincipleOverlay',    handler: 'anonymous', purpose: 'Reset principle overlay state per level' },
    { module: 'composables/useKeyboardPlacement',   handler: 'anonymous', purpose: 'Recompute LegalPositionSet + reset cursor (§19)' },
    { module: 'stores/gameStore',                   handler: 'anonymous', purpose: 'Reset level-scoped UI state' },
    { module: 'renderers/SpellEffectRenderer',      handler: 'anonymous', purpose: 'Clear active spell effects on level start' },
    { module: 'views/ReplayView',                   handler: 'anonymous', purpose: 'Reset replay UI state on level start' },
    { module: 'systems/BuffSystem',                 handler: 'anonymous', purpose: 'Reset buff tracking + revert tower-scoped buffs' },
    { module: 'systems/MontyHallSystem',            handler: 'anonymous', purpose: 'Reset Monty Hall trigger state per level' },
    { module: 'systems/SpellSystem',                handler: 'anonymous', purpose: 'Reset spell cooldowns per level' },
    { module: 'systems/MatrixTowerSystem',          handler: 'anonymous', purpose: 'Reset matrix-pair state per level' },
    { module: 'systems/LimitTowerSystem',           handler: 'anonymous', purpose: 'Reset limit-tower answer state per level' },
    { module: 'systems/RadarTowerSystem',           handler: 'anonymous', purpose: 'Reset radar-tower transient state per level' },
    { module: 'systems/TowerPlacementSystem',       handler: 'anonymous', purpose: 'Recompute placement constraints per level' },
    { module: 'systems/EconomySystem',              handler: 'anonymous', purpose: 'Reset per-level economy counters' },
    { module: 'renderers/CombatFeedbackRenderer',   handler: 'anonymous', purpose: 'Clear floating combat text on level start' },
  ],
  LEVEL_END: [
    { module: 'composables/useSessionSync', handler: 'endSession',  purpose: 'Finalize backend session' },
    { module: 'composables/useGameLoop',    handler: 'anonymous',   purpose: 'Stop loop and surface end-of-level UI' },
    { module: 'composables/useEngineAudio', handler: 'anonymous',   purpose: 'Trigger level-victory SFX' },
  ],
  GAME_OVER: [
    { module: 'composables/useEngineAudio', handler: 'anonymous', purpose: 'Trigger game-over SFX' },
  ],

  // ── Build phase ──
  BUILD_PHASE_START: [],
  BUILD_PHASE_END:   [],
  TOWER_PLACED: [
    { module: 'composables/useEngineUiBridges',     handler: 'anonymous', purpose: 'UI feedback on tower placement' },
    { module: 'composables/useEngineAudio',         handler: 'anonymous', purpose: 'Trigger tower-place SFX' },
    { module: 'systems/MatrixTowerSystem',          handler: 'anonymous', purpose: 'Auto-pair newly placed Matrix towers' },
    { module: 'systems/TowerInterferenceSystem',    handler: 'anonymous', purpose: 'Recompute same-type interference factors so the BUILD preview is correct' },
  ],
  TOWER_SELECTED: [
    { module: 'composables/useEngineUiBridges', handler: 'anonymous', purpose: 'Open build/inspect panel' },
    { module: 'composables/useEngineAudio',     handler: 'anonymous', purpose: 'Trigger tower-select SFX' },
  ],
  TOWER_PARAMS_SET: [],
  CAST_SPELL: [],

  // ── Wave / enemies ──
  WAVE_START: [
    { module: 'systems/WaveSystem',              handler: '_startWave',  purpose: 'Load wave spawn queue + timers' },
    { module: 'systems/CombatSystem',            handler: 'anonymous',   purpose: 'Reset per-wave cooldowns' },
    { module: 'stores/gameStore',                handler: 'anonymous',   purpose: 'Track current wave in store' },
    { module: 'systems/TowerInterferenceSystem', handler: 'anonymous',   purpose: 'Mark interference dirty so factors recompute at wave start' },
    { module: 'composables/useEngineAudio',      handler: 'anonymous',   purpose: 'Trigger wave-start SFX' },
  ],
  WAVE_END: [
    { module: 'composables/useSessionSync',     handler: 'anonymous',  purpose: 'Persist wave snapshot to backend (generation-guarded)' },
    { module: 'composables/usePrincipleOverlay',handler: 'anonymous',  purpose: 'Surface end-of-wave principle overlay' },
    { module: 'composables/useEngineAudio',     handler: 'anonymous',  purpose: 'Trigger wave-end SFX' },
    { module: 'stores/gameStore',               handler: 'anonymous',  purpose: 'Mirror wave snapshot to reactive store' },
    { module: 'systems/EconomySystem',          handler: 'anonymous',  purpose: 'Award wave-completion bonus' },
  ],
  ENEMY_SPAWNED: [
    { module: 'stores/gameStore',                  handler: 'anonymous', purpose: 'Mirror live enemy count for UI' },
    { module: 'systems/EnemyAbilitySystem',        handler: 'anonymous', purpose: 'Initialize per-enemy ability state on spawn' },
    { module: 'composables/useFirstEncounterCards', handler: 'onSpawn',   purpose: 'Queue first-encounter card + soft-pause on first sighting of a counter-enemy' },
    { module: 'composables/useEngineAudio',        handler: 'anonymous', purpose: 'Trigger enemy-spawn or boss-spawn SFX' },
  ],
  ENEMY_KILLED: [
    { module: 'composables/useEngineAudio', handler: 'anonymous', purpose: 'Trigger kill SFX' },
    { module: 'stores/gameStore',           handler: 'anonymous', purpose: 'Mirror kill count for UI' },
    { module: 'systems/EconomySystem',      handler: 'anonymous', purpose: 'Award gold + score on kill' },
    { module: 'systems/EnemyAbilitySystem', handler: 'anonymous', purpose: 'Trigger on-kill ability effects (split, etc.)' },
  ],
  ENEMY_REACHED_ORIGIN: [
    { module: 'stores/gameStore',          handler: 'anonymous', purpose: 'Mirror leak count for UI' },
    { module: 'systems/EconomySystem',     handler: 'anonymous', purpose: 'Apply HP damage unless shielded' },
    { module: 'composables/useEngineAudio', handler: 'anonymous', purpose: 'Trigger enemy-reached SFX' },
  ],
  TOWER_ATTACK: [
    { module: 'composables/useEngineAudio', handler: 'anonymous', purpose: 'Trigger heavy or light attack SFX based on tower type' },
  ],
  DAMAGE_RESOLVED: [
    { module: 'renderers/CombatFeedbackRenderer', handler: 'anonymous', purpose: 'Spawn floating combat text for a defensively-modified hit' },
  ],

  // ── Buff phase ──
  BUFF_PHASE_START:   [],
  BUFF_CARDS_UPDATED: [],
  BUFF_CARD_SELECTED: [],
  BUFF_RESULT:      [],
  BUFF_PHASE_END:   [],


  // ── Resource mirrors ──
  GOLD_CHANGED:  [{ module: 'stores/gameStore', handler: 'anonymous', purpose: 'Mirror gold to reactive store' }],
  HP_CHANGED:    [{ module: 'stores/gameStore', handler: 'anonymous', purpose: 'Mirror HP to reactive store' }],
  SCORE_CHANGED: [
    { module: 'stores/gameStore', handler: 'anonymous', purpose: 'Mirror score to reactive store' },
    { module: 'views/ReplayView', handler: 'anonymous', purpose: 'Mirror score in replay UI' },
  ],

  // ── Input ──
  CANVAS_CLICK: [
    { module: 'systems/TowerPlacementSystem', handler: '_handleClick', purpose: 'Place tower on valid cell' },
    { module: 'components/game/SpellBar',     handler: 'anonymous',    purpose: 'Resolve spell-target click while a spell is armed' },
  ],
  CANVAS_HOVER: [
    { module: 'systems/TowerPlacementSystem', handler: 'anonymous', purpose: 'Update placement preview' },
  ],

  // ── Piecewise paths (construction plan Phase 3) ──
  SEGMENT_CHANGED: [
    { module: 'engine/projections/project-path-panel', handler: 'anonymous', purpose: 'Recompute projected path panel when active segment changes' },
  ],
  PLACEMENT_REJECTED: [
    { module: 'composables/useEngineAudio', handler: 'anonymous', purpose: 'Trigger cancel SFX on rejected placement' },
  ],

  // ── V2 tower events ──
  MAGIC_FUNCTION_SELECTED: [
    { module: 'systems/MagicTowerSystem', handler: 'anonymous', purpose: 'Store player-entered expression on tower' },
  ],
  MAGIC_MODE_CHANGED: [
    { module: 'systems/MagicTowerSystem', handler: 'anonymous', purpose: 'Toggle debuff/buff mode on magic tower' },
  ],
  RADAR_ARC_CHANGED: [
    { module: 'systems/RadarTowerSystem', handler: 'anonymous', purpose: 'Update arc parameters on radar tower' },
  ],
  TOWER_TARGETING_CHANGED: [
    { module: 'systems/RadarTowerSystem', handler: 'anonymous', purpose: 'Update targeting mode on RADAR_B / RADAR_C tower' },
  ],
  MATRIX_PAIR_CHANGED: [
    { module: 'systems/MatrixTowerSystem', handler: 'anonymous', purpose: 'Update matrix pair id on tower' },
  ],
  LIMIT_ANSWER: [
    { module: 'systems/LimitTowerSystem', handler: 'anonymous', purpose: 'Evaluate limit answer and apply result' },
  ],
  CALCULUS_OPERATION: [
    { module: 'systems/CalculusTowerSystem', handler: 'anonymous', purpose: 'Apply calculus operation to tower state' },
  ],
  CALCULUS_STATE_CHANGED: [
    { module: 'stores/gameStore', handler: 'anonymous', purpose: 'Mirror calculus tower state to reactive store' },
  ],
  TOWER_UPGRADE: [
    { module: 'systems/TowerUpgradeSystem', handler: 'anonymous', purpose: 'Upgrade tower level and stats' },
  ],
  TOWER_UPGRADED: [
    { module: 'stores/gameStore',           handler: 'anonymous', purpose: 'Increment towerUpgradeTick to force TowerInfoPanel re-render' },
    { module: 'systems/CalculusTowerSystem', handler: 'anonymous', purpose: 'Respawn Calculus pets so upgrade extras and stat bonuses propagate' },
    { module: 'composables/useEngineAudio', handler: 'anonymous', purpose: 'Trigger tower-upgrade SFX' },
  ],
  TOWER_REFUND: [
    { module: 'systems/TowerUpgradeSystem', handler: 'anonymous', purpose: 'Refund tower cost and remove it' },
  ],
  TOWER_REFUND_RESULT: [
    { module: 'systems/MatrixTowerSystem',        handler: 'anonymous', purpose: 'Clean up stale laser state and partner matrixPairId when a Matrix tower is sold' },
    { module: 'systems/TowerInterferenceSystem',  handler: 'anonymous', purpose: 'Recompute interference factors after a tower is refunded so neighbours lift the penalty' },
    { module: 'composables/useEngineAudio',       handler: 'anonymous', purpose: 'Trigger refund-success SFX' },
  ],
  TOWER_REMOVED: [
    { module: 'composables/useGameLoop',         handler: 'anonymous', purpose: 'Close build panel when tower is system-removed' },
    { module: 'systems/TowerInterferenceSystem', handler: 'anonymous', purpose: 'Recompute interference factors after a tower is removed' },
  ],
  PET_SPAWNED:  [],
  PET_KILLED:   [],

  // ── Chain rule / boss ──
  CHAIN_RULE_START: [
    { module: 'components/game/ChainRulePanel', handler: 'anonymous', purpose: 'Open chain-rule question panel' },
  ],
  CHAIN_RULE_ANSWER: [
    { module: 'systems/EnemyAbilitySystem', handler: 'anonymous', purpose: 'Score chain rule answer and apply boss split' },
  ],
  CHAIN_RULE_END: [
    { module: 'components/game/ChainRulePanel', handler: 'anonymous', purpose: 'Close chain-rule panel on resolution' },
    { module: 'composables/usePrincipleOverlay',handler: 'anonymous', purpose: 'Surface principle overlay after answering' },
    { module: 'systems/EconomySystem',          handler: 'anonymous', purpose: 'Award/withhold gold based on chain-rule correctness' },
  ],
  BOSS_SPLIT:    [],

  // ── V2 Phase 4: spells ──
  SPELL_CAST: [
    { module: 'composables/useEngineAudio', handler: 'anonymous', purpose: 'Trigger spell-cast SFX' },
    { module: 'systems/SpellSystem',        handler: 'anonymous', purpose: 'Execute spell effect on cast' },
  ],
  SPELL_EFFECT: [
    { module: 'renderers/SpellEffectRenderer', handler: 'anonymous', purpose: 'Schedule animated spell-effect render' },
  ],
  SPELL_COOLDOWN_READY: [],

  // ── Monty Hall ──
  MONTY_HALL_TRIGGER: [
    { module: 'systems/MontyHallSystem', handler: 'anonymous', purpose: 'Start Monty Hall event' },
  ],
  MONTY_HALL_DOOR_SELECTED: [
    { module: 'systems/MontyHallSystem', handler: 'anonymous', purpose: 'Record door selection and reveal goats' },
  ],
  MONTY_HALL_SWITCH_DECISION: [
    { module: 'systems/MontyHallSystem', handler: 'anonymous', purpose: 'Resolve final door and award reward' },
  ],
  MONTY_HALL_RESULT: [
    { module: 'composables/usePrincipleOverlay', handler: 'anonymous', purpose: 'Surface principle overlay after Monty Hall reveal' },
    { module: 'composables/useEngineAudio',      handler: 'anonymous', purpose: 'Trigger Monty Hall reveal SFX' },
  ],
  MONTY_HALL_STATE_CHANGED: [
    { module: 'stores/gameStore', handler: 'anonymous', purpose: 'Mirror Monty Hall state snapshot to reactive store' },
  ],

  // ── Shop / economy ──
  SHOP_PURCHASE: [
    { module: 'systems/BuffSystem', handler: 'anonymous', purpose: 'Apply purchased buff from shop' },
  ],
  PERCEIVED_SPEED_CHANGED: [
    { module: 'stores/gameStore', handler: 'anonymous', purpose: 'Mirror score-neutral pacing control to reactive store' },
  ],
  KILL_VALUE_CHANGED: [
    { module: 'stores/gameStore',        handler: 'anonymous', purpose: 'Mirror kill-value snapshot for UI' },
    { module: 'systems/MontyHallSystem', handler: 'anonymous', purpose: 'Track accumulated kill value for Monty Hall trigger' },
  ],
  COST_TOTAL_CHANGED: [
    { module: 'stores/gameStore', handler: 'anonymous', purpose: 'Mirror tower cost total for UI' },
  ],

  // ── Active buffs mirror ──
  ACTIVE_BUFFS_CHANGED: [
    { module: 'stores/gameStore', handler: 'anonymous', purpose: 'Mirror active buffs to reactive store' },
    { module: 'systems/CalculusTowerSystem', handler: 'anonymous', purpose: 'Respawn Calculus pets so global tower-buff multipliers propagate to pet damage' },
  ],

  // ── Pedagogy ──
  PRINCIPLE_SHOW: [
    { module: 'composables/useGameLoop', handler: 'anonymous', purpose: 'Surface principle overlay for the given principle id' },
  ],
})

/**
 * Modules that own EventBus subscriptions. Helpful when auditing cleanup —
 * every entry here must also dispose its subscriptions on unmount / destroy.
 */
export const EVENT_SUBSCRIBER_MODULES = Object.freeze([
  'composables/useGameLoop',            // Vue onUnmounted
  'composables/useKeyboardPlacement',   // Vue onBeforeUnmount
  'composables/useSessionSync',         // Vue onUnmounted
  'composables/useFirstEncounterCards', // Vue onUnmounted
  'stores/gameStore',                 // unbindEngine()
  'systems/BuffSystem',               // destroy()
  'systems/CalculusTowerSystem',      // destroy()
  'systems/CombatSystem',             // destroy()
  'systems/EconomySystem',            // destroy()
  'systems/EnemyAbilitySystem',       // destroy()
  'systems/LimitTowerSystem',         // destroy()
  'systems/MagicTowerSystem',         // destroy()
  'systems/MatrixTowerSystem',        // destroy()
  'systems/MontyHallSystem',          // destroy()
  'systems/RadarTowerSystem',         // destroy()
  'systems/SpellSystem',              // destroy()
  'systems/TowerInterferenceSystem',  // destroy()
  'systems/TowerPlacementSystem',     // destroy()
  'systems/TowerUpgradeSystem',       // destroy()
  'systems/WaveSystem',               // destroy()
] as const)
