/**
 * Shared presentation formatters. Centralised so locale/number-format
 * choices (thousand separator, currency glyph, etc.) live in one place
 * instead of drifting across components.
 */

export function formatScore(score: number): string {
  return score.toLocaleString()
}

export function formatGold(gold: number): string {
  return gold.toLocaleString()
}
