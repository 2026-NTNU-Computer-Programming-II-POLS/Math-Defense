/**
 * PathEvaluator — 路徑函數求值與生成（TypeScript 版）
 * 忠實移植自 PathGenerator.js，保持與原版完全一致的數值範圍。
 */

export interface PathDef {
  fn: (x: number) => number
  expr: string
  type: 'horizontal' | 'linear' | 'quadratic' | 'trigonometric' | 'piecewise' | 'composite'
  startX: number
  targetX: number
}

// ── 輔助函數 ──

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function round(n: number, decimals = 1): number {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

// ── 各類型生成器（數值範圍與原版完全一致） ──

function generateHorizontalLine(): PathDef {
  const a = round(rand(2, 10))
  return {
    fn: () => a,
    expr: `y = ${a}`,
    type: 'horizontal',
    startX: 20,
    targetX: 0,
  }
}

function generateLinear(): PathDef {
  const m = round(rand(-0.8, -0.1), 2)
  const b = round(rand(3, 10), 1)
  return {
    fn: (x) => m * x + b,
    expr: `y = ${m}x + ${b}`,
    type: 'linear',
    startX: 20,
    targetX: 0,
  }
}

function generateQuadratic(): PathDef {
  const h = round(rand(8, 14), 1)
  const k = round(rand(6, 12), 1)
  const a = round(rand(-0.08, -0.02), 3)  // 原版 -0.02，非 -0.03
  return {
    fn: (x) => a * (x - h) ** 2 + k,
    expr: `y = ${a}(x − ${h})² + ${k}`,
    type: 'quadratic',
    startX: 22,  // 原版為 22
    targetX: 0,
  }
}

function generateTrigonometric(): PathDef {
  const A = round(rand(1.5, 4), 1)   // 原版下界 1.5，非 2
  const B = round(rand(0.3, 0.8), 2)
  const C = round(rand(3, 7), 1)     // 原版上界 7，非 8
  return {
    fn: (x) => A * Math.sin(B * x) + C,
    expr: `y = ${A}sin(${B}x) + ${C}`,
    type: 'trigonometric',
    startX: 22,
    targetX: 0,
  }
}

function generatePiecewise(): PathDef {
  // 原版：x>10 時下降（m1 負），x≤10 時上升（m2 正）
  const m1 = round(rand(-0.5, -0.1), 2)
  const b1 = round(rand(5, 10), 1)
  const m2 = round(rand(0.2, 0.6), 2)
  // 確保在 x=10 處連續
  const y10 = m1 * 10 + b1
  const roundedB2 = round(y10 - m2 * 10, 1)

  return {
    fn: (x) => (x > 10 ? m1 * x + b1 : m2 * x + roundedB2),
    expr: `y = { ${m1}x + ${b1}, x > 10 ; ${m2}x + ${roundedB2}, x ≤ 10 }`,
    type: 'piecewise',
    startX: 22,
    targetX: 0,
  }
}

function generateComposite(): PathDef {
  const m = round(rand(-0.3, -0.1), 2)
  const b = round(rand(5, 8), 1)
  const freq = round(rand(0.4, 0.8), 2)
  return {
    fn: (x) => Math.sin(freq * x) * 1.5 + (m * x + b),
    expr: `y = 1.5sin(${freq}x) + (${m}x + ${b})`,
    type: 'composite',
    startX: 22,
    targetX: 0,
  }
}

// ── 關卡隨機池（與原版完全一致） ──

const GENERATORS_BY_LEVEL: Array<Array<() => PathDef>> = [
  // Level 1
  [generateHorizontalLine, generateLinear],
  // Level 2
  [generateHorizontalLine, generateLinear, generateQuadratic],
  // Level 3
  [generateHorizontalLine, generateLinear, generateQuadratic, generateTrigonometric],
  // Level 4: 移除水平線，加入 piecewise + composite
  [generateLinear, generateQuadratic, generateTrigonometric, generatePiecewise, generateComposite],
]

// ── 路徑驗證（與原版一致：>80% 的點在有效區域） ──

function validatePath(path: PathDef): boolean {
  const step = 0.5
  let validPoints = 0
  let totalPoints = 0
  for (let x = 0; x <= path.startX; x += step) {
    const y = path.fn(x)
    totalPoints++
    if (isFinite(y) && y > -1 && y < 15) validPoints++
  }
  return totalPoints > 0 && validPoints / totalPoints > 0.8
}

/**
 * 依關卡隨機生成路徑
 */
export function generatePath(level: number, maxAttempts = 20): PathDef {
  const pool = GENERATORS_BY_LEVEL[Math.min(level - 1, GENERATORS_BY_LEVEL.length - 1)]

  for (let i = 0; i < maxAttempts; i++) {
    const gen = pool[Math.floor(Math.random() * pool.length)]
    const path = gen()
    if (validatePath(path)) return path
  }

  // fallback
  return generateHorizontalLine()
}
