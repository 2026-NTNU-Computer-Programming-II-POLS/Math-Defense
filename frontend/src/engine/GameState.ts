/**
 * GameState — 強型別遊戲狀態
 * 所有 buff flag、遊戲數值在此明確宣告。
 * 不再有 game._shieldActive 等動態屬性。
 */
import { GamePhase } from '@/data/constants'
import { INITIAL_HP, INITIAL_GOLD } from '@/data/constants'

export interface GameState {
  // 流程
  phase: GamePhase
  level: number
  wave: number
  totalWaves: number

  // 資源
  gold: number
  hp: number
  maxHp: number
  score: number
  kills: number

  // Buff flags（明確宣告，不再動態注入）
  shieldActive: boolean
  goldMultiplier: number
  freeTowerNext: boolean
  enemySpeedMultiplier: number     // 詛咒：敵人加速（預設 1.0）

  // Boss Shield 狀態（集中管理，不散落在 CombatSystem）
  bossShieldTriggered: boolean
  bossShieldTimer: number

  // 路徑
  pathExpression: string
}

export function createInitialState(): GameState {
  return {
    phase: GamePhase.MENU,
    level: 1,
    wave: 0,
    totalWaves: 0,
    gold: INITIAL_GOLD,
    hp: INITIAL_HP,
    maxHp: INITIAL_HP,
    score: 0,
    kills: 0,
    shieldActive: false,
    goldMultiplier: 1,
    freeTowerNext: false,
    enemySpeedMultiplier: 1,
    bossShieldTriggered: false,
    bossShieldTimer: 0,
    pathExpression: '',
  }
}
