/**
 * buff-defs.ts — Buff / Curse 卡池定義（純資料）
 * 效果以 effectId 字串表示，實際執行由 BuffSystem 的策略 Map 負責。
 * 解決原本 buffs.js 把函式嵌入資料的問題。
 */

export type BuffCategory = 'tower' | 'economy' | 'defense' | 'curse'

export interface BuffDef {
  id: string
  name: string
  description: string
  category: BuffCategory
  probability: number   // 擲骰成功機率 0~1
  cost: number          // 消耗金幣
  goldReward?: number   // Curse 給予的金幣獎勵
  duration: number      // 持續波數（Infinity = 永久）
  effectId: string      // 策略 ID，BuffSystem 據此執行
  revertId?: string     // 還原策略 ID（若有）
}

export const BUFF_POOL: BuffDef[] = [
  // ── 塔增強 ──
  {
    id: 'buff_atk50_2w',
    name: '全塔攻擊力 +50%',
    description: '全塔攻擊力 +50%（2 波）',
    category: 'tower',
    probability: 0.4,
    cost: 80,
    duration: 2,
    effectId: 'ALL_TOWERS_DAMAGE_MULTIPLY_1_5',
    revertId: 'ALL_TOWERS_DAMAGE_DIVIDE_1_5',
  },
  {
    id: 'buff_range30_1w',
    name: '某塔攻擊範圍 +30%',
    description: '隨機一座塔攻擊範圍 +30%（1 波）',
    category: 'tower',
    probability: 0.7,
    cost: 50,
    duration: 1,
    effectId: 'RANDOM_TOWER_RANGE_MULTIPLY_1_3',
    revertId: 'RANDOM_TOWER_RANGE_DIVIDE_1_3',
  },
  {
    id: 'buff_upgrade_quad',
    name: '函數砲升級為二次函數砲',
    description: '函數砲升級為二次函數砲（永久）',
    category: 'tower',
    probability: 0.25,
    cost: 150,
    duration: Infinity,
    effectId: 'UPGRADE_FUNCTION_CANNON',
  },

  // ── 經濟 ──
  {
    id: 'buff_double_gold',
    name: '下一波擊殺金幣翻倍',
    description: '下一波擊殺金幣翻倍',
    category: 'economy',
    probability: 0.6,
    cost: 40,
    duration: 1,
    effectId: 'GOLD_MULTIPLIER_DOUBLE',
    revertId: 'GOLD_MULTIPLIER_RESET',
  },
  {
    id: 'buff_free_tower',
    name: '免費蓋一座新塔',
    description: '免費蓋一座新塔',
    category: 'economy',
    probability: 0.25,
    cost: 0,
    duration: 1,
    effectId: 'FREE_TOWER_NEXT',
    revertId: 'FREE_TOWER_CLEAR',
  },
  {
    id: 'buff_refund',
    name: '退還上一座塔的建造費用',
    description: '退還上一座塔的建造費用',
    category: 'economy',
    probability: 0.8,
    cost: 20,
    duration: 0,
    effectId: 'REFUND_LAST_TOWER',
  },

  // ── 防禦 ──
  {
    id: 'buff_heal3',
    name: '回復 3 HP',
    description: '回復 3 HP',
    category: 'defense',
    probability: 0.9,
    cost: 60,
    duration: 0,
    effectId: 'HEAL_3',
  },
  {
    id: 'buff_shield',
    name: '本波護盾',
    description: '本波護盾（敵人不扣 HP）',
    category: 'defense',
    probability: 0.5,
    cost: 100,
    duration: 1,
    effectId: 'SHIELD_ACTIVATE',
    revertId: 'SHIELD_DEACTIVATE',
  },
  {
    id: 'buff_explosion',
    name: '原點魔法陣爆炸',
    description: '原點魔法陣爆炸（最後防線）',
    category: 'defense',
    probability: 0.35,
    cost: 120,
    duration: 0,
    effectId: 'ORIGIN_EXPLOSION',
  },
]

export const CURSE_POOL: BuffDef[] = [
  {
    id: 'curse_atk_down',
    name: '全塔攻擊力 -20%',
    description: '全塔攻擊力 -20%（1 波），獲得 200 金',
    category: 'curse',
    probability: 1.0,
    cost: 0,
    goldReward: 200,
    duration: 1,
    effectId: 'ALL_TOWERS_DAMAGE_MULTIPLY_0_8',
    revertId: 'ALL_TOWERS_DAMAGE_DIVIDE_0_8',
  },
  {
    id: 'curse_speed_up',
    name: '下一波敵人速度 +50%',
    description: '下一波敵人速度 +50%，獲得 150 金',
    category: 'curse',
    probability: 1.0,
    cost: 0,
    goldReward: 150,
    duration: 1,
    effectId: 'ENEMY_SPEED_MULTIPLIER_1_5',
    revertId: 'ENEMY_SPEED_MULTIPLIER_RESET',
  },
  {
    id: 'curse_disable_tower',
    name: '隨機一座塔停機 1 波',
    description: '隨機一座塔停機 1 波，獲得 180 金',
    category: 'curse',
    probability: 1.0,
    cost: 0,
    goldReward: 180,
    duration: 1,
    effectId: 'DISABLE_RANDOM_TOWER',
    revertId: 'ENABLE_DISABLED_TOWER',
  },
]
