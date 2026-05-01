export interface ScoreInput {
  killValue: number
  timeTotal: number               // seconds
  timeExcludePrepare: number[]    // duration of each prep phase in seconds
  costTotal: number
  healthOrigin: number
  healthFinal: number
  initialAnswer: 0 | 1
}

export interface ScoreBreakdown {
  s1: number
  s2: number
  k: number
  exponent: number
  totalScore: number
  activeTime: number
  mUsed: number
}

export function calculateScore(input: ScoreInput): ScoreBreakdown {
  const prepTimeSum = input.timeExcludePrepare.reduce((a, b) => a + b, 0)
  const activeTime = Math.max(0.001, input.timeTotal - prepTimeSum)

  const s1 = input.killValue / activeTime
  const s2 = input.costTotal > 0 ? input.killValue / input.costTotal : 0

  let k: number
  let mUsed: number
  if (s1 >= s2) {
    mUsed = 0.7
    k = 0.7 * s1 + 0.3 * s2
  } else {
    mUsed = 0.5
    k = 0.5 * s1 + 0.5 * s2
  }

  const exponentDenom = Math.max(1, 1 + (2 + input.healthOrigin - input.healthFinal - input.initialAnswer))
  const exponent = 1 / exponentDenom
  const totalScore = Math.pow(Math.max(0, k), exponent)

  return {
    s1: round4(s1),
    s2: round4(s2),
    k: round4(k),
    exponent: round4(exponent),
    totalScore: round4(totalScore),
    activeTime: round4(activeTime),
    mUsed,
  }
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000
}
