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
  const questionType = Math.floor(rng() * 7)

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
    default: {
      const k = Math.floor(rng() * 3) + 1
      fExpr = `${k}|x - ${a}|`
      outcome = 'constant'
      value = k
      break
    }
  }

  const correct: LimitResult = { outcome, value }
  const choices = generateDistractors(correct, rng)

  return { fExpr: `f(x) = ${fExpr}`, a, correctAnswer: correct, choices }
}

function generateDistractors(correct: LimitResult, rng: () => number): LimitResult[] {
  const allOutcomes: LimitResult[] = [
    correct,
    { outcome: '+inf', value: Infinity },
    { outcome: '-inf', value: -Infinity },
    { outcome: 'zero', value: 0 },
    { outcome: '+c', value: Math.floor(rng() * 5) + 1 },
    { outcome: '-c', value: -(Math.floor(rng() * 5) + 1) },
  ]

  const unique = allOutcomes.filter((r, i) =>
    i === 0 || r.outcome !== correct.outcome,
  )

  for (let i = unique.length - 1; i > 1; i--) {
    const j = 1 + Math.floor(rng() * i)
    ;[unique[i], unique[j]] = [unique[j], unique[i]]
  }

  const choices = unique.slice(0, 4)
  const insertIdx = Math.floor(rng() * choices.length)
  const correctIdx = choices.indexOf(correct)
  if (correctIdx > 0) {
    [choices[correctIdx], choices[insertIdx]] = [choices[insertIdx], choices[correctIdx]]
  }

  return choices
}

export function outcomeLabel(r: LimitResult): string {
  switch (r.outcome) {
    case '+inf': return '+∞'
    case '-inf': return '-∞'
    case 'zero': return '0'
    case '+c': return `+${r.value}`
    case '-c': return `${r.value}`
    case 'constant': return `${r.value} (constant)`
    default: {
      const _exhaustive: never = r.outcome
      return String(_exhaustive)
    }
  }
}

