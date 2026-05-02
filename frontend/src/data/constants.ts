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
  ENEMY_REACHED_ORIGIN: 'enemyReachedOrigin',
  TOWER_ATTACK:         'towerAttack',

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
  MATRIX_PAIR_CHANGED:  'matrixPairChanged',
  LIMIT_ANSWER:         'limitAnswer',
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

  KILL_VALUE_CHANGED:   'killValueChanged',
  COST_TOTAL_CHANGED:   'costTotalChanged',

  ACTIVE_BUFFS_CHANGED: 'activeBuffsChanged',
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
} as const)
