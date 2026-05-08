/**
 * Shared presentation formatters. Centralised so locale/number-format
 * choices (thousand separator, currency glyph, etc.) live in one place
 * instead of drifting across components.
 *
 * Lives under src/utils/ rather than src/domain/ because it carries no
 * business logic — just `Intl`-backed display formatting. Importing from
 * `domain/` would have made every consuming component cross a layer
 * boundary the arch-check enforces.
 */

export function formatScore(score: number): string {
  return score.toLocaleString()
}

export function formatGold(gold: number): string {
  return gold.toLocaleString()
}
