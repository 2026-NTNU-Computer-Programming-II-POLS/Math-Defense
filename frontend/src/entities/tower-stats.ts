import type { Tower } from './types'

/**
 * Canonical effective-damage formula — the single definition site for
 * `tower.effectiveDamage` (Phase 7 §7.1). Every system that needs to refresh
 * a tower's damage calls this instead of inlining the product, so the four
 * factors can never drift apart across call sites.
 *
 *   effectiveDamage = baseDamage * damageBonus * magicBuff * interferenceFactor
 *                     * (1 + state.towerDamageBonus)
 *
 * `magicBuff` is owned per-frame by MagicTowerSystem; `interferenceFactor` is
 * owned per-frame by TowerInterferenceSystem. The optional buff bonus comes
 * from BuffSystem (additive accumulator on GameState). Test fixtures that
 * don't track game state can omit `state` and get a neutral 1× multiplier.
 */
export function recomputeEffectiveDamage(
  tower: Tower,
  state?: { towerDamageBonus: number },
): void {
  const buffMult = 1 + (state?.towerDamageBonus ?? 0)
  tower.effectiveDamage =
    tower.baseDamage * tower.damageBonus * tower.magicBuff * tower.interferenceFactor * buffMult
}

/**
 * Cooldown read at attack-timer reset time. `tower.cooldown` is the
 * talent/upgrade-adjusted base reload; the buff bonus (towerSpeedBonus) is
 * applied here so new towers and upgraded towers pick up the current value
 * without per-tower mutation. Floor at 1ms to keep timers monotonic.
 */
export function effectiveCooldown(
  tower: Tower,
  state?: { towerSpeedBonus: number },
): number {
  const bonus = state?.towerSpeedBonus ?? 0
  const denom = 1 + bonus
  return denom > 0 ? tower.cooldown / denom : tower.cooldown
}
