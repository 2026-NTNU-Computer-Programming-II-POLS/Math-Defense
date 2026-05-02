import type { LimitOutcome, LimitResult } from '@/entities/types'
import { mulberry32 } from '@/math/RandomUtils'

export interface LimitQuestion {
  fExpr: string
  a: number
  correctAnswer: LimitResult
  choices: LimitResult[]
}

export function generateLimitQuestion(a: number, seed: number): LimitQuestion {
  const rng = mulberry32(seed)
  const questionType = Math.floor(rng() * 8)

  let fExpr: string
  let outcome: LimitOutcome
  let value: number

  switch (questionType) {
    case 0: {
      const k = Math.floor(rng() * 4) + 1
      fExpr = `${k}(x - ${a})² + ${k}(x - ${a})`
      outcome = '+c'
      value = k
      break
    }
    case 1: {
      const k = Math.floor(rng() * 3) + 2
      fExpr = `${k}(x - ${a})`
      outcome = '+c'
      value = k
      break
    }
    case 2: {
      fExpr = `(x - ${a})²`
      outcome = 'zero'
      value = 0
      break
    }
    case 3: {
      fExpr = `1`
      outcome = '+inf'
      value = Infinity
      break
    }
    case 4: {
      fExpr = `-1`
      outcome = '-inf'
      value = -Infinity
      break
    }
    case 5: {
      const k = -(Math.floor(rng() * 3) + 1)
      fExpr = `${k}(x - ${a})`
      outcome = '-c'
      value = k
      break
    }
    case 6: {
      const c = Math.floor(rng() * 4) + 2
      fExpr = `${c}`
      outcome = 'constant'
      value = c
      break
    }
    default: {
      const k = Math.floor(rng() * 4) + 1
      fExpr = `${k}(x - ${a})³`
      outcome = 'zero'
      value = 0
      break
    }
  }

  const correct: LimitResult = { outcome, value }
  const choices = generateDistractors(correct, rng)

  return { fExpr: `f(x) = ${fExpr}`, a, correctAnswer: correct, choices }
}

function generateDistractors(correct: LimitResult, rng: () => number): LimitResult[] {
  const pool: LimitResult[] = (([
    { outcome: '+inf', value: Infinity },
    { outcome: '-inf', value: -Infinity },
    { outcome: 'zero', value: 0 },
    { outcome: 'constant', value: Math.floor(rng() * 4) + 2 },
    { outcome: '+c', value: Math.floor(rng() * 4) + 1 },
    { outcome: '-c', value: -(Math.floor(rng() * 3) + 1) },
  ] as LimitResult[]).filter(r => r.outcome !== correct.outcome))

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }

  const choices: LimitResult[] = [correct, ...pool.slice(0, 3)]

  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[choices[i], choices[j]] = [choices[j], choices[i]]
  }

  return choices
}

export function outcomeLabel(r: LimitResult): string {
  switch (r.outcome) {
    case '+inf': return '+∞ (max damage)'
    case '-inf': return '-∞ (max heal)'
    case 'zero': return '0 (tower removed)'
    case '+c': return `+${r.value} (damage)`
    case '-c': return `${r.value} (heal)`
    case 'constant': return 'Limit undefined (disabled)'
    default: {
      const _exhaustive: never = r.outcome
      return String(_exhaustive)
    }
  }
}

