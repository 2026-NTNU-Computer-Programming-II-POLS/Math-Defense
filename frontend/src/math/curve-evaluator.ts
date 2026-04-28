import type { CurveDefinition, PolynomialCurve, TrigonometricCurve, LogarithmicCurve } from './curve-types'

export function evaluate(curve: CurveDefinition, x: number): number {
  switch (curve.family) {
    case 'polynomial': return evaluatePolynomial(curve, x)
    case 'trigonometric': return evaluateTrig(curve, x)
    case 'logarithmic': return evaluateLog(curve, x)
  }
}

function evaluatePolynomial(curve: PolynomialCurve, x: number): number {
  const c = curve.coefficients
  switch (curve.degree) {
    case 1: return c[0] * x + c[1]
    case 2: return c[0] * x * x + c[1] * x + c[2]
    case 3: return c[0] * x * x * x + c[1] * x * x + c[2] * x + c[3]
  }
}

function evaluateTrig(curve: TrigonometricCurve, x: number): number {
  const inner = curve.b * x + curve.c
  const base = curve.fn === 'sin' ? Math.sin(inner) : Math.cos(inner)
  return curve.a * base + curve.d
}

function evaluateLog(curve: LogarithmicCurve, x: number): number {
  const arg = curve.b * x + curve.c
  if (arg <= 0) return NaN
  return curve.a * Math.log(arg) + curve.d
}

export function evaluateDerivative(curve: CurveDefinition, x: number): number {
  switch (curve.family) {
    case 'polynomial': return derivativePolynomial(curve, x)
    case 'trigonometric': return derivativeTrig(curve, x)
    case 'logarithmic': return derivativeLog(curve, x)
  }
}

function derivativePolynomial(curve: PolynomialCurve, x: number): number {
  const c = curve.coefficients
  switch (curve.degree) {
    case 1: return c[0]
    case 2: return 2 * c[0] * x + c[1]
    case 3: return 3 * c[0] * x * x + 2 * c[1] * x + c[2]
  }
}

function derivativeTrig(curve: TrigonometricCurve, x: number): number {
  const inner = curve.b * x + curve.c
  const base = curve.fn === 'sin' ? Math.cos(inner) : -Math.sin(inner)
  return curve.a * curve.b * base
}

function derivativeLog(curve: LogarithmicCurve, x: number): number {
  const arg = curve.b * x + curve.c
  if (arg <= 0) return NaN
  return (curve.a * curve.b) / arg
}

export function isInDomain(curve: CurveDefinition, x: number): boolean {
  if (curve.family !== 'logarithmic') return true
  return curve.b * x + curve.c > 0
}

export function curveToLatex(curve: CurveDefinition): string {
  switch (curve.family) {
    case 'polynomial': return polynomialToLatex(curve)
    case 'trigonometric': return trigToLatex(curve)
    case 'logarithmic': return logToLatex(curve)
  }
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function polynomialToLatex(curve: PolynomialCurve): string {
  const c = curve.coefficients
  const terms: string[] = []
  switch (curve.degree) {
    case 1:
      if (c[0] !== 0) terms.push(c[0] === 1 ? 'x' : c[0] === -1 ? '-x' : `${fmt(c[0])}x`)
      if (c[1] !== 0 || terms.length === 0) terms.push(fmt(c[1]))
      break
    case 2:
      if (c[0] !== 0) terms.push(c[0] === 1 ? 'x^2' : c[0] === -1 ? '-x^2' : `${fmt(c[0])}x^2`)
      if (c[1] !== 0) terms.push(c[1] === 1 ? 'x' : c[1] === -1 ? '-x' : `${fmt(c[1])}x`)
      if (c[2] !== 0 || terms.length === 0) terms.push(fmt(c[2]))
      break
    case 3:
      if (c[0] !== 0) terms.push(c[0] === 1 ? 'x^3' : c[0] === -1 ? '-x^3' : `${fmt(c[0])}x^3`)
      if (c[1] !== 0) terms.push(c[1] === 1 ? 'x^2' : c[1] === -1 ? '-x^2' : `${fmt(c[1])}x^2`)
      if (c[2] !== 0) terms.push(c[2] === 1 ? 'x' : c[2] === -1 ? '-x' : `${fmt(c[2])}x`)
      if (c[3] !== 0 || terms.length === 0) terms.push(fmt(c[3]))
      break
  }
  let result = terms[0]
  for (let i = 1; i < terms.length; i++) {
    const t = terms[i]
    if (t.startsWith('-')) result += ` - ${t.slice(1)}`
    else result += ` + ${t}`
  }
  return `y = ${result}`
}

function trigToLatex(curve: TrigonometricCurve): string {
  const fnName = `\\${curve.fn}`
  const aStr = curve.a === 1 ? '' : curve.a === -1 ? '-' : fmt(curve.a)
  const bStr = curve.b === 1 ? 'x' : `${fmt(curve.b)}x`
  const cStr = curve.c === 0 ? '' : curve.c > 0 ? ` + ${fmt(curve.c)}` : ` - ${fmt(Math.abs(curve.c))}`
  const dStr = curve.d === 0 ? '' : curve.d > 0 ? ` + ${fmt(curve.d)}` : ` - ${fmt(Math.abs(curve.d))}`
  return `y = ${aStr}${fnName}(${bStr}${cStr})${dStr}`
}

function logToLatex(curve: LogarithmicCurve): string {
  const aStr = curve.a === 1 ? '' : curve.a === -1 ? '-' : fmt(curve.a)
  const bStr = curve.b === 1 ? 'x' : `${fmt(curve.b)}x`
  const cStr = curve.c === 0 ? '' : curve.c > 0 ? ` + ${fmt(curve.c)}` : ` - ${fmt(Math.abs(curve.c))}`
  const dStr = curve.d === 0 ? '' : curve.d > 0 ? ` + ${fmt(curve.d)}` : ` - ${fmt(Math.abs(curve.d))}`
  return `y = ${aStr}\\ln(${bStr}${cStr})${dStr}`
}
