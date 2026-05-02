export type CurveFunction = (x: number) => number

export function parseExpression(expr: string): CurveFunction | null {
  const trimmed = expr.trim()
  if (!trimmed) return null
  try {
    let s = trimmed
    s = s.replace(/\^/g, '**')
    s = s.replace(/(\d)(x)/g, '$1*$2')
    s = s.replace(/\bsin\b/g, 'Math.sin')
    s = s.replace(/\bcos\b/g, 'Math.cos')
    s = s.replace(/\btan\b/g, 'Math.tan')
    s = s.replace(/\bln\b/g, 'Math.log')
    s = s.replace(/\blog\b/g, 'Math.log')
    s = s.replace(/\bsqrt\b/g, 'Math.sqrt')
    s = s.replace(/\babs\b/g, 'Math.abs')
    s = s.replace(/\bexp\b/g, 'Math.exp')
    s = s.replace(/\bpi\b/g, 'Math.PI')
    s = s.replace(/(\d)(Math)/g, '$1*$2')
    // new Function is intentional: player inputs their own expression in their own browser.
    // eslint-disable-next-line no-new-func
    const fn = new Function('x', `"use strict"; return +(${s})`) as CurveFunction
    fn(0)
    return fn
  } catch {
    return null
  }
}
