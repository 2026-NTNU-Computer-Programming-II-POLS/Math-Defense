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
  BOSS_SHIELD:  'bossShield',
  LEVEL_END:    'levelEnd',
  GAME_OVER:    'gameOver',
} as const
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase]

// ── Tower types ──
export const TowerType = {
  FUNCTION_CANNON:    'functionCannon',
  RADAR_SWEEP:        'radarSweep',
  MATRIX_LINK:        'matrixLink',
  PROBABILITY_SHRINE: 'probabilityShrine',
  INTEGRAL_CANNON:    'integralCannon',
  FOURIER_SHIELD:     'fourierShield',
} as const
export type TowerType = (typeof TowerType)[keyof typeof TowerType]

// ── Enemy types ──
export const EnemyType = {
  BASIC_SLIME:   'basicSlime',
  FAST_SLIME:    'fastSlime',
  TANK_SLIME:    'tankSlime',
  SPLIT_SLIME:   'splitSlime',
  STEALTH_SLIME: 'stealthSlime',
  BOSS_DRAGON:   'bossDragon',
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
  BUFF_CARD_SELECTED:   'buffCardSelected',
  BUFF_RESULT:          'buffResult',
  BUFF_PHASE_END:       'buffPhaseEnd',

  BOSS_SHIELD_START:    'bossShieldStart',
  BOSS_SHIELD_ATTEMPT:  'bossShieldAttempt',
  BOSS_SHIELD_END:      'bossShieldEnd',

  GOLD_CHANGED:         'goldChanged',
  HP_CHANGED:           'hpChanged',
  SCORE_CHANGED:        'scoreChanged',

  CANVAS_CLICK:         'canvasClick',
  CANVAS_HOVER:         'canvasHover',
} as const)

// ── Color palette ──
export const Colors = Object.freeze({
  STONE_DARK:       '#1a1520',
  STONE_LIGHT:      '#252030',
  GRID_LINE:        '#3a3028',
  AXIS:             '#8b7342',
  FUNCTION_CANNON:  '#4a82c8',
  RADAR_SWEEP:      '#4aab6e',
  MATRIX_LINK:      '#9068c8',
  PROB_SHRINE:      '#c89848',
  INTEGRAL:         '#4a82c8',
  FOURIER:          '#c89848',
  ENEMY:            '#b84040',
  ORIGIN_GLOW:      '#ffd700',
  GOLD_TEXT:        '#d4a840',
  HP_RED:           '#cc4444',
} as const)
