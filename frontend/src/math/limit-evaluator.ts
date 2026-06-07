import type { LimitOutcome, LimitResult } from '@/entities/types'
import { mulberry32 } from '@/math/RandomUtils'

export interface LimitQuestion {
  fExpr: string
  a: number
  /**
   * Display string for the linear factor (x − a) — already sign-normalised by
   * `formatLinearFactor`, so callers render it verbatim instead of rebuilding
   * `(x - ${a})` (which broke for negative / zero a). See `formatLinearFactor`.
   */
  denom: string
  correctAnswer: LimitResult
  choices: LimitResult[]
}

// Render the linear factor (x − a) for display. The playfield grid is centred
// on the origin (minX = −14), so `a` — the tower's x grid coordinate, reused
// as the limit point — is routinely negative or zero. The naïve `(x - ${a})`
// template then produced "x - -2" (double minus) for a < 0 and the redundant
// "x - 0" for a = 0. Normalise the sign instead:
//   a > 0 → "(x - a)"     a < 0 → "(x + |a|)"     a === 0 → "x"
export function formatLinearFactor(a: number): string {
  if (a === 0) return 'x'
  return a > 0 ? `(x - ${a})` : `(x + ${-a})`
}

// All generated questions use the ONE-SIDED limit convention x → a⁺ (the panel
// renders the ⁺). This is what makes 1/(x−a) → +∞ and −1/(x−a) → −∞ unambiguous
// correct answers; under a two-sided limit those would be DNE. The only genuine
// DNE branch (case 6) therefore has to oscillate — see the comment there.
export function generateLimitQuestion(a: number, seed: number): LimitQuestion {
  const rng = mulberry32(seed)
  const questionType = Math.floor(rng() * 8)

  // Pre-format the (x − a) factor once so every f(x) branch and the panel's
  // denominator share one sign-correct rendering.
  const f = formatLinearFactor(a)

  let fExpr: string
  let outcome: LimitOutcome
  let value: number

  switch (questionType) {
    case 0: {
      const k = Math.floor(rng() * 4) + 1
      fExpr = `${k}${f}² + ${k}${f}`
      outcome = '+c'
      value = k
      break
    }
    case 1: {
      const k = Math.floor(rng() * 3) + 2
      fExpr = `${k}${f}`
      outcome = '+c'
      value = k
      break
    }
    case 2: {
      fExpr = `${f}²`
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
      fExpr = `${k}${f}`
      outcome = '-c'
      value = k
      break
    }
    case 6: {
      // Genuine DNE under the one-sided x→a⁺ convention. Every other branch is
      // a polynomial over (x−a), whose right-hand limit always exists (finite
      // or ±∞) — so a constant numerator like the old `${c}` here was really
      // +∞, not "undefined". An oscillatory numerator is the only elementary
      // way to make the limit genuinely fail to exist: sin(1/(x−a)) oscillates
      // ever faster as x→a⁺, so f(x)/(x−a) neither settles nor diverges to a
      // single ±∞. Outcome 'constant' is the engine's internal tag for DNE
      // (see `parseLimitAnswer('DNE')`); value is unused for categorical
      // outcomes, so 0 keeps it canonical.
      fExpr = `sin(1/${f})`
      outcome = 'constant'
      value = 0
      break
    }
    default: {
      const k = Math.floor(rng() * 4) + 1
      fExpr = `${k}${f}³`
      outcome = 'zero'
      value = 0
      break
    }
  }

  const correct: LimitResult = { outcome, value }
  const choices = generateDistractors(correct, rng)

  return { fExpr: `f(x) = ${fExpr}`, a, denom: f, correctAnswer: correct, choices }
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

