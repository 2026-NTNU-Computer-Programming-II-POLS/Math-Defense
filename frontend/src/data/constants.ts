/**
 * Constants — game constants (TypeScript)
 * Imported from shared/game-constants.json to ensure consistency between frontend and backend.
 */
import gameConstants from '@shared/game-constants.json'

// ── Canvas / coordinate system (imported from shared JSON) ──
export const CANVAS_WIDTH  = gameConstants.canvas.width
export const CANVAS_HEIGHT = gameConstants.canvas.height
export const ORIGIN_X      = gameConstants.canvas.originX   // px
export const ORIGIN_Y      = gameConstants.canvas.originY   // px (Canvas y points downward, game y points upward)
export const UNIT_PX       = gameConstants.canvas.unitPx    // pixels per coordinate unit

export const GRID_MIN_X = gameConstants.grid.minX
export const GRID_MAX_X = gameConstants.grid.maxX
export const GRID_MIN_Y = gameConstants.grid.minY
export const GRID_MAX_Y = gameConstants.grid.maxY

// ── Initial game values ──
export const INITIAL_HP   = gameConstants.player.initialHp
export const INITIAL_GOLD = gameConstants.player.initialGold

// ── Game loop ──
export const TARGET_FPS = gameConstants.loop.targetFps
export const FIXED_DT   = 1 / TARGET_FPS  // Computed precisely to avoid the minor drift from JSON-rounded 0.016667

// ── Game phases ──
export const GamePhase = {
  MENU:         'menu',
  LEVEL_SELECT: 'levelSelect',
  BUILD:        'build',
  WAVE:         'wave',
  BUFF_SELECT:  'buffSelect',
  MONTY_HALL:   'montyHall',
  CHAIN_RULE:   'chainRule',
  LEVEL_END:    'levelEnd',
  GAME_OVER:    'gameOver',
} as const
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase]

export const GRID_POINT_SPACING = gameConstants.grid.pointSpacing
export const GRID_PATH_CLEARANCE = gameConstants.grid.pathClearance

// ── Tower types ──
export const TowerType = {
  MAGIC:    'magic',
  RADAR_A:  'radarA',
  RADAR_B:  'radarB',
  RADAR_C:  'radarC',
  MATRIX:   'matrix',
  LIMIT:    'limit',
  CALCULUS: 'calculus',
} as const
export type TowerType = (typeof TowerType)[keyof typeof TowerType]

// ── Enemy types ──
export const EnemyType = {
  GENERAL:  'general',
  FAST:     'fast',
  STRONG:   'strong',
  SPLIT:    'split',
  HELPER:   'helper',
  BOSS_A:   'bossA',
  BOSS_B:   'bossB',
  REGENERATOR: 'regenerator',
  BULWARK:     'bulwark',
  SWARMLING:   'swarmling',
} as const
export type EnemyType = (typeof EnemyType)[keyof typeof EnemyType]

