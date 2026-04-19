/**
 * Feature flags — single declaration point.
 *
 * Each flag here has a matching row in `docs/debt-ledger.md` with a dated
 * removal deadline. `scripts/check-debt-ledger.ts` fails CI if a deadline
 * slips; the flag itself is deleted from this file when its closing phase
 * lands.
 */

/**
 * Gates the piecewise-paths + preset-buildable-positions pipeline.
 *
 * @remarks Default `false`. Flipped to `true` in Phase 6 (Piecewise Paths
 * construction plan) once every level is re-authored. Deleted in Phase 7.
 * Do not gate production-critical code paths on this flag outside the
 * migration window.
 */
export const SEGMENTED_PATHS_ENABLED: boolean = true
