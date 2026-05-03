interface SimpleFunc {
  expr: (inner: string) => string
  deriv: (inner: string) => string
  label: string
  derivAt: (innerVal: number) => number
}

interface InnerFunc {
  expr: string
  deriv: string
  evalAt: (x: number) => number
}

const OUTER_FUNCTIONS: SimpleFunc[] = [
  { expr: (u) => `\\sin(${u})`,    deriv: (u) => `\\cos(${u})`,        label: 'sin',  derivAt: (u) => Math.cos(u) },
  { expr: (u) => `\\cos(${u})`,    deriv: (u) => `-\\sin(${u})`,       label: 'cos',  derivAt: (u) => -Math.sin(u) },
  { expr: (u) => `e^{${u}}`,       deriv: (u) => `e^{${u}}`,           label: 'exp',  derivAt: (u) => Math.exp(u) },
  { expr: (u) => `\\ln(${u})`,     deriv: (u) => `\\frac{1}{${u}}`,    label: 'ln',   derivAt: (u) => 1 / u },
  { expr: (u) => `(${u})^2`,       deriv: (u) => `2(${u})`,            label: 'sq',   derivAt: (u) => 2 * u },
  { expr: (u) => `(${u})^3`,       deriv: (u) => `3(${u})^2`,          label: 'cube', derivAt: (u) => 3 * u * u },
]

const INNER_FUNCTIONS: InnerFunc[] = [
  { expr: '2x',           deriv: '2',           evalAt: (x) => 2 * x },
  { expr: '3x',           deriv: '3',           evalAt: (x) => 3 * x },
  { expr: 'x^2',          deriv: '2x',          evalAt: (x) => x * x },
  { expr: 'x^2 + 1',      deriv: '2x',          evalAt: (x) => x * x + 1 },
  { expr: 'x^3',          deriv: '3x^2',        evalAt: (x) => x * x * x },
  { expr: '\\sin(x)',     deriv: '\\cos(x)',     evalAt: (x) => Math.sin(x) },
  { expr: '\\cos(x)',     deriv: '-\\sin(x)',    evalAt: (x) => Math.cos(x) },
  { expr: 'e^x',          deriv: 'e^x',         evalAt: (x) => Math.exp(x) },
  { expr: '2x + 1',       deriv: '2',           evalAt: (x) => 2 * x + 1 },
  { expr: '5x',           deriv: '5',           evalAt: (x) => 5 * x },
]

const TEST_X = 1

export interface ChainRuleQuestion {
  compositeExpr: string
  correctAnswer: string
  choices: string[]
  correctIndex: number
  fPrimeOfG: string
  gPrime: string
}

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export function generateChainRuleQuestion(rng: () => number = Math.random): ChainRuleQuestion {
  const f = pickRandom(OUTER_FUNCTIONS, rng)
  const g = pickRandom(INNER_FUNCTIONS, rng)

  if (!isFinite(f.derivAt(g.evalAt(TEST_X)))) return generateChainRuleQuestion(rng)

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

  const allChoices = shuffle([correctAnswer, ...distractorList], rng)
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
