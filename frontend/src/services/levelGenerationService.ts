/**
 * levelGenerationService — single entry point for generating a playable level
 * from a (starRating, seed) pair, encapsulating the WASM-vs-JS branch that
 * was previously duplicated across LevelSelectView, TerritoryDetailView, and
 * ReplayView (audit F-ARCH-6).
 *
 * The replay-version contract (construction plan §3.8) lives here:
 *   - When the WASM determinism module is loaded and in use, generate via
 *     the bit-deterministic v2 path and tag the result `replayVersion: 2`.
 *   - Otherwise fall back to the JS path (mulberry32 + Math.*) and tag
 *     `replayVersion: 1`. This matches the tag useSessionSync stamps on
 *     the server-side session row, keeping replay reconstruction in sync.
 *
 * Views that need to *re-create* a level from a recorded (seed, replayVersion)
 * pair use {@link regenerate} — same dispatch, but the version is given,
 * not chosen.
 */
import type { GeneratedLevel } from '@/math/curve-types'
import {
  generateLevel,
  generateLevelDeterministicFromSeed,
} from '@/domain/level/level-generator'
import { mulberry32 } from '@/math/MathUtils'
import { isUsingWasm, whenWasmReady } from '@/math/WasmBridge'

export type ReplayVersion = 1 | 2

export interface GeneratedLevelResult {
  level: GeneratedLevel
  replayVersion: ReplayVersion
}

/**
 * Thrown when the WASM v2 path was selected (because WASM is loaded) but
 * the deterministic generator could not produce a valid layout for the
 * given seed within its retry budget.
 *
 * Callers MUST NOT silently fall back to v1 in this case — useSessionSync
 * tags the session v2 based on isUsingWasm() at create time, so a v1 level
 * paired with a v2 tag would make replays regenerate a different level
 * from the same seed (see construction plan §3.8).
 */
export class LevelGenerationFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LevelGenerationFailedError'
  }
}

/**
 * Generate a fresh level for a player starting a new run.
 *
 * Awaits the WASM ready signal (best-effort) so a load that's still in
 * flight has a chance to land before we commit to the v1 path.
 */
export async function generate(
  starRating: number,
  seed: number,
): Promise<GeneratedLevelResult> {
  await whenWasmReady().catch(() => false)
  if (isUsingWasm()) {
    const v2 = generateLevelDeterministicFromSeed(starRating, seed)
    if (!v2) {
      throw new LevelGenerationFailedError(
        'Level generation failed — the deterministic engine could not produce a ' +
        'valid layout for this seed in 400 attempts. Please try again.',
      )
    }
    return { level: v2, replayVersion: 2 }
  }
  return {
    level: generateLevel(starRating, mulberry32(seed)),
    replayVersion: 1,
  }
}

/**
 * Re-create a level from a recorded (seed, replayVersion) pair. Used by
 * ReplayView to rebuild the engine from a persisted session.
 *
 * Synchronous: callers awaiting WASM readiness must do so themselves
 * before invoking this for a v2 recording.
 */
export function regenerate(
  starRating: number,
  seed: number,
  replayVersion: ReplayVersion,
): GeneratedLevel {
  if (replayVersion === 2) {
    const v2 = generateLevelDeterministicFromSeed(starRating, seed)
    if (!v2) {
      throw new LevelGenerationFailedError(
        'Level could not be regenerated from the recorded seed (WASM v2 path).',
      )
    }
    return v2
  }
  return generateLevel(starRating, mulberry32(seed))
}
