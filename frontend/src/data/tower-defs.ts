/**
 * tower-defs.ts — tower stat definitions (pure data, no UI field specs)
 * UI field specs live in ui-defs.ts.
 */
import { TowerType, Colors } from './constants'

export interface TowerDef {
  type: TowerType
  name: string
  nameEn: string
  color: string
  cost: number
  damage: number
  range: number
  cooldown: number
  unlockLevel: number
  description: string
  mathConcept: string
  element: string
}

export const TOWER_DEFS: Record<TowerType, TowerDef> = {
  [TowerType.FUNCTION_CANNON]: {
    type: TowerType.FUNCTION_CANNON,
    name: '函數砲 Function Cannon',
    nameEn: 'Function Cannon',
    color: Colors.FUNCTION_CANNON,
    cost: 50,
    damage: 20,
    range: 15,
    cooldown: 1.5,
    unlockLevel: 1,
    description: '砲彈沿直線 y = mx + b 飛行，與敵人路徑的交點 = 命中點',
    mathConcept: '一次函數 → 二次函數',
    element: '冰系',
  },
  [TowerType.RADAR_SWEEP]: {
    type: TowerType.RADAR_SWEEP,
    name: '雷達掃描塔 Radar Sweep',
    nameEn: 'Radar Sweep',
    color: Colors.RADAR_SWEEP,
    cost: 60,
    // damage is per-fire (consistent with every other tower). Previously
    // CombatSystem multiplied this by `cooldown`, so 8 × 0.5 = 4 damage per
    // fire. Semantics were normalized; keep the same observed DPS by setting
    // the per-fire value directly here.
    damage: 4,
    range: 6,
    cooldown: 0.5,
    unlockLevel: 2,
    description: '持續掃描扇形區域，區域內敵人受傷',
    mathConcept: '三角函數（sin/cos）、角度、扇形',
    element: '風系',
  },
  [TowerType.MATRIX_LINK]: {
    type: TowerType.MATRIX_LINK,
    name: '矩陣連結塔 Matrix Link',
    nameEn: 'Matrix Link',
    color: Colors.MATRIX_LINK,
    cost: 80,
    damage: 0,
    range: 8,
    cooldown: 0,
    unlockLevel: 3,
    description: '選擇兩座相鄰的塔，輸入 2×2 矩陣做線性變換',
    mathConcept: '2×2 矩陣、線性變換（旋轉、縮放）',
    element: '祕術系',
  },
  [TowerType.PROBABILITY_SHRINE]: {
    type: TowerType.PROBABILITY_SHRINE,
    name: '機率神殿 Probability Shrine',
    nameEn: 'Probability Shrine',
    color: Colors.PROB_SHRINE,
    cost: 40,
    damage: 0,
    range: 0,
    cooldown: 0,
    unlockLevel: 1,
    description: '波次結束後觸發 Buff 卡系統',
    mathConcept: '期望值、風險管理',
    element: '命運系',
  },
  [TowerType.INTEGRAL_CANNON]: {
    type: TowerType.INTEGRAL_CANNON,
    name: '積分砲 Integral Cannon',
    nameEn: 'Integral Cannon',
    color: Colors.INTEGRAL,
    cost: 100,
    damage: 30,
    range: 12,
    cooldown: 2.0,
    unlockLevel: 3,
    description: '曲線下方的陰影面積 = 攻擊範圍',
    mathConcept: '定積分 = 面積 = 攻擊範圍',
    element: '冰系',
  },
  [TowerType.FOURIER_SHIELD]: {
    type: TowerType.FOURIER_SHIELD,
    name: '傅立葉護盾破解 Fourier Shield Break',
    nameEn: 'Fourier Shield Break',
    color: Colors.FOURIER,
    cost: 0,
    damage: 0,
    range: 0,
    cooldown: 0,
    unlockLevel: 4,
    description: 'Level 4 Boss 戰專用機制',
    mathConcept: '傅立葉分解、波的疊加',
    element: '命運系',
  },
}