// ── Event names ──
export const Events = Object.freeze({
  PHASE_CHANGED:        'phaseChanged',
  LEVEL_START:          'levelStart',
  LEVEL_END:            'levelEnd',
  GAME_OVER:            'gameOver',

  BUILD_PHASE_START:    'buildPhaseStart',
  BUILD_PHASE_END:      'buildPhaseEnd',
  TOWER_PLACED:         'towerPlaced',
  TOWER_SELECTED:       'towerSelected',
  TOWER_PARAMS_SET:     'towerParamsSet',
  CAST_SPELL:           'castSpell',

  WAVE_START:           'waveStart',
  WAVE_END:             'waveEnd',
  ENEMY_SPAWNED:        'enemySpawned',
  ENEMY_KILLED:         'enemyKilled',
  // Visual lifecycle event — fired the instant an enemy is killed in combat
  // so death-particle / corpse renderers can spawn. The enemy's `alive` flag
  // flips false at the same site; this event is purely a render hook.
  ENEMY_DYING:          'enemyDying',
  ENEMY_REACHED_ORIGIN: 'enemyReachedOrigin',
  TOWER_ATTACK:         'towerAttack',
  // Fired when a tower spawns a projectile. Consumed by muzzle-flash /
  // projectile-trail renderers introduced by the Visual Redesign plan.
  TOWER_FIRED:          'towerFired',
  // Rare feedback event: a discrete hit whose number a defensive trait
  // (Bulwark cap / Swarmling evasion) actually changed. Drives the floating
  // combat text. Never fires for unmodified or continuous (dt-scaled) damage.
  DAMAGE_RESOLVED:      'damageResolved',

  BUFF_PHASE_START:     'buffPhaseStart',
  BUFF_CARDS_UPDATED:   'buffCardsUpdated',
  BUFF_CARD_SELECTED:   'buffCardSelected',
  BUFF_RESULT:          'buffResult',
  BUFF_PHASE_END:       'buffPhaseEnd',

  GOLD_CHANGED:         'goldChanged',
  HP_CHANGED:           'hpChanged',
  SCORE_CHANGED:        'scoreChanged',

  CANVAS_CLICK:         'canvasClick',
  CANVAS_HOVER:         'canvasHover',

  // Piecewise-paths migration (construction plan Phase 3)
  SEGMENT_CHANGED:      'segmentChanged',
  PLACEMENT_REJECTED:   'placementRejected',

  // V2 tower events
  MAGIC_FUNCTION_SELECTED: 'magicFunctionSelected',
  MAGIC_MODE_CHANGED:   'magicModeChanged',
  RADAR_ARC_CHANGED:    'radarArcChanged',
  TOWER_TARGETING_CHANGED: 'towerTargetingChanged',
  MATRIX_PAIR_CHANGED:  'matrixPairChanged',
  LIMIT_ANSWER:         'limitAnswer',
  // Fired once per LIMIT tower burst tick (charge window expired). Payload
  // carries the tower position, range, the player's answer outcome, and the
  // per-enemy damage list — consumed by LimitBurstRenderer to paint the
  // shockwave ring + per-hit damage popups + result badge.
  LIMIT_BURST:          'limitBurst',
  CALCULUS_OPERATION:    'calculusOperation',
  CALCULUS_STATE_CHANGED:'calculusStateChanged',
  TOWER_UPGRADE:        'towerUpgrade',
  TOWER_UPGRADED:       'towerUpgraded',
  TOWER_REFUND:         'towerRefund',
  TOWER_REFUND_RESULT:  'towerRefundResult',
  TOWER_REMOVED:        'towerRemoved',
  PET_SPAWNED:          'petSpawned',
  PET_KILLED:           'petKilled',

  CHAIN_RULE_START:     'chainRuleStart',
  CHAIN_RULE_ANSWER:    'chainRuleAnswer',
  CHAIN_RULE_END:       'chainRuleEnd',
  BOSS_SPLIT:           'bossSplit',

  // V2 Phase 4: Economy, Scoring & Wave Events
  SPELL_CAST:           'spellCast',
  SPELL_EFFECT:         'spellEffect',
  SPELL_COOLDOWN_READY: 'spellCooldownReady',

  MONTY_HALL_TRIGGER:        'montyHallTrigger',
  MONTY_HALL_DOOR_SELECTED:  'montyHallDoorSelected',
  MONTY_HALL_SWITCH_DECISION:'montyHallSwitchDecision',
  MONTY_HALL_RESULT:         'montyHallResult',

  SHOP_PURCHASE:        'shopPurchase',
  PERCEIVED_SPEED_CHANGED: 'perceivedSpeedChanged',

  KILL_VALUE_CHANGED:   'killValueChanged',
  COST_TOTAL_CHANGED:   'costTotalChanged',

  ACTIVE_BUFFS_CHANGED: 'activeBuffsChanged',
  // Feedback-only: a timed buff's countdown reached zero. Drives the HUD
  // expiry flash + expire SFX. Distinct from ACTIVE_BUFFS_CHANGED, which also
  // fires on purchase and on the level-start buff cleanup.
  BUFF_EXPIRED:         'buffExpired',

  MONTY_HALL_STATE_CHANGED: 'montyHallStateChanged',

  // Pedagogy: post-wave principle-surfacing overlay (Backlog item #1)
  PRINCIPLE_SHOW:        'principleShow',
} as const)

// ── Animation timing (Visual Redesign plan Phase 0) ──
// Single source of truth for every renderer's effect duration. Tune in
// Phase 7. Renderers MUST read from this table — no inline numeric durations.
export const ANIM = Object.freeze({
  ENEMY_DEATH:        0.35,
  BOSS_DEATH:         1.20,
  PLACEMENT_POP:      0.45,
  UPGRADE_BURST:      0.55,
  HIT_FLASH:          0.10,
  TOWER_FIRE_FLASH:   0.14,
  HUD_VALUE_POP:      0.28,
  SHAKE_HIT:          0.18,
  SHAKE_BREACH:       0.55,
  PROJECTILE_TRAIL:   0.25,
} as const)

// ── Color palette ──
export const Colors = Object.freeze({
  STONE_DARK:       '#1a1520',
  STONE_LIGHT:      '#252030',
  GRID_LINE:        '#3a3028',
  AXIS:             '#8b7342',
  MAGIC:            '#a855f7',
  RADAR_A:          '#4aab6e',
  RADAR_B:          '#3b9ede',
  RADAR_C:          '#e06040',
  MATRIX:           '#9068c8',
  LIMIT:            '#c89848',
  CALCULUS:         '#40b890',
  ENEMY:            '#b84040',
  ORIGIN_GLOW:      '#ffd700',
  GOLD_TEXT:        '#d4a840',
  HP_RED:           '#cc4444',
  // V3 counter-enemies. Distinguish Regenerator from Helper via the aura
  // style, not just hue; verify colour-blind / greyscale legibility.
  REGENERATOR:      '#5fbf6f',
  BULWARK:          '#7a8290',
  SWARMLING:        '#8a7a3a',
} as const)
