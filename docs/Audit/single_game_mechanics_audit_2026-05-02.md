# Single-Game Mechanics Bug Audit

**Date:** 2026-05-02
**Scope:** Single-game (per-session) mechanics — economy/shop, spells, timing/waves, combat/scoring, towers, and buffs.
**Method:** Five parallel read-only audits performed by exploration agents over the `frontend/src` engine, systems, data, domain, components, and view layers. No files were modified during this audit.

> All findings below are derived from static code reading, not from a running game. Per project policy, anything labelled "verified" was traced through code paths; no green test was used as proof. Reproductions are described from code logic and may need bench testing.

---

## Executive Summary

| Area | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Economy / Shop | 3 | 3 | 4 | 1 | 11 |
| Spells | 0 | 4 | 2 | 4 | 10 |
| Timing / Waves | 1 | 2 | 2 | 2 | 7 |
| Combat / Scoring | 3 | 2 | 0 | 0 | 5 |
| Towers / Buffs | 3 | 5 | 4 | 4 | 17* |
| **Total** | **10** | **16** | **12** | **11** | **49** |

\* Note: Tower/Buff section originally contained 5 "Low" items but two are docs/edge-case items reclassified here.

### Top fixes to ship first

1. **Tower upgrade cost is double-charged on refund** — `TowerUpgradeSystem.ts:48` (Economy #1)
2. **Speed buff revert math is inverted; tower cooldowns drift permanently after the buff expires** — `BuffSystem.ts:57-62` (Towers/Buffs #2)
3. **Magic-buff multiplier is wiped every frame during the magic reset pass** — `MagicTowerSystem.ts:55` (Towers/Buffs #1, #3)
4. **Spawn loop uses `if`, not `while`, and resets the timer instead of accumulating debt** — `WaveSystem.ts:46-62` (Timing #1, #3) — breaks waves after a tab-unfocus or any large `dt`.
5. **Score sent to backend (`score`) ≠ score shown to player (`total_score`)** — `useSessionSync.ts:189 vs 199` (Combat/Scoring #3) — leaderboard authority is ambiguous.
6. **TOCTOU between gold check and gold deduction in placement** — `TowerPlacementSystem.ts:98-111` (Economy #3) — exploitable via rapid placement.
7. **Spells fire and apply effects regardless of game phase** — `SpellSystem.ts:42-67` (Spells #2) — cooldowns also tick during BUILD/BUFF_SELECT (Spells #3).
8. **Shield decrement can go negative when ≥ 2 enemies cross the origin in the same frame** — `EconomySystem.ts:20-26` (Combat/Scoring #2).

---

## 1. Economy / Shop

### CRITICAL

#### E-1. Upgrade cost double-charged on refund
**Severity:** Critical · **File:** `frontend/src/systems/TowerUpgradeSystem.ts:48`

```ts
game.changeGold(-cost)
tower.cost += cost          // Line 48
```

`tower.cost` is mutated to the running total of (purchase + every upgrade). The refund path computes `Math.floor(tower.cost / 2)` (line 78). Net effect: the player pays the upgrade cost once at upgrade time, and then loses half of it again at refund time.

**Repro:** Place Magic Tower (60g) → upgrade (36g) → refund. You receive `floor(96/2) = 48g`. Expected: about 78g (= floor(60/2) + floor(36/2)). The player silently loses ~30g per upgrade tier on every sold-back tower.

**Fix:** Track investment separately from cost. Either keep `tower.cost` as the original purchase price and store upgrade spend in `tower.upgradeSpend`, then refund `floor(tower.cost / 2) + floor(tower.upgradeSpend / 2)`; or simply do not accumulate upgrade cost into `tower.cost`.

#### E-2. Refund silently no-ops on missing tower
**Severity:** Critical · **File:** `frontend/src/systems/TowerUpgradeSystem.ts:73-80`

`_refund()` returns silently if the tower is already gone. The UI in `TowerInfoPanel.vue:59-66` immediately closes the panel without waiting for confirmation, so a stale double-emit (lag spike, double-click, retry) can produce a UI-thinks-success / engine-did-nothing divergence.

**Fix:** Emit `TOWER_REFUND_RESULT { success }` and gate the panel close on it; warn-log on the silent-fail branch.

#### E-3. TOCTOU gap between gold check and deduction in placement
**Severity:** Critical · **File:** `frontend/src/systems/TowerPlacementSystem.ts:98-111`

```ts
if (game.state.gold < cost) { …reject… return }
this._commitPlacement(tower, cost, game)        // gold deducted inside
```

Two placement events queued in the same frame both read the pre-deduction gold. Because `Game.changeGold()` (`Game.ts:268`) clamps to `Math.max(0, …)`, the over-spend is silently absorbed instead of rejected.

**Fix:** Atomically check-and-deduct inside one synchronous block. Optionally, change `changeGold` to refuse a deduction that would go negative and return a boolean.

### HIGH

#### E-4. Upgrade cost can round to zero / no positive-cost guard
**Severity:** High · **File:** `frontend/src/systems/TowerUpgradeSystem.ts:34`

`Math.round(def.cost * tier.costPercent)` is not guarded with `Math.max(1, …)`. A malformed `costPercent ≤ 0` or sub-rounding edge yields free or negative-cost upgrades.

**Fix:** `const cost = Math.max(1, Math.round(def.cost * tier.costPercent))`. Also add a startup validator over `tower-defs.ts` ensuring `cost > 0`.

#### E-5. Refund UI does not wait for engine result
**Severity:** High · **File:** `frontend/src/components/game/TowerInfoPanel.vue:59-66`

(Same root cause as E-2; called out separately because the UI closure is the visible symptom.) Closing the panel before the engine processes the event causes silent failures and stale gold display.

#### E-6. `freeTowerCharges` is not clamped, decrement is not atomic with placement
**Severity:** High · **File:** `frontend/src/systems/TowerPlacementSystem.ts:113-117`

If `freeTowerCharges` drifts negative, the `> 0` guard fails and a paid tower is placed without warning. The decrement and the cost deduction happen in two separate statements with no transactional guarantee.

**Fix:** Clamp `freeTowerCharges` in the setter / state load; combine deduction and counter update in a single helper.

### MEDIUM

#### E-7. Refund ignores `goldMultiplier`
`TowerUpgradeSystem.ts:78` — the kill reward respects `goldMultiplier` (`EconomySystem.ts:36`), but refunds do not. Inconsistent and potentially exploitable when buffs flip the multiplier.

#### E-8. No runtime validation of tower defs
`tower-defs.ts` — add a startup validator (cost > 0, range > 0, damage ≥ 0, all upgrade tiers present).

#### E-9. `costTotal` precision drift
`Game.ts:284-287` — accumulates without a cap; not an immediate exploit but hurts long-game leaderboard integrity.

#### E-10. `init()` listener cleanup is fragile
`EconomySystem.ts:16-60` — relies on `destroy()` being called first. Add an assertion that `_unsubs` is empty before subscribing.

### LOW

#### E-11. Silent gold clamp at zero
`Game.ts:268-271` — `Math.max(0, …)` masks underlying bugs (E-3, E-6). Add a dev-only warning when an attempted deduction would go negative.

---

## 2. Spells

### HIGH

#### S-1. Slow spell stacks duration when re-cast
**Severity:** High · **File:** `frontend/src/systems/SpellSystem.ts:92-93`

```ts
enemy.slowFactor = Math.max(enemy.slowFactor, factor)
enemy.slowTimer  = Math.max(enemy.slowTimer,  duration)
```

Casting a 5 s slow on an enemy that has 3 s remaining replaces the timer with `max(3, 5) = 5`, effectively granting up to 8 s of total slowness. Repeated casts can permanently lock an enemy in slow.

**Fix:** Define the intended semantics — refresh-on-recast vs. independent-stack. If refresh: `enemy.slowTimer = duration` and `slowFactor = max(...)`. If stack: maintain an array of `{factor, timer}` entries.

#### S-2. Spells can be cast outside `WAVE` phase
**Severity:** High · **File:** `frontend/src/systems/SpellSystem.ts:42-67`

`_castSpell` performs no phase guard. Any caller (debug overlay, queued event, rebound handler) can cast during `BUILD`, `BUFF_SELECT`, `MONTY_HALL`, `GAME_OVER`, etc. Heal/buff spells applied during `BUFF_SELECT` are particularly impactful because they alter the choice context.

**Fix:** `if (game.state.phase !== GamePhase.WAVE) return` at the top of `_castSpell`.

#### S-3. Cooldowns tick during all phases
**Severity:** High (related to S-2) · **File:** `frontend/src/systems/SpellSystem.ts:142-153`

The per-frame cooldown decrement runs unconditionally. A spell cast just before a wave ends becomes effectively free during the inter-wave UI screens.

**Fix:** Same phase guard as S-2 (or a broader "is wave time progressing?" predicate shared with `WaveSystem`).

#### S-4. Effects can be applied to enemies that died on the same frame
**Severity:** High · **File:** `frontend/src/systems/SpellSystem.ts:88-95`

`_applyAreaSlow` iterates `game.enemies` directly. If an enemy died earlier in the same frame but is still in the array (cleanup happens later), the slow state is mutated on a corpse.

**Fix:** `if (!enemy.alive) continue` mirroring the damage path. Verify cleanup order.

### MEDIUM

#### S-5. No bounds check on spell target position
`SpellSystem.ts:69-95` — `(x, y)` is trusted. Out-of-grid coordinates waste the cast (gold + cooldown) without any feedback. Add a grid-bounds check in `_castSpell`.

#### S-6. AoE radius boundary semantics undocumented
`SpellSystem.ts:73` — `dist > radius` is "inclusive at the edge". Document this or normalize all AoE checks to one convention.

### LOW

#### S-7. SpellBar UI does not debounce rapid clicks
`components/game/SpellBar.vue:53-62` — quick double-click can fire two `SPELL_CAST` events in one frame. Even with cooldown protection, the UX confuses.

#### S-8. AoE spell with no targets still costs gold + cooldown
`SpellSystem.ts:55-56` — design choice; either show "fizzle" feedback or refund the cost.

#### S-9. SpellSystem missing from event-handler subscriber registry
`engine/event-handlers/registry.ts:189-198` — `systems/SpellSystem` is not listed. Audit whether `destroy()` is reliably called on level transitions.

#### S-10. Heal spell silently no-ops if `BuffSystem` missing
`SpellSystem.ts:116-117` — already guarded by `?.`, so safe; flagged only because the failure is invisible.

---

## 3. Timing / Waves / Game Loop

### CRITICAL

#### T-1. Spawn loop uses `if`, not `while` — large `dt` drops spawns
**Severity:** Critical · **File:** `frontend/src/systems/WaveSystem.ts:46-62`

```ts
if (this._spawnTimer <= 0) {
  const config = this._spawnQueue.shift()!
  this._spawn(config, game)
  this._spawnTimer = this._spawnInterval   // ← reset, not +=
}
return                                      // ← early return, no re-check
```

After a tab unfocus the next frame may have `dt` near the engine's clamp (≈0.1 s). With sub-100 ms intervals — or just any backlog — only one enemy spawns per frame regardless of accumulated debt, then the timer is fully reset (loses the carry-forward). Combined with T-3 below, waves run noticeably slower than designed after any frame drop.

**Fix:**
```ts
while (this._spawnQueue.length > 0 && this._spawnTimer <= 0) {
  this._spawn(this._spawnQueue.shift()!, game)
  this._spawnTimer += this._spawnInterval     // accumulate, do not reset
}
```

### HIGH

#### T-2. `Game.startWave()` desyncs against `PhaseStateMachine`
**Severity:** High · **File:** `frontend/src/engine/Game.ts:338-345`

`startWave()` checks `this.phase.canTransition(WAVE)` against the state machine's internal `_current`, but the rest of the engine reads `this.state.phase`. After any `forceTransition` (tests, dev tooling, recovery flow), the two diverge and `startWave()` silently no-ops.

**Fix:** Drive the check from `this.state.phase`, or make `setPhase` the single source of truth and revert the wave-counter increment if it returns false.

#### T-3. Spawn timer reset loses overshoot debt
**Severity:** High · **File:** `frontend/src/systems/WaveSystem.ts:54`

`_spawnTimer = _spawnInterval` discards the `-Δ` overshoot from the previous frame. Per-spawn drift compounds over a wave; a 30-enemy wave with 16 ms frames can finish noticeably late.

**Fix:** Use `+=` (covered by T-1's patch).

### MEDIUM

#### T-4. Early `return` in WaveSystem masks the wave-end check
`WaveSystem.ts:49-62` — wave-end is only evaluated on frames where the spawn queue is empty; reordering would also let the very last spawn and the wave-end check coexist on the same frame and improve determinism.

#### T-5. No validation that `currentWaves` is non-empty
`composables/useGameLoop.ts:210-211` — if `buildWavesForStar()` returns `[]`, the wave never spawns and never ends. Add an explicit error path.

### LOW

#### T-6. `startWave()` not idempotent
`Game.ts:338-345` — calling twice in `WAVE` either fires twice or silently fails depending on which transition table you read. Add `if (state.phase === WAVE) return` early.

#### T-7. Pause flag may persist into `GAME_OVER`
`views/GameView.vue:138-175` — narrow visual race; the existing watcher fixes most cases.

---

## 4. Combat / Scoring

### CRITICAL

#### C-1. Enemy-reaches-origin is not idempotent → shield/HP races
**Severity:** Critical · **File:** `frontend/src/systems/MovementSystem.ts:125-132`

`ENEMY_REACHED_ORIGIN` is emitted before the enemy is removed and without an `alive`-guard at the call site. If multiple enemies cross within the same `MovementSystem` update, the EconomySystem listener (`EconomySystem.ts:19-30`) is invoked once per enemy — corrupting shield state (see C-2) and potentially decrementing HP after the game-over threshold.

**Fix:** Mark the enemy with an `_emittedReachedOrigin` flag immediately after emission, or remove from `game.enemies` synchronously before emit.

#### C-2. Shield decrement underflows when ≥2 enemies cross in one frame
**Severity:** Critical · **File:** `frontend/src/systems/EconomySystem.ts:20-26`

With `shieldHitsRemaining = 1` and 2 enemies in the same tick: enemy 1 sets it to 0 and disables the shield (correct); enemy 2 still enters the shield branch (because `isShielded` checked the *original* value), decrements again, and the second hit's HP damage is also skipped. Net: a 1-charge shield can absorb 2+ hits.

**Fix:**
```ts
if (isShielded(game.state)) {
  game.state.shieldHitsRemaining = Math.max(0, game.state.shieldHitsRemaining - 1)
  if (game.state.shieldHitsRemaining === 0) game.state.shieldActive = false
  return
}
```
And re-evaluate `isShielded` on each iteration rather than caching.

#### C-3. Two parallel "score" values submitted to backend
**Severity:** Critical · **File:** `frontend/src/composables/useSessionSync.ts:189, 199`

The session syncer sends both `score: state.score` (raw `killValue` sum maintained by `EconomySystem`) and `total_score: calculateScore(...)` (formula in `domain/scoring/`). They are different quantities. Whichever the leaderboard uses determines the actual ranking; nothing in the codebase asserts they agree.

**Fix:** Choose one as authoritative. Drop the other from the payload, or rename so the backend can't be wired to the wrong one. Add a single integration test that verifies the displayed score equals the submitted value.

### HIGH

#### C-4. Split-on-death pattern duplicated across 4 systems
**Severity:** High · **Files:** `CombatSystem.ts:50-58`, `RadarTowerSystem.ts`, `MatrixTowerSystem.ts`, `LimitTowerSystem.ts`

Every damage source re-implements `shouldSplit` → `spawnChildren` → push-to-`game.enemies`. There is no shared depth cap, no single guard against splitting an already-split target twice, and any future split-rule change must be made in 4 places.

**Fix:** Extract to `SplitSystem.handleSplit(enemy, game)` and call from a single death-handler.

#### C-5. Floating-point HP drift across all damage paths
**Severity:** High · **Files:** `RadarTowerSystem.ts:155-166` and identical patterns in `CombatSystem`, `MatrixTowerSystem`, `LimitTowerSystem`, `CalculusTowerSystem`, `SpellSystem`

`enemy.hp -= damage * vulnerability` accumulates IEEE-754 drift across many ticks; the `<= 0` death threshold can fire one tick early or one tick late depending on the exact float trail.

**Fix:** Either round to `1e-4` after each damage application, or model HP as integer milli-units internally. Best path: a single `applyDamage(enemy, raw)` helper called from every damage source.

---

## 5. Towers / Buffs

### CRITICAL

#### TB-1. `MagicTowerSystem` reset wipes the magic-buff multiplier each frame
**Severity:** Critical · **File:** `frontend/src/systems/MagicTowerSystem.ts:55`

```ts
t.effectiveDamage = t.baseDamage * t.damageBonus     // missing * t.magicBuff
```

Every frame the magic system zeroes the magic contribution before recomputing. If recomputation order or condition skips the buffed tower for one frame, the player sees flicker / lost damage. In practice the value is restored later in the same frame for towers within zone, but towers on the boundary (edge of `MagicTowerZone`) lose the multiplier whenever the zone radius decision flips.

**Fix:** `t.effectiveDamage = t.baseDamage * t.damageBonus * t.magicBuff` and only set `magicBuff = 1` for towers that are confirmed *not* in any buff zone this frame.

#### TB-2. Speed buff revert math is inverted
**Severity:** Critical · **File:** `frontend/src/systems/BuffSystem.ts:57-62`

`ALL_TOWERS_SPEED_MULTIPLY_1_15` divides cooldowns (faster — correct), but the matching revert *also* divides instead of multiplying. After the buff expires, cooldowns stay reduced — and stack across re-buys.

**Fix:** Swap the two strategy bodies so apply and revert are exact inverses. Add a unit test: apply → revert returns to original.

#### TB-3. (Companion to TB-1) Active-buff `damageBonus` lost during reset
**Severity:** Critical · **File:** `frontend/src/systems/MagicTowerSystem.ts:52-57`

If `BuffSystem` has already applied a damage-bonus buff to a tower, the magic reset path also stomps that contribution because it recomputes from `baseDamage * damageBonus` without re-running buff projection. Same root cause family as TB-1.

**Fix:** Have a single "compose effective damage" function called by both systems, fed by `baseDamage`, persistent multipliers, and per-frame zone bonuses.

### HIGH

#### TB-4. Monty Hall probability is not 2/3 vs 1/3 for 4+ doors
**Severity:** High · **File:** `frontend/src/systems/MontyHallSystem.ts:104-119`

The reveal-`doorCount-2` rule preserves the classical 2/3-vs-1/3 split *only* for `doorCount === 3`. For 4+ doors the post-reveal probabilities differ; either the rule needs to be "reveal exactly 1 wrong door" with a recomputed switch advantage, or the system should refuse `doorCount > 3`.

**Fix:** Restrict to 3 doors, or reveal one wrong door at a time and document the modified probabilities.

#### TB-5. Calculus tower destruction does not call `BuffSystem.onTowerRemoved`
**Severity:** High · **File:** `frontend/src/systems/CalculusTowerSystem.ts:92-97`

When derivative reduces the exponent to 0 the tower is spliced out, but `BuffSystem` is not notified. Any active buff entries pointing to that tower id remain in `activeBuffs` and the next buff tick mutates a non-existent target.

**Fix:** Call `game.getSystem('buff')?.onTowerRemoved(game, tower.id)` *before* the splice.

#### TB-6. Limit tower destruction has the same bug, plus order-dependent cleanup
**Severity:** High · **File:** `frontend/src/systems/LimitTowerSystem.ts:100-110`

`BuffSystem.onTowerRemoved` is called *after* the tower is already removed, so any cleanup that re-reads `game.towers` finds nothing.

**Fix:** Move the call above the splice (mirror E-1's "destroy-then-publish" pattern correctly).

#### TB-7. Calculus pets carry stale damage after tower upgrade
**Severity:** High · **File:** `frontend/src/systems/CalculusTowerSystem.ts:123`

Pets are spawned with damage baked in. Upgrading the parent tower does not re-propagate.

**Fix:** Resolve pet damage at attack time from `tower.effectiveDamage * pet.abilityMod`.

#### TB-8. Matrix auto-pair can clobber a manual pairing
**Severity:** High · **File:** `frontend/src/systems/MatrixTowerSystem.ts:114-129`

`_autoPair` runs on placement and walks the nearest unpaired Matrix tower, but doesn't refuse to break an existing manual pair on the *target* side once the chosen partner already has `matrixPairId` set.

**Fix:** In `_autoPair`, skip any candidate whose `matrixPairId` is non-null, regardless of the placement source.

### MEDIUM

#### TB-9. Radar A sweep ignores `arcRestrict`
`RadarTowerSystem.ts:57-79` — enemies in the circle but outside the restricted arc are still hit when the sweep angle passes them. Add the arc check at the damage gate.

#### TB-10. Vulnerability multiplier applied at different points in different paths
`CombatSystem.ts:37-38` (DoT, per tick) vs. `RadarTowerSystem.ts:158` (instant, at source). Document or normalize.

#### TB-11. Magic buff zone has an unexplained `* 2` width
`MagicTowerSystem.ts:99 vs 105` — buff zone is twice as wide as the debuff zone for the same curve. Either intentional and undocumented, or a copy-paste artefact.

#### TB-12. Pet target-validation race
`CalculusTowerSystem.ts:150-195` — pet may fire on the same frame the target dies; current `alive` guard mostly covers it but the ordering is fragile.

### LOW

#### TB-13. Crit chance unbounded
`RadarTowerSystem.ts:100-107` — clamp `[0, 1]` defensively.

#### TB-14. `applyExternalBuff` doesn't gate on `duration > 0`
`BuffSystem.ts:198 vs 220-231` — minor inconsistency between purchase path and external path.

#### TB-15. Monty Hall reward buff lost on `LEVEL_START` revert
`MontyHallSystem.ts:138-147` and `BuffSystem.ts:176-179` — affects only mid-transition timing.

#### TB-16. Matrix pair-change leaks stale laser entries
`MatrixTowerSystem.ts:20-25` — `_lasers` map keyed by sorted ids retains the old key after re-pair. Memory only; no gameplay impact unless re-pairing is frequent.

---

## Cross-Cutting Themes

1. **Phase guards are inconsistent.** `WaveSystem` checks `phase === WAVE`, `SpellSystem` does not, `BuffSystem` cooldown ticks unconditionally. Decide on one rule (likely: "only `WAVE` advances gameplay timers") and apply it in every `update(dt, game)`.
2. **Two state machines, one phase.** `GameState.phase` and `PhaseStateMachine._current` can diverge (T-2). Pick one as canonical and have the other mirror it.
3. **Damage is computed in 6 places.** Every tower system re-implements `dmg * vulnerability - shield`, splitting, and HP threshold checks. Centralize into a single `applyDamage()` helper to fix C-4, C-5, TB-10 in one place.
4. **`BuffSystem.onTowerRemoved` is the unwritten contract.** Three of four tower-deletion paths forget it (TB-5, TB-6 and the implicit case for any new tower type). Either invert the relationship (BuffSystem subscribes to a `TOWER_REMOVED` event emitted exactly once by a death handler), or wrap removals in a helper that always notifies.
5. **UI/engine round-trips are fire-and-forget.** Refunds (E-2/E-5), spell casts, and several buff purchases close the panel before confirmation. Add result events with explicit success/failure payloads.
6. **`Math.max(0, …)` clamping hides bugs.** Gold (E-11), shield (C-2), `freeTowerCharges` (E-6) all clamp instead of asserting. Add dev-mode warnings on every clamp event so future regressions surface.

---

## Suggested Remediation Order

1. **Round 1 (critical fixes, ~1 day):** E-1, E-3, TB-1/3, TB-2, T-1+T-3, C-2, C-3, S-2+S-3.
2. **Round 2 (high fixes, ~1 day):** E-2/E-5/E-6, S-1, S-4, T-2, C-1, C-4, C-5, TB-4 through TB-8.
3. **Round 3 (cleanup):** Centralize damage application, normalize phase guards, audit every tower-removal site for `onTowerRemoved`, add the "single score-of-record" invariant test.

---

## Test Coverage Gaps Worth Filling

- Same-frame multi-enemy origin crossings with shield active (C-1, C-2).
- Tab-unfocus then resume mid-wave with frame `dt` near the clamp (T-1, T-3).
- Buff apply → revert returns to identical numeric state for every effect strategy (TB-2 family).
- Magic buff multiplier preserved across one full game tick on every tower in zone, edge of zone, and just outside (TB-1, TB-3).
- Refund total over place + N upgrades + sell equals the design intent (E-1).
- `score` field submitted to backend == `total_score` shown on `ScoreResultView` (C-3).
- Calculus tower destroyed by derivative leaves no entries in `state.activeBuffs` (TB-5).

— end of report —
