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
