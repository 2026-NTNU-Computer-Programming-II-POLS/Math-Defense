export type CurveFamily = 'polynomial' | 'trigonometric' | 'logarithmic'

export type PolynomialDegree = 1 | 2 | 3

export interface PolynomialCurve {
  readonly family: 'polynomial'
  readonly degree: PolynomialDegree
  readonly coefficients: readonly number[]
}

export interface TrigonometricCurve {
  readonly family: 'trigonometric'
  readonly fn: 'sin' | 'cos'
  readonly a: number
  readonly b: number
  readonly c: number
  readonly d: number
}

export interface LogarithmicCurve {
  readonly family: 'logarithmic'
  readonly a: number
  readonly b: number
  readonly c: number
  readonly d: number
}

export type CurveDefinition = PolynomialCurve | TrigonometricCurve | LogarithmicCurve

export type PathType = 'A' | 'B' | 'C'

export function curveToPathType(curve: CurveDefinition): PathType {
  switch (curve.family) {
    case 'polynomial': return 'A'
    case 'trigonometric': return 'B'
    case 'logarithmic': return 'C'
  }
}

/**
 * Disclosure region — the bounding box revealed to the player. The level
 * generator guarantees that the unique common intersection of all curves
 * inside this rectangle is the endpoint P*.
 */
export interface DisclosureRegion {
  readonly xMin: number
  readonly xMax: number
  readonly yMin: number
  readonly yMax: number
}

export interface GeneratedLevel {
  readonly curves: readonly CurveDefinition[]
  /** P* — the unique common intersection of all curves inside `region`. */
  readonly endpoint: { readonly x: number; readonly y: number }
  /** Disclosure box shown to the player (covers P* but not its precise location). */
  readonly region: DisclosureRegion
  /**
   * Domain x-range used by the path/curve renderer. Spans from the leftmost
   * spawn x to the rightmost spawn x across all curves.
   */
  readonly interval: readonly [number, number]
  readonly starRating: number
  readonly multisetLabel: string
}

export const COEFFICIENT_BOUNDS = {
  polynomial: {
    1: { slope: [-3, 3], intercept: [-10, 14] },
    2: { a: [-0.5, 0.5], b: [-3, 3], c: [-5, 20] },
    3: { a: [-0.02, 0.02], b: [-0.3, 0.3], c: [-2, 2], d: [-5, 15] },
  },
  trigonometric: {
    a: [0.5, 3],
    b: [0.3, 2],
    c: [-Math.PI, Math.PI],
    d: [2, 12],
  },
  logarithmic: {
    a: [0.5, 4],
    b: [0.2, 2],
    c: [1, 10],
    d: [2, 12],
  },
} as const
