import { describe, it, expect } from 'vitest'
import {
  evaluateCurve,
  evaluateCurveDerivative,
  isCurveInDomain,
  setUseWasm,
} from './WasmBridge'
import type { CurveDefinition } from './curve-types'

// Runs under happy-dom — exercises the JS fallback only. The fallback is the
// reference implementation lifted from the original curve-evaluator.ts, so
// these tests double as the canonical contract for both backends.

const polyD1: CurveDefinition = { family: 'polynomial', degree: 1, coefficients: [2, -3] }
const polyD2: CurveDefinition = { family: 'polynomial', degree: 2, coefficients: [1, 0, -4] }
const polyD3: CurveDefinition = { family: 'polynomial', degree: 3, coefficients: [0.5, -0.2, 1, 0] }
const trigSin: CurveDefinition = { family: 'trigonometric', fn: 'sin', a: 2, b: 1, c: 0, d: 5 }
const trigCos: CurveDefinition = { family: 'trigonometric', fn: 'cos', a: 1, b: 0.5, c: Math.PI / 4, d: 3 }
const logCurve: CurveDefinition = { family: 'logarithmic', a: 2, b: 1, c: 1, d: 4 }

describe('WasmBridge — curve evaluator (JS fallback)', () => {
  describe('evaluateCurve', () => {
    it('polynomial degree 1: 2x - 3', () => {
      expect(evaluateCurve(polyD1, 0)).toBeCloseTo(-3)
      expect(evaluateCurve(polyD1, 5)).toBeCloseTo(7)
    })

    it('polynomial degree 2: x² - 4', () => {
      expect(evaluateCurve(polyD2, 2)).toBeCloseTo(0)
      expect(evaluateCurve(polyD2, 3)).toBeCloseTo(5)
    })

    it('polynomial degree 3: 0.5x³ - 0.2x² + x', () => {
      expect(evaluateCurve(polyD3, 0)).toBeCloseTo(0)
      expect(evaluateCurve(polyD3, 1)).toBeCloseTo(1.3)
    })

    it('trig sin: 2 sin(x) + 5', () => {
      expect(evaluateCurve(trigSin, 0)).toBeCloseTo(5)
      expect(evaluateCurve(trigSin, Math.PI / 2)).toBeCloseTo(7)
    })

    it('trig cos: cos(0.5x + π/4) + 3', () => {
      expect(evaluateCurve(trigCos, 0)).toBeCloseTo(Math.cos(Math.PI / 4) + 3)
    })

    it('log: 2 ln(x + 1) + 4', () => {
      expect(evaluateCurve(logCurve, 0)).toBeCloseTo(4)
      expect(evaluateCurve(logCurve, Math.E - 1)).toBeCloseTo(6)
    })

    it('log returns NaN out of domain', () => {
      // y = 2 ln(x + 1) + 4 → undefined at x = -2 (arg = -1)
      expect(Number.isNaN(evaluateCurve(logCurve, -2))).toBe(true)
    })
  })

  describe('evaluateCurveDerivative', () => {
    it('polynomial degree 1 derivative is constant', () => {
      expect(evaluateCurveDerivative(polyD1, 0)).toBeCloseTo(2)
      expect(evaluateCurveDerivative(polyD1, 100)).toBeCloseTo(2)
    })

    it('polynomial degree 2: d/dx (x² - 4) = 2x', () => {
      expect(evaluateCurveDerivative(polyD2, 3)).toBeCloseTo(6)
    })

    it('trig sin: d/dx [2 sin(x) + 5] = 2 cos(x)', () => {
      expect(evaluateCurveDerivative(trigSin, 0)).toBeCloseTo(2)
      expect(evaluateCurveDerivative(trigSin, Math.PI)).toBeCloseTo(-2)
    })

    it('log: d/dx [2 ln(x+1) + 4] = 2 / (x + 1)', () => {
      expect(evaluateCurveDerivative(logCurve, 0)).toBeCloseTo(2)
      expect(evaluateCurveDerivative(logCurve, 1)).toBeCloseTo(1)
    })
  })

  describe('isCurveInDomain', () => {
    it('polynomials are everywhere defined', () => {
      expect(isCurveInDomain(polyD1, -100)).toBe(true)
      expect(isCurveInDomain(polyD2, 0)).toBe(true)
      expect(isCurveInDomain(polyD3, 1e6)).toBe(true)
    })

    it('trig is everywhere defined', () => {
      expect(isCurveInDomain(trigSin, -100)).toBe(true)
      expect(isCurveInDomain(trigCos, 1e6)).toBe(true)
    })

    it('log: only defined where b·x + c > 0', () => {
      expect(isCurveInDomain(logCurve, 0)).toBe(true)   // arg = 1
      expect(isCurveInDomain(logCurve, -1)).toBe(false) // arg = 0 (boundary excluded)
      expect(isCurveInDomain(logCurve, -2)).toBe(false) // arg = -1
    })
  })

  it('setUseWasm(false) keeps fallback wired (idempotent)', () => {
    setUseWasm(false)
    expect(evaluateCurve(polyD1, 1)).toBeCloseTo(-1)
    setUseWasm(true)
  })
})
