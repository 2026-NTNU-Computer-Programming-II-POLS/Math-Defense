export type CurveFunction = (x: number) => number

const MAX_EXPR_LEN = 200

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'var' }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' | '^' | 'u-' }
  | { kind: 'fn'; name: keyof typeof FUNCTIONS }
  | { kind: 'const'; value: number }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' }

const FUNCTIONS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  ln: Math.log,
  log: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
} as const

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
}

const PRECEDENCE: Record<string, number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
  'u-': 3,
  '^': 4,
}
const RIGHT_ASSOC = new Set(['^', 'u-'])

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = []
  let i = 0
  const len = input.length
  while (i < len) {
    const c = input[i]
    if (c === ' ' || c === '\t') { i++; continue }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i
      let dot = c === '.'
      while (j + 1 < len) {
        const n = input[j + 1]
        if (n >= '0' && n <= '9') { j++; continue }
        if (n === '.' && !dot) { dot = true; j++; continue }
        break
      }
      const num = Number(input.slice(i, j + 1))
      if (!Number.isFinite(num)) return null
      tokens.push({ kind: 'num', value: num })
      i = j + 1
      continue
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
      let j = i
      while (j + 1 < len) {
        const n = input[j + 1]
        if ((n >= 'a' && n <= 'z') || (n >= 'A' && n <= 'Z')) { j++; continue }
        break
      }
      const word = input.slice(i, j + 1).toLowerCase()
      if (word === 'x') {
        tokens.push({ kind: 'var' })
      } else if (word in FUNCTIONS) {
        tokens.push({ kind: 'fn', name: word as keyof typeof FUNCTIONS })
      } else if (word in CONSTANTS) {
        tokens.push({ kind: 'const', value: CONSTANTS[word] })
      } else {
        return null
      }
      i = j + 1
      continue
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') {
      tokens.push({ kind: 'op', op: c })
      i++
      continue
    }
    if (c === '(') { tokens.push({ kind: 'lparen' }); i++; continue }
    if (c === ')') { tokens.push({ kind: 'rparen' }); i++; continue }
    if (c === ',') { tokens.push({ kind: 'comma' }); i++; continue }
    return null
  }
  return tokens
}

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'var' }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/' | '^'; l: Node; r: Node }
  | { kind: 'neg'; v: Node }
  | { kind: 'fn'; name: keyof typeof FUNCTIONS; arg: Node }

function parse(tokens: Token[]): Node | null {
  const out: Node[] = []
  const ops: Token[] = []
  let prevWasValue = false

  const popOp = (): boolean => {
    const op = ops.pop()
    if (!op) return false
    if (op.kind === 'op') {
      if (op.op === 'u-') {
        const v = out.pop()
        if (!v) return false
        out.push({ kind: 'neg', v })
      } else {
        const r = out.pop()
        const l = out.pop()
        if (!l || !r) return false
        out.push({ kind: 'bin', op: op.op, l, r })
      }
      return true
    }
    if (op.kind === 'fn') {
      const arg = out.pop()
      if (!arg) return false
      out.push({ kind: 'fn', name: op.name, arg })
      return true
    }
    return false
  }

  const startsValue = (k: Token['kind']) =>
    k === 'num' || k === 'const' || k === 'var' || k === 'fn' || k === 'lparen'

  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx]
    if (prevWasValue && startsValue(t.kind)) {
      // Implicit multiplication: `2x`, `2sin(x)`, `2(x+1)`, `xsin(x)` etc.
      while (ops.length > 0) {
        const top = ops[ops.length - 1]
        if (top.kind !== 'op' && top.kind !== 'fn') break
        const topPrec = top.kind === 'fn' ? 5 : PRECEDENCE[top.kind === 'op' ? top.op : '']
        const curPrec = PRECEDENCE['*']
        if (topPrec >= curPrec) {
          if (!popOp()) return null
        } else break
      }
      ops.push({ kind: 'op', op: '*' })
      prevWasValue = false
    }
    if (t.kind === 'num') {
      out.push({ kind: 'num', value: t.value })
      prevWasValue = true
    } else if (t.kind === 'const') {
      out.push({ kind: 'num', value: t.value })
      prevWasValue = true
    } else if (t.kind === 'var') {
      out.push({ kind: 'var' })
      prevWasValue = true
    } else if (t.kind === 'fn') {
      ops.push(t)
      prevWasValue = false
    } else if (t.kind === 'op') {
      let op: '+' | '-' | '*' | '/' | '^' | 'u-' = t.op
      if ((t.op === '-' || t.op === '+') && !prevWasValue) {
        if (t.op === '+') { continue }
        op = 'u-'
      }
      while (ops.length > 0) {
        const top = ops[ops.length - 1]
        if (top.kind !== 'op' && top.kind !== 'fn') break
        const topPrec = top.kind === 'fn' ? 5 : PRECEDENCE[top.kind === 'op' ? top.op : '']
        const curPrec = PRECEDENCE[op]
        if (topPrec > curPrec || (topPrec === curPrec && !RIGHT_ASSOC.has(op))) {
          if (!popOp()) return null
        } else break
      }
      ops.push({ kind: 'op', op })
      prevWasValue = false
    } else if (t.kind === 'lparen') {
      ops.push(t)
      prevWasValue = false
    } else if (t.kind === 'rparen') {
      let found = false
      while (ops.length > 0) {
        const top = ops[ops.length - 1]
        if (top.kind === 'lparen') { ops.pop(); found = true; break }
        if (!popOp()) return null
      }
      if (!found) return null
      const top = ops[ops.length - 1]
      if (top && top.kind === 'fn') {
        if (!popOp()) return null
      }
      prevWasValue = true
    } else {
      return null
    }
  }

  while (ops.length > 0) {
    const top = ops[ops.length - 1]
    if (top.kind === 'lparen') return null
    if (!popOp()) return null
  }

  if (out.length !== 1) return null
  return out[0]
}

function evalNode(n: Node, x: number): number {
  switch (n.kind) {
    case 'num': return n.value
    case 'var': return x
    case 'neg': return -evalNode(n.v, x)
    case 'fn': return FUNCTIONS[n.name](evalNode(n.arg, x))
    case 'bin': {
      const a = evalNode(n.l, x)
      const b = evalNode(n.r, x)
      switch (n.op) {
        case '+': return a + b
        case '-': return a - b
        case '*': return a * b
        case '/': return a / b
        case '^': return Math.pow(a, b)
      }
    }
  }
}

export function parseExpression(expr: string): CurveFunction | null {
  const trimmed = expr.trim()
  if (!trimmed) return null
  if (trimmed.length > MAX_EXPR_LEN) return null
  const tokens = tokenize(trimmed)
  if (!tokens || tokens.length === 0) return null
  const ast = parse(tokens)
  if (!ast) return null
  const fn: CurveFunction = (x: number) => +evalNode(ast, x)
  try {
    fn(0)
  } catch {
    return null
  }
  return fn
}
