/**
 * Deterministic seeded RNG shared by visual layers.
 *
 * Originally lifted verbatim from `renderers/SpellEffectRenderer.ts`; promoted
 * to a shared module so every effect / particle layer can route its
 * randomness through the same surface, keeping replays reproducible.
 *
 * IMPORTANT: this is for visual / cosmetic randomness only. Game-state RNG
 * must continue to flow through `game.rng` (mulberry32 or PCG-in-WASM).
 */

/**
 * Deterministic [0, 1) draw seeded by `(seed, index)`. Same inputs always
 * return the same value — `Math.sin`-based hash, not statistically strong,
 * but cheap and stable across engines.
 */
export function seededUnit(seed: number, index: number): number {
  const n = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453
  return n - Math.floor(n)
}

/**
 * Derive an integer seed from a string key + a coordinate pair. Used to give
 * each spawned effect a stable per-instance seed so its particle layout is
 * reproducible across replays.
 */
export function seedFor(key: string, x: number, y: number): number {
  let seed = Math.round(x * 97 + y * 193)
  for (let i = 0; i < key.length; i++) seed += key.charCodeAt(i) * (i + 11)
  return seed
}
