/**
 * Constants — 遊戲常數（TypeScript 版）
 * 與 shared/game-constants.json 保持一致。
 */

// ── Canvas / 座標系 ──
export const CANVAS_WIDTH = 1280
export const CANVAS_HEIGHT = 720
export const ORIGIN_X = 160   // px
export const ORIGIN_Y = 600   // px（Canvas y 向下，遊戲 y 向上）
export const UNIT_PX = 40     // 每座標單位的像素數

export const GRID_MIN_X = -3
export const GRID_MAX_X = 25
export const GRID_MIN_Y = -2
export const GRID_MAX_Y = 14

// ── 遊戲初始值 ──
export const INITIAL_HP = 20
export const INITIAL_GOLD = 200

// ── 迴圈 ──
export const TARGET_FPS = 60
export const FIXED_DT = 1 / TARGET_FPS

// ── 遊戲階段 ──
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

// ── 塔類型 ──
export const TowerType = {
  FUNCTION_CANNON:    'functionCannon',
  RADAR_SWEEP:        'radarSweep',
  MATRIX_LINK:        'matrixLink',
  PROBABILITY_SHRINE: 'probabilityShrine',
  INTEGRAL_CANNON:    'integralCannon',
  FOURIER_SHIELD:     'fourierShield',
} as const
export type TowerType = (typeof TowerType)[keyof typeof TowerType]

// ── 敵人類型 ──
export const EnemyType = {
  BASIC_SLIME:   'basicSlime',
  FAST_SLIME:    'fastSlime',
  TANK_SLIME:    'tankSlime',
  SPLIT_SLIME:   'splitSlime',
  STEALTH_SLIME: 'stealthSlime',
  BOSS_DRAGON:   'bossDragon',
} as const
export type EnemyType = (typeof EnemyType)[keyof typeof EnemyType]

// ── 事件名稱 ──
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

// ── 配色 ──
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
