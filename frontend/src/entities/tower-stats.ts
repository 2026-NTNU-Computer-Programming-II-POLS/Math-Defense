import type { Tower } from './types'

/**
 * Canonical effective-damage formula — the single definition site for
 * `tower.effectiveDamage` (Phase 7 §7.1). Every system that needs to refresh
 * a tower's damage calls this instead of inlining the product, so the four
 * factors can never drift apart across call sites.
 *
 *   effectiveDamage = baseDamage * damageBonus * magicBuff * interferenceFactor
 *
 * `magicBuff` is owned per-frame by MagicTowerSystem; `interferenceFactor` is
 * owned per-frame by TowerInterferenceSystem. Both go through this helper, so
 * a tower that is simultaneously magic-buffed and interfered-with folds both
 * factors in with no double-application.
 */
export function recomputeEffectiveDamage(tower: Tower): void {
  tower.effectiveDamage =
    tower.baseDamage * tower.damageBonus * tower.magicBuff * tower.interferenceFactor
}
