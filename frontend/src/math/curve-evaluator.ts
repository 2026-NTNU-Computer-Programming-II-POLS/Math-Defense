import type { CurveDefinition, PolynomialCurve, TrigonometricCurve, LogarithmicCurve } from './curve-types'
import { evaluateCurve, evaluateCurveDerivative, isCurveInDomain } from './WasmBridge'
import { fractionToLatex } from './rational'

// Phase 2 (construction plan): evaluate/evaluateDerivative/isInDomain delegate to
// the WASM bridge so cross-engine ULP drift on Math.sin/cos/log no longer
// leaks into the level generator and curve renderer. The bridge transparently
// falls back to a JS implementation (duplicated inside WasmBridge.ts) when
// the .wasm module hasn't loaded — every consumer keeps its existing
// `evaluate(curve, x)` call site unchanged.

export function evaluate(curve: CurveDefinition, x: number): number {
  return evaluateCurve(curve, x)
}

export function evaluateDerivative(curve: CurveDefinition, x: number): number {
  return evaluateCurveDerivative(curve, x)
}

export function isInDomain(curve: CurveDefinition, x: number): boolean {
  return isCurveInDomain(curve, x)
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
      if (c[0] !== 0) terms.push(c[0] === 1 ? 'x' : c[0] === -1 ? '-x' : `${fractionToLatex(c[0])}x`)
      if (c[1] !== 0 || terms.length === 0) terms.push(fractionToLatex(c[1]))
      break
    case 2:
      if (c[0] !== 0) terms.push(c[0] === 1 ? 'x^2' : c[0] === -1 ? '-x^2' : `${fractionToLatex(c[0])}x^2`)
      if (c[1] !== 0) terms.push(c[1] === 1 ? 'x' : c[1] === -1 ? '-x' : `${fractionToLatex(c[1])}x`)
      if (c[2] !== 0 || terms.length === 0) terms.push(fractionToLatex(c[2]))
      break
    case 3:
      if (c[0] !== 0) terms.push(c[0] === 1 ? 'x^3' : c[0] === -1 ? '-x^3' : `${fractionToLatex(c[0])}x^3`)
      if (c[1] !== 0) terms.push(c[1] === 1 ? 'x^2' : c[1] === -1 ? '-x^2' : `${fractionToLatex(c[1])}x^2`)
      if (c[2] !== 0) terms.push(c[2] === 1 ? 'x' : c[2] === -1 ? '-x' : `${fractionToLatex(c[2])}x`)
      if (c[3] !== 0 || terms.length === 0) terms.push(fractionToLatex(c[3]))
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
