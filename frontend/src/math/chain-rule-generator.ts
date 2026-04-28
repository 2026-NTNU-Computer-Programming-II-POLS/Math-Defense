interface SimpleFunc {
  expr: (inner: string) => string
  deriv: (inner: string) => string
  label: string
}

const OUTER_FUNCTIONS: SimpleFunc[] = [
  { expr: (u) => `\\sin(${u})`,    deriv: (u) => `\\cos(${u})`,    label: 'sin' },
  { expr: (u) => `\\cos(${u})`,    deriv: (u) => `-\\sin(${u})`,   label: 'cos' },
  { expr: (u) => `e^{${u}}`,       deriv: (u) => `e^{${u}}`,       label: 'exp' },
  { expr: (u) => `\\ln(${u})`,     deriv: (u) => `\\frac{1}{${u}}`, label: 'ln' },
  { expr: (u) => `(${u})^2`,       deriv: (u) => `2(${u})`,        label: 'sq' },
  { expr: (u) => `(${u})^3`,       deriv: (u) => `3(${u})^2`,      label: 'cube' },
]

const INNER_FUNCTIONS: { expr: string; deriv: string }[] = [
  { expr: '2x',           deriv: '2' },
  { expr: '3x',           deriv: '3' },
  { expr: 'x^2',          deriv: '2x' },
  { expr: 'x^2 + 1',      deriv: '2x' },
  { expr: 'x^3',          deriv: '3x^2' },
  { expr: '\\sin(x)',     deriv: '\\cos(x)' },
  { expr: '\\cos(x)',     deriv: '-\\sin(x)' },
  { expr: 'e^x',          deriv: 'e^x' },
  { expr: '2x + 1',       deriv: '2' },
  { expr: '5x',           deriv: '5' },
]

export interface ChainRuleQuestion {
  compositeExpr: string
  correctAnswer: string
  choices: string[]
  correctIndex: number
  fPrimeOfG: string
  gPrime: string
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export function generateChainRuleQuestion(): ChainRuleQuestion {
  const f = pickRandom(OUTER_FUNCTIONS)
  const g = pickRandom(INNER_FUNCTIONS)

  const compositeExpr = f.expr(g.expr)
  const fPrimeOfG = f.deriv(g.expr)
  const gPrime = g.deriv

  const correctAnswer = `${fPrimeOfG} \\cdot ${gPrime}`

  const distractors = new Set<string>()

  distractors.add(`${f.deriv('x')} \\cdot ${gPrime}`)
  distractors.add(fPrimeOfG)
  distractors.add(`${f.deriv(g.deriv)}`)
  distractors.add(`${gPrime} \\cdot ${f.expr(g.deriv)}`)
  distractors.add(`${fPrimeOfG} + ${gPrime}`)
  distractors.add(`${f.expr('x')} \\cdot ${gPrime}`)
  distractors.add(`${gPrime}`)

  distractors.delete(correctAnswer)

  const distractorList = [...distractors].slice(0, 3)

  const allChoices = shuffle([correctAnswer, ...distractorList])
  const correctIndex = allChoices.indexOf(correctAnswer)

  return {
    compositeExpr,
    correctAnswer,
    choices: allChoices,
    correctIndex,
    fPrimeOfG,
    gPrime,
  }
}
