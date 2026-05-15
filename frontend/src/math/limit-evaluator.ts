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

// Star ≥ 4 typed-entry parser. Accepts ±inf / infinity, integers, decimals, DNE.
// Whitespace tolerant, case-insensitive. Returns the full LimitResult so the
// caller can compare value (not just outcome) against the canonical answer.
export function parseLimitAnswer(input: string): LimitResult | null {
  const raw = input.trim().toLowerCase()
  if (!raw) return null

  if (raw === 'dne') return { outcome: 'constant', value: 0 }

  if (raw === '+inf' || raw === 'inf' || raw === '+infinity' || raw === 'infinity') {
    return { outcome: '+inf', value: Infinity }
  }
  if (raw === '-inf' || raw === '-infinity') {
    return { outcome: '-inf', value: -Infinity }
  }

  // Strip a leading '+' so Number('+3') and Number('3') behave the same.
  const num = Number(raw.replace(/^\+/, ''))
  if (!Number.isFinite(num)) return null

  if (num === 0) return { outcome: 'zero', value: 0 }
  if (num > 0) return { outcome: '+c', value: num }
  return { outcome: '-c', value: num }
}

// The label is the teaching surface: it describes the spectrum of limit
// behaviours, never a punishment. A wrong answer only ever means weak damage.
export function outcomeLabel(r: LimitResult): string {
  switch (r.outcome) {
    case '+inf': return '+∞ — instantly destroys the target'
    case '+c': return `+${r.value} — strong damage`
    case 'zero': return '0 — the limit vanishes; tower deals only chip damage'
    case '-c': return `${r.value} — wrong direction; tower deals only chip damage`
    case '-inf': return '−∞ — wrong direction; tower deals only chip damage'
    case 'constant': return 'undefined limit — tower deals only chip damage'
    default: {
      const _exhaustive: never = r.outcome
      return String(_exhaustive)
    }
  }
}

