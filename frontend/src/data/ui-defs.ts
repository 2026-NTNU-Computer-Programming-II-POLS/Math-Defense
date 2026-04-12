/**
 * ui-defs.ts — Build Panel input field specifications
 * Separated from tower-defs; pure UI descriptions, no game-balance values.
 */
import { TowerType } from './constants'

export interface ParamField {
  key: string
  label: string
  mathLabel: string
  min: number
  max: number
  step: number
  default: number
}

export const TOWER_PARAM_FIELDS: Record<TowerType, ParamField[]> = {
  [TowerType.FUNCTION_CANNON]: [
    { key: 'm',    label: '斜率 slope (m)',       mathLabel: 'm', min: -10, max: 10, step: 0.1, default: 1 },
    { key: 'b',    label: '截距 intercept (b)',    mathLabel: 'b', min: -20, max: 20, step: 0.5, default: 0 },
  ],
  [TowerType.RADAR_SWEEP]: [
    { key: 'theta',      label: '起始角度 θ (度)',      mathLabel: 'θ',  min: 0,  max: 360, step: 5,   default: 0  },
    { key: 'deltaTheta', label: '掃描弧度寬 Δθ (度)',   mathLabel: 'Δθ', min: 10, max: 180, step: 5,   default: 60 },
    { key: 'r',          label: '半徑 r',               mathLabel: 'r',  min: 1,  max: 10,  step: 0.5, default: 4  },
  ],
  [TowerType.MATRIX_LINK]: [
    { key: 'a00', label: '矩陣 [1,1]', mathLabel: 'a₁₁', min: -5, max: 5, step: 0.1, default: 1 },
    { key: 'a01', label: '矩陣 [1,2]', mathLabel: 'a₁₂', min: -5, max: 5, step: 0.1, default: 0 },
    { key: 'a10', label: '矩陣 [2,1]', mathLabel: 'a₂₁', min: -5, max: 5, step: 0.1, default: 0 },
    { key: 'a11', label: '矩陣 [2,2]', mathLabel: 'a₂₂', min: -5, max: 5, step: 0.1, default: 1 },
  ],
  [TowerType.PROBABILITY_SHRINE]: [],
  [TowerType.INTEGRAL_CANNON]: [
    { key: 'a',    label: '二次係數 (a)', mathLabel: 'a',  min: -5,  max: 5,  step: 0.1, default: -0.5 },
    { key: 'b',    label: '一次係數 (b)', mathLabel: 'b',  min: -10, max: 10, step: 0.1, default: 3    },
    { key: 'c',    label: '常數項 (c)',   mathLabel: 'c',  min: -10, max: 10, step: 0.5, default: 2    },
    { key: 'intA', label: '積分下界 a',   mathLabel: '∫a', min: -5,  max: 25, step: 0.5, default: 0    },
    { key: 'intB', label: '積分上界 b',   mathLabel: '∫b', min: -5,  max: 25, step: 0.5, default: 6    },
  ],
  [TowerType.FOURIER_SHIELD]: [
    { key: 'freq1', label: '頻率 ω₁', mathLabel: 'ω₁', min: 0.1, max: 10, step: 0.1, default: 1   },
    { key: 'amp1',  label: '振幅 A₁', mathLabel: 'A₁', min: 0,   max: 5,  step: 0.1, default: 1   },
    { key: 'freq2', label: '頻率 ω₂', mathLabel: 'ω₂', min: 0.1, max: 10, step: 0.1, default: 2   },
    { key: 'amp2',  label: '振幅 A₂', mathLabel: 'A₂', min: 0,   max: 5,  step: 0.1, default: 0.5 },
    { key: 'freq3', label: '頻率 ω₃', mathLabel: 'ω₃', min: 0.1, max: 10, step: 0.1, default: 3   },
    { key: 'amp3',  label: '振幅 A₃', mathLabel: 'A₃', min: 0,   max: 5,  step: 0.1, default: 0.3 },
  ],
}

/** Parameter fields for the upgraded Function Cannon (quadratic mode) */
export const FUNCTION_CANNON_UPGRADED_FIELDS: ParamField[] = [
  { key: 'a',       label: '二次係數 (a)', mathLabel: 'a', min: -5, max: 5,   step: 0.1, default: 0 },
  { key: 'b_coeff', label: '一次係數 (b)', mathLabel: 'b', min: -10, max: 10, step: 0.1, default: 1 },
  { key: 'c',       label: '常數項 (c)',   mathLabel: 'c', min: -20, max: 20, step: 0.5, default: 0 },
]
