/**
 * Shared display formatters. Centralised so locale/number-format choices
 * (thousand separator, currency glyph, etc.) live in one place instead of
 * drifting across components.
 *
 * Lives under src/utils/ (shared primitives layer) rather than src/domain/
 * so it can be imported freely from systems and components without crossing
 * the layer boundary the arch-check enforces.
 */

export function formatScore(score: number): string {
  return score.toLocaleString()
}

export function formatGold(gold: number): string {
  return gold.toLocaleString()
}

export function toFraction(n: number): string | null {
  for (let d = 2; d <= 10; d++) {
    const num = n * d
    if (Math.abs(num - Math.round(num)) < 1e-9) {
      return `${Math.round(num)}/${d}`
    }
  }
  return null
}

/**
 * Formats a polynomial coefficient for display in an expression string.
 * Returns '' for 1 and '-' for -1 (implicit coefficient convention).
 */
export function formatCoefficient(c: number): string {
  // Float drift (e.g. 0.999999999999 from an ∫→d/dx round-trip) would otherwise
  // render as a degenerate fraction like "(2/2)"; snap near-integers first.
  // Guarded to non-zero integers so a tiny valid coefficient is not shown as 0.
  const nearest = Math.round(c)
  if (nearest !== 0 && Math.abs(c - nearest) < 1e-9) c = nearest
  if (Number.isInteger(c)) {
    if (c === 1) return ''
    if (c === -1) return '-'
    return `${c}`
  }
  const frac = toFraction(c)
  return frac ? `(${frac})` : `${c.toFixed(2)}`
}
