# Balance Overhaul Implementation Plan

> **Status:** Approved — pending execution
> **Scope:** 19 approved balance changes across scoring, combat, towers, pets, talents, economy, and Monty Hall systems
> **Estimated total effort:** ~2–3 weeks (split across 8 phases)
> **Generated:** 2026-05-26
> **Last revised:** 2026-05-27 (post-verification corrections, see §"Pre-Implementation Corrections" below)

This plan implements the 19 balance changes approved during the design review. Changes are grouped into **eight phases** ordered by risk (low → high) and dependency. Each phase is self-contained and can ship independently behind feature flags if needed.

---

## Pre-Implementation Corrections (2026-05-27)

A second-pass verification against the live codebase surfaced these corrections to the original draft. Every phase below has been updated; this section is the changelog.

### Architectural corrections

1. **`GameState` is a TypeScript interface, not a class** (`frontend/src/engine/GameState.ts:14-64`). The original draft proposed `get goldMultiplier()` and `get shieldReductionFactor()` computed accessors — neither compiles on an interface. **Revised approach:** add the new fields directly to the interface, initialize them in `createInitialState()` (line 70-104), and let `BuffSystem` write the derived values explicitly.

2. **`goldMultiplier` has a missed consumer** in `frontend/src/systems/TowerUpgradeSystem.ts:88` (`refund = Math.round(base * game.state.goldMultiplier)`). The Phase 5 (Q15) refactor must preserve this read or the refund math will silently drift. Total readers: **2** (EconomySystem + TowerUpgradeSystem); total writers: **4** (BuffSystem effect handlers).

3. **`BULWARK` does NOT currently have `towerDamageMult`** (`frontend/src/data/enemy-defs.ts:169` only carries `damageCapPerHit: 14`). The Phase 3 (Q6) change must **add** the field for the first time; the existing evasion block (`SplitPolicy.ts:149-152`) already handles `towerDamageMult < 1` for SWARMLING and will apply to BULWARK once the field is added. The default at `EnemyFactory.ts:61` (`def.towerDamageMult ?? 1`) means absent enemies are unaffected.

4. **`backend/app/shared_constants.py` does NOT mirror `waveCompletionBonus`** — it only exports `INITIAL_HP` and `INITIAL_GOLD`. The backend has zero readers of wave bonus values; Phase 1 (Q16) only needs the JSON edit. Drop the planned Python mirror update.

### Missing files / tests

5. The following test files **do not yet exist** and must be **created** (not updated) by the phase that adds the feature:
   - `frontend/src/systems/__tests__/MontyHallSystem.test.ts` (Phase 5, Q18)
   - `frontend/src/systems/__tests__/MagicTowerSystem.test.ts` (Phase 6, Q7)
   - `frontend/src/systems/__tests__/MatrixTowerSystem.test.ts` (Phase 1, Q9)
   - `frontend/src/systems/__tests__/PetCombatSystem.test.ts` (Phase 4, Q10)
   - `frontend/src/entities/__tests__/PetFactory.test.ts` (Phase 4, Q11/Q12)

   Pet-count and pet-attack-speed assertions can also be folded into the existing `CalculusTowerSystem.test.ts` if a dedicated file is overkill.

### Missing migration / docs

6. **Pet-HP talent removal requires an Alembic migration.** Talent allocations are persisted in `talent_allocations` table (`backend/app/models/talent.py:8-26`) keyed by `talent_node_id` string. Phase 4 (Q10) must add a new Alembic revision under `backend/alembic/versions/` that runs:
   ```sql
   DELETE FROM talent_allocations WHERE talent_node_id = 'calculus_pet_hp';
   ```
   No TP refund logic is needed — spent TP is computed dynamically as `sum_achievement_points - sum(allocations)` (see `backend/app/application/achievement_service.py:82`), so deleting the rows naturally returns the points.

7. **Public manual references pet_hp** at `frontend/public/manual/towers-and-enemies.md`. Phase 4 (Q10) must update this file so the in-game documentation matches the new `pet_range` talent.

### Non-issues (originally suspected, verified safe)

- **i18n**: no i18n framework is in use; tower descriptions are plain hardcoded English strings in `tower-defs.ts`. No translation work needed.
- **`MontyHallSystem.ts` exists** at `frontend/src/systems/MontyHallSystem.ts`. The Q18 insertion point is the reward selection in `_startEvent`, lines 103-105:
  ```ts
  const reward = MONTY_HALL_REWARD_POOL[Math.floor(this._rng() * MONTY_HALL_REWARD_POOL.length)]
  ```
- **`TowerFactory.ts` exists** at `frontend/src/entities/TowerFactory.ts`.
- **`damageCapPerHit` is safe to leave on the interface** even after BULWARK stops using it — `EnemyFactory.ts:60` defaults absent values to `0`, and `SplitPolicy.ts:142` no-ops on `> 0` check. A second sweep to delete the field is optional, not required.

---

---

## Phase Overview

| Phase | Theme | Risk | Effort | Depends on |
|-------|-------|------|--------|------------|
| **0** | Preparation & tooling | — | 0.5d | — |
| **1** | Numerical tweaks (quick wins) | Low | 1d | 0 |
| **2** | Scoring formula (WASM/Python/TS lock-step) | **High** | 2d | 0 |
| **3** | Combat mechanic changes | Medium | 1.5d | 0 |
| **4** | Pet system overhaul | Medium | 1.5d | 0 |
| **5** | Economy & Monty Hall gating | Medium | 1.5d | 0 |
| **6** | Tower differentiation (MAGIC + LIMIT) | **High** | 4–5d | 3 |
| **7** | Talent tree expansion | Medium | 2d | 4, 6 |
| **8** | Post-deployment validation | — | 1d | All |

---

## Phase 0 — Preparation & Tooling

**Goal:** De-risk the rollout by establishing fixture regeneration, baseline metrics, and a feature-flag pattern.

### Tasks

1. **Create a long-lived branch** `feat/balance-overhaul-2026-05` off `main`.
2. **Document the fixture regeneration workflow** for `shared/score_parity_fixtures.json`.
   - Locate or author a script that takes representative `(active_time, kill_value, cost_total, ...)` inputs and produces expected outputs from the current Python implementation.
   - Add a `make regenerate-fixtures` target (or npm script) for future use.
3. **Record baseline metrics** (manual or scripted) for ~20 typical replays at each star level. Capture:
   - Final score
   - Total gold earned
   - Pet count at game end
   - Talent points spent
   These are the "before" snapshots used in Phase 8 validation.
4. **Audit `backend/app/domain/constraints.py:22, 50, 58`** — write down current `TOTAL_SCORE_MAX`, `LEVEL_MAX_SCORES`, `LEVEL_MAX_KILLS` so Phase 2 has a known starting point.
5. **Confirm WASM build pipeline**: `cd wasm && make` produces `frontend/src/math/wasm/math_engine.{js,wasm}` and the `.d.ts`. Verify locally.

### Acceptance Criteria

- [ ] Branch created and pushed
- [ ] Fixture regeneration script committed and documented in `wasm/README.md` (or equivalent)
- [ ] Baseline metrics file checked in at `docs/V2_implementation/balance-baseline-2026-05.md`
- [ ] `make` from the `wasm/` directory builds cleanly on a fresh checkout

---

## Phase 1 — Numerical Tweaks (Quick Wins)

**Goal:** Land low-risk, mechanically-isolated value changes first to build deployment confidence and reduce later merge conflicts.

### Changes in this phase

| ID | Description |
|----|-------------|
| Q9 | MATRIX: base damage 0 → 1; tower-info UI shows "Pairing required" hint |
| Q11 | Pet attack speed: `0.85^(lv−1)` → `max(0.1, 1 − 0.1·(lv−1))` (linear) |
| Q13 | Talent TP cost: 4 "qualitative" nodes go from 2 TP/lv to 3 TP/lv |
| Q16 | Wave completion bonus: `25 + 8·star` → `10 + 20·star` |
| Q17 | Monty Hall 5★ 4th threshold: 1400 → 1000 |
| Q19 | Enemy reward unified: `reward = round(killValue × 1.5)` for all 9 enemies |

### Files Modified

**Q9 — MATRIX base damage + UI hint**
- `frontend/src/data/tower-defs.ts:138` — `damage: 0` → `damage: 1`
- `frontend/src/data/tower-defs.ts:142` — update description
- `frontend/src/systems/MatrixTowerSystem.ts` — verify base damage is added to dot-product output (not replaced)
- Tower info panel under `frontend/src/components/` — add "Pairing Required" label when `matrixPairId == null`
- `frontend/public/manual/towers-and-enemies.md` — update MATRIX section if it claims `damage: 0`
- **New test file**: `frontend/src/systems/__tests__/MatrixTowerSystem.test.ts` (does not currently exist) — minimal coverage: unpaired tower deals 1 base damage; paired tower deals 1 + dot product

**Q11 — Pet attack speed linear**
- `frontend/src/entities/PetFactory.ts:42`:
  ```ts
  // before
  const levelAtkMult = Math.pow(0.85, level - 1)
  // after
  const levelAtkMult = Math.max(0.1, 1 - 0.1 * (level - 1))
  ```

**Q13 — Talent TP cost**
- `backend/app/domain/talent/definitions.py:33, 42, 47, 51` — change `cost_per_level=2` → `cost_per_level=3` on:
  - `magic_duration`
  - `radar_b_targets`
  - `radar_c_targets`
  - `matrix_targets`
- `frontend/src/data/talent-defs.ts` — mirror the same 4 entries (`costPerLevel: 3`)

**Q16 — Wave completion bonus**
- `shared/game-constants.json:37`:
  ```json
  "waveCompletionBonus": { "base": 10, "perStar": 20 }
  ```
- `frontend/src/systems/EconomySystem.ts:45` — no code change (formula is already `base + perStar·star`)
- **No backend code change.** `backend/app/shared_constants.py` only exposes `INITIAL_HP` and `INITIAL_GOLD`; no Python reader of `waveCompletionBonus` exists.
- `backend/tests/test_shared_constants_parity.py` — confirm it does NOT pin the wave bonus value; if it does, update the expected value

**Q17 — MH 5★ 4th threshold**
- `frontend/src/data/monty-hall-defs.ts:31` — `killValue: 1400` → `killValue: 1000`

**Q19 — Enemy reward unification**
- `frontend/src/data/enemy-defs.ts` — for each enemy entry:

  | Enemy | killValue | old reward | new reward |
  |-------|-----------|------------|------------|
  | GENERAL | 10 | 15 | **15** (unchanged) |
  | FAST | 5 | 10 | **8** |
  | STRONG | 25 | 40 | **38** |
  | SPLIT | 5 | 15 | **8** |
  | HELPER | 15 | 30 | **23** |
  | BOSS_A | 100 | 200 | **150** |
  | BOSS_B | 150 | 300 | **225** |
  | REGENERATOR | 20 | 35 | **30** |
  | BULWARK | 30 | 50 | **45** |
  | SWARMLING | 4 | 6 | **6** (unchanged) |

  Use `Math.round(killValue * 1.5)`.

### Tests to Update

- `frontend/src/systems/__tests__/EconomySystem.test.ts` — wave bonus + enemy reward expectations
- `frontend/src/entities/__tests__/PetFactory.test.ts` (or equivalent) — pet attack-speed at levels 2, 5, 10
- `backend/tests/test_talent.py` — talent-cost totals for builds touching the 4 changed nodes
- `frontend/src/data/tower-defs.test.ts` — MATRIX `damage` field (note: file lives at `data/tower-defs.test.ts`, NOT under `__tests__/`)
- Monty Hall threshold test (currently no dedicated MontyHallSystem.test.ts file exists; create it in Phase 5 with both the Q17 threshold case and the Q18 gating cases)

### Acceptance Criteria

- [ ] All 6 changes land in a single PR titled `balance(phase1): numerical tweaks`
- [ ] All affected tests updated and green
- [ ] No WASM rebuild required for this phase
- [ ] Manual smoke test of a 1★, 3★, and 5★ run — record new gold totals

### Risk & Mitigation

- **Q19 is a broad nerf** to all non-trivial enemies. Pair with Q16 (wave-bonus increase at high star) in the same PR so high-star players are not net-negative.
- **Q17** widens the time window the 4th MH event triggers; if it triggers significantly earlier than intended in playtest, raise to 1100.

---

## Phase 2 — Scoring Formula (WASM + Python + TS Lock-Step)

**Goal:** Replace the brittle piecewise K-weight and harsh exponent penalty with smoother formulations, keeping all three implementations bit-identical.

### Changes

| ID | Description |
|----|-------------|
| Q1 | `Score = K^(1/denom)` → `Score = K^(1/sqrt(denom))` |
| Q3 | Piecewise K-weight → continuous `α = S1/(S1+S2); K = α·S1 + (1−α)·S2` |

### Files Modified (must change together)

**C source (canonical)**
- `wasm/math_engine.c:148-153` — replace if/else with continuous blend:
  ```c
  double denom_k = s1 + s2;
  double alpha   = (denom_k > 0.0) ? (s1 / denom_k) : 0.0;
  k = alpha * s1 + (1.0 - alpha) * s2;
  ```
- `wasm/math_engine.c:155-161` — soften exponent:
  ```c
  double exponent_denom = 1.0 + (2.0 + health_origin - health_final - (double)initial_answer);
  if (exponent_denom < 1.0) exponent_denom = 1.0;
  double exponent = 1.0 / sqrt(exponent_denom);
  ```

**Python mirror**
- `backend/app/domain/scoring/score_calculator.py:85-101` — apply both changes; ensure `math.sqrt` import is present.

**TypeScript breakdown**
- `frontend/src/domain/scoring/score-calculator.ts:44-65` — apply both changes (this file is read by tooltips/replay UI; final score still comes from WASM).

### Required Workflow

1. Edit `wasm/math_engine.c`.
2. Run `cd wasm && make` — confirm `.js`/`.wasm` outputs change.
3. Edit `backend/app/domain/scoring/score_calculator.py`.
4. Edit `frontend/src/domain/scoring/score-calculator.ts`.
5. **Regenerate `shared/score_parity_fixtures.json`** using the script established in Phase 0.
6. Run all three test suites — they must agree to within the tolerance defined in `test_score_calculator_parity.py`.

### Tests to Update / Regenerate

- `backend/tests/test_score_calculator_parity.py` — re-validate with new fixtures
- `backend/tests/test_wasm_runtime.py` — `test_pow_handles_realistic_score_input` expected values
- `backend/tests/test_score_verify.py` — anti-cheat verifier baselines (7 cases)
- `backend/tests/test_game_session.py` — `test_session_scoring_validation` (2 cases)
- `backend/tests/test_leaderboard.py` — submission baselines (4 cases)
- `backend/tests/test_achievement.py:173` — score-based achievement threshold
- `frontend/src/domain/scoring/score-calculator.parity.test.ts` — TS-side parity
- Any leaderboard/HUD snapshot tests showing concrete score numbers

### Constraints Audit (required before merge)

After fixture regeneration, recompute the maximum realistic score per star level (use Phase 0 baselines as input). If any level's typical max exceeds the current cap in `backend/app/domain/constraints.py:50`, **raise the cap by ~20%** rather than letting legitimate plays be rejected.

Current caps (from `constraints.py:50-56`):
```
Level 1: 5,000
Level 2: 10,000
Level 3: 15,000
Level 4: 50,000
Level 5: 100,000
```

`TOTAL_SCORE_MAX = 1,000,000` should not need changing (still ~10× any level-5 cap).

### Acceptance Criteria

- [ ] All 3 implementations (C, Python, TS) updated in one PR
- [ ] Regenerated parity fixtures committed
- [ ] All parity tests green within tolerance (`abs_tol = 1e-6`, `rel_tol = 1e-9`)
- [ ] Anti-cheat caps reviewed and updated if necessary
- [ ] At least 5 historical replays re-scored manually — document old vs new scores in PR description

### Risk & Mitigation

- **Leaderboard discontinuity** — scores under the new formula are not directly comparable to historical scores. **Mitigation:** add a `formula_version` column to the leaderboard table OR clear the leaderboard at deployment time (operator decision).
- **WASM/Python drift** — if fixtures pass but a player's score is rejected by the verifier, suspect floating-point divergence. **Mitigation:** the parity tolerance in `test_score_verify.py` should be loose enough (~1e-4 relative) to absorb minor pow/sqrt ULP differences between platforms.

---

## Phase 3 — Combat Mechanic Changes

**Goal:** Reduce binary outcomes (shield = full immunity, BULWARK = hard cap) by replacing them with smoother damage reductions.

### Changes

| ID | Description |
|----|-------------|
| Q4 + Q5 | Boss damage stays 99, but the player shield buff now reduces each absorbed hit by **50%** (still 3 hits, still 30s). |
| Q6 | BULWARK: remove `damageCapPerHit: 14` and rely on `towerDamageMult: 0.4` (60% reduction from tower sources). |

### Files Modified

**Q4 + Q5 — Shield as damage reduction**
- `frontend/src/engine/GameState.ts:14-64` — add field to the `GameState` interface:
  ```ts
  shieldReductionFactor: number  // 1 = no reduction (inactive default); 0.5 = halve each absorbed hit
  ```
  And add the default to `createInitialState()` at line 70-104:
  ```ts
  shieldReductionFactor: 1,
  ```
- `frontend/src/systems/BuffSystem.ts:96` — update `SHIELD_ACTIVATE` to set the factor when the shield turns on, and add the matching revert handler:
  ```ts
  SHIELD_ACTIVATE: (g) => {
    g.state.shieldActive = true
    g.state.shieldHitsRemaining = 3
    g.state.shieldReductionFactor = 0.5
  },
  SHIELD_DEACTIVATE: (g) => {
    g.state.shieldActive = false
    g.state.shieldHitsRemaining = 0
    g.state.shieldReductionFactor = 1
  },
  ```
  (`SHIELD_DEACTIVATE` is already referenced as `revertId` in `buff-defs.ts:108`; verify it exists in BuffSystem and update accordingly.)
- `frontend/src/systems/EconomySystem.ts:25-33` — replace the current early-return immunity with a per-hit reduction:
  ```ts
  game.eventBus.on(Events.ENEMY_REACHED_ORIGIN, (enemy) => {
    let dmg = enemy.damage ?? 1
    if (game.state.shieldActive && game.state.shieldHitsRemaining > 0) {
      dmg = Math.ceil(dmg * game.state.shieldReductionFactor)
      game.state.shieldHitsRemaining = Math.max(0, game.state.shieldHitsRemaining - 1)
      if (game.state.shieldHitsRemaining === 0) game.state.shieldActive = false
    }
    if (game.state.hp <= 0) return
    this.changeHp(-dmg)
  }),
  ```
  Note: with Boss damage = 99 and `Math.ceil(99 * 0.5) = 50`, a player at 100 HP survives one boss hit (down to 50) instead of dying outright. After 3 hits, the shield deactivates and a 4th boss hit deals the full 99 (kills).
- `frontend/src/data/buff-defs.ts:102` — update description: `'Halve the next 3 damage hits for 30s'`.
- `frontend/src/engine/GameState.ts:66-68` — `isShielded()` helper continues to work as-is (it only checks `shieldActive`); no change needed.

**Q6 — BULWARK damage multiplier instead of cap**
- `frontend/src/data/enemy-defs.ts:169` — two-line change:
  - **Delete** `damageCapPerHit: 14,`
  - **Add** `towerDamageMult: 0.4,` (BULWARK does NOT currently have this field; we're introducing it for the first time)
- `frontend/src/domain/combat/SplitPolicy.ts` — **no code change needed**. The existing evasion block at lines 149-152 already handles `towerDamageMult < 1`:
  ```ts
  if (enemy.towerDamageMult < 1 && source !== 'pet' && source !== 'effect') {
    remaining *= enemy.towerDamageMult
    evaded = true
  }
  ```
  Once BULWARK's `towerDamageMult` is set to 0.4 in `enemy-defs.ts`, all tower hits (not pets, not effects) will be multiplied by 0.4 automatically. `EnemyFactory.ts:61` (`def.towerDamageMult ?? 1`) already passes the field through.
- The `damageCapPerHit: 14` deletion makes the cap-14 block at `SplitPolicy.ts:142-145` a no-op for BULWARK (because `damageCapPerHit > 0` is now false). Cap-14 logic stays in place for any future enemy that might use it.
- Decision: keep SWARMLING's `towerDamageMult: 0.35` as-is (different enemy, different design intent).
- The `DAMAGE_RESOLVED` event at line 159 will now fire with `kind: 'reduced'` for BULWARK hits (was `'capped'`). Verify any UI that distinguishes the two kinds.

### Tests to Update

- `frontend/src/systems/__tests__/BuffSystem.test.ts` — shield activation/deactivation, hit decrement, and **factor reset on deactivate** (new assertion: `shieldReductionFactor` is 1 after expiry).
- `frontend/src/systems/__tests__/EconomySystem.test.ts` — replace "shield prevents HP loss" with "shield halves origin damage": expect 1-HP loss from a 1-damage enemy (ceil(1×0.5) = 1) but 50-HP loss from a 99-damage boss (ceil(99×0.5) = 50).
- `frontend/src/systems/__tests__/CounterEnemy.e2e.test.ts:34-100` — BULWARK now reduces 40 → 16 via mult-0.4 (not caps to 14). Three assertions change: the 40-damage tower-hit test, the 40-damage tower-tick test, and the Matrix-laser-beats-cap test (rename to "Matrix-laser is not affected by towerDamageMult").
- `frontend/src/domain/combat/SplitPolicy.test.ts:112-165` — keep "per-hit cap (damageCapPerHit)" tests as regression guards (the cap mechanic still exists, just not used by BULWARK). Move the BULWARK-specific subset to a new "towerDamageMult" group.
- `frontend/src/entities/__tests__/EnemyFactory.test.ts:34-36` — BULWARK assertion changes from `damageCapPerHit: 14` to `towerDamageMult: 0.4`. `damageCapPerHit` defaults to 0 for BULWARK now.

### Acceptance Criteria

- [ ] Shield correctly halves all 3 absorbed hits, then deactivates
- [ ] BULWARK takes ~40% of all tower damage (Radar_C 40→16, MAGIC 8→3)
- [ ] No remaining references to `damageCapPerHit` in code or tests (if field is removed)
- [ ] Manual: Boss reaches origin with shield active → player loses ~50 HP per boss (down from 0 with old shield)

### Risk & Mitigation

- **Shield interaction with non-origin damage** — verify the shield only applies to player-targeted damage. The current `isShielded()` check is in `EconomySystem.ts:25` (ENEMY_REACHED_ORIGIN), so it should not affect tower→enemy damage. Confirm during code review.
- **BULWARK + SWARMLING stacking** — neither enemy is the other, so no stacking. Just confirm `towerDamageMult` is not double-applied if both fields somehow overlap.

---

## Phase 4 — Pet System Overhaul

**Goal:** Remove the dead `pet_hp` talent, prevent exponential pet-count exploits, and add a usable replacement talent.

### Changes

| ID | Description |
|----|-------------|
| Q10 | Remove `calculus_pet_hp`; add `calculus_pet_range` (+20% pet attack range per level, max 3, prereq `calculus_pet_speed`). |
| Q12 | Pet count: `(isInteger ? coefficient : 1) + bonusCount` → `floor(log2(max(1, coefficient) + 1)) + bonusCount`. |

### Files Modified

**Q10 — Pet range talent**
- `backend/app/domain/talent/definitions.py:61`:
  ```python
  # delete
  _reg(TalentNodeDef("calculus_pet_hp", "calculus", "pet_hp", "Tough Pets",
                     "Increase pet HP", 3, 1, 0.15, ("calculus_pet_speed",)))
  # add
  _reg(TalentNodeDef("calculus_pet_range", "calculus", "pet_range", "Extended Reach",
                     "Increase pet attack range", 3, 1, 0.20, ("calculus_pet_speed",)))
  ```
- `frontend/src/data/talent-defs.ts:48` — mirror the swap.
- `frontend/src/entities/PetFactory.ts:7` — change `ATTACK_RANGE = 1` to read from mods:
  ```ts
  const baseRange = 1
  const modRange  = mods['pet_range'] ?? 0
  const finalRange = baseRange * (1 + modRange)
  // ...
  range: finalRange,
  ```
- `frontend/src/systems/PetCombatSystem.ts` — verify range check reads `pet.range` (not a hardcoded constant). Update if needed.
- `frontend/public/manual/towers-and-enemies.md` — replace the `pet_hp` reference with `pet_range`.
- **Alembic migration** (new revision under `backend/alembic/versions/`) — delete orphaned allocation rows:
  ```python
  def upgrade() -> None:
      op.execute("DELETE FROM talent_allocations WHERE talent_node_id = 'calculus_pet_hp'")

  def downgrade() -> None:
      pass  # no restore — data is gone
  ```
  TP refund is automatic: `achievement_service.py:82` computes spent TP as `sum_achievement_points - sum(allocations)`; removing the rows drops the spent total naturally.

**Q12 — Pet count log compression**
- `frontend/src/entities/PetFactory.ts:31-32`:
  ```ts
  const bonusCount = Math.floor(mods['pet_count'] ?? 0)
  const count = Math.floor(Math.log2(Math.max(1, coefficient) + 1)) + bonusCount
  ```

  Reference table:
  | coefficient | old count | new count |
  |-------------|-----------|-----------|
  | 1 | 1 | 1 |
  | 2 | 2 | 1 |
  | 3 | 3 | 2 |
  | 4 | 4 | 2 |
  | 7 | 7 | 3 |
  | 8 | 8 | 3 |
  | 15 | 15 | 4 |
  | 31 | 31 | 5 |
  | 99 | 99 | 6 |

### Migration

Covered in the Q10 file list above (single Alembic revision deleting `talent_node_id = 'calculus_pet_hp'` rows). The data path is:

```
DELETE FROM talent_allocations WHERE talent_node_id = 'calculus_pet_hp';
```

Run order:
1. Merge frontend/backend definition removal (calculus_pet_hp gone from registry).
2. Deploy backend with new Alembic revision queued.
3. On deploy, Alembic auto-applies the migration, deleting orphaned rows.
4. Spent TP recomputes correctly on next user request via `achievement_service.compute_remaining_talent_points()`.

If staging without Alembic auto-apply, run `alembic upgrade head` manually.

### Tests to Update / Create

- `backend/tests/test_talent.py` — remove `pet_hp` assertions, add `pet_range` validation + prereq enforcement
- **New file**: `frontend/src/entities/__tests__/PetFactory.test.ts` (does not currently exist) — cover the pet count table (Q12) and pet attack-speed scaling (Q11). Can be merged into CalculusTowerSystem.test.ts instead if preferred.
- `frontend/src/systems/__tests__/CalculusTowerSystem.test.ts` — pet spawn count from `C·x^n` inputs uses the new log2 formula.
- **New file**: `frontend/src/systems/__tests__/PetCombatSystem.test.ts` (does not currently exist) — pet targets enemy at `range = 1 × (1 + 0.20·lv)`; also: pet at level 1 has range 1, pet at level 3 has range 1.6.
- **New Alembic migration test** (optional): add an upgrade/downgrade smoke test for the `DELETE FROM talent_allocations WHERE talent_node_id = 'calculus_pet_hp'` revision.

### Acceptance Criteria

- [ ] `pet_hp` no longer appears in any talent registry, UI, or test
- [ ] `pet_range` is purchasable, respects prereq, and visibly extends pet engagement range in-game
- [ ] Calculus tower with `5x^2` spawns 2 pets (was 5)
- [ ] Calculus tower with `99x` spawns 6 pets (was 99) — confirms the exploit is closed
- [ ] Migration runs cleanly on a dev DB with seeded `pet_hp = 3` users

### Risk & Mitigation

- **Q12 is a major nerf** to Calculus tower output. Pair the PR with a manual playtest at 4★/5★ to confirm the tower is still viable. If too weak, raise pet base damage by 20% in the same PR.

---

## Phase 5 — Economy & Monty Hall Gating

**Goal:** Tame the gold-buff compounding and prevent low-star players from getting access to game-trivializing rewards.

### Changes

| ID | Description |
|----|-------------|
| Q15 | Gold multiplier buffs stack **additively**: store a `goldMultiplierBonus` and compute `finalMultiplier = 1 + bonus`. |
| Q18 | 1★ Monty Hall only offers the first 2 rewards in the pool; higher-tier rewards unlock at 2★/3★/etc. |

### Files Modified

**Q15 — Additive gold stacking**

`GameState` is a TypeScript interface (`frontend/src/engine/GameState.ts:14-64`), so a `get goldMultiplier()` computed accessor will not compile. **Chosen pattern: keep `goldMultiplier` as the read-side field (no consumer changes); add `goldMultiplierBonus` as the additive accumulator; each effect handler updates `bonus` and then writes `goldMultiplier = 1 + bonus`.**

Total readers verified: **2** — `EconomySystem.ts:39`, `TowerUpgradeSystem.ts:88`. Both remain unchanged.

- `frontend/src/engine/GameState.ts:14-64` — add field alongside `goldMultiplier`:
  ```ts
  goldMultiplier: number       // derived = 1 + goldMultiplierBonus; consumers read this
  goldMultiplierBonus: number  // additive accumulator owned by BuffSystem
  ```
- `frontend/src/engine/GameState.ts:96` — `createInitialState()` adds `goldMultiplierBonus: 0,` next to `goldMultiplier: 1,`.
- `frontend/src/systems/BuffSystem.ts:98-101` — replace the four handlers:
  ```ts
  // before
  GOLD_MULTIPLIER_DOUBLE:        (g) => { g.state.goldMultiplier *= 2 },
  GOLD_MULTIPLIER_DOUBLE_REVERT: (g) => { g.state.goldMultiplier = Math.max(1, g.state.goldMultiplier / 2) },
  GOLD_MULTIPLIER_TRIPLE:        (g) => { g.state.goldMultiplier *= 3 },
  GOLD_MULTIPLIER_TRIPLE_REVERT: (g) => { g.state.goldMultiplier = Math.max(1, g.state.goldMultiplier / 3) },

  // after (share a recompute helper across both pairs)
  const recomputeGoldMult = (g: Game) => { g.state.goldMultiplier = 1 + g.state.goldMultiplierBonus }
  GOLD_MULTIPLIER_DOUBLE:        (g) => { g.state.goldMultiplierBonus += 1; recomputeGoldMult(g) },
  GOLD_MULTIPLIER_DOUBLE_REVERT: (g) => { g.state.goldMultiplierBonus = Math.max(0, g.state.goldMultiplierBonus - 1); recomputeGoldMult(g) },
  GOLD_MULTIPLIER_TRIPLE:        (g) => { g.state.goldMultiplierBonus += 2; recomputeGoldMult(g) },
  GOLD_MULTIPLIER_TRIPLE_REVERT: (g) => { g.state.goldMultiplierBonus = Math.max(0, g.state.goldMultiplierBonus - 2); recomputeGoldMult(g) },
  ```
- `frontend/src/systems/EconomySystem.ts:39` — **no code change** (still reads `state.goldMultiplier`).
- `frontend/src/systems/TowerUpgradeSystem.ts:88` — **no code change** (refund still reads `state.goldMultiplier`).
- Verified during pre-implementation sweep: no other writers of `goldMultiplier` exist (only the four BuffSystem handlers above). If a future LEVEL_START reset is added, it must write **both** `goldMultiplierBonus = 0` and `goldMultiplier = 1`.

New stacking result: 2× + 3× → `bonus = 1 + 2 = 3` → `goldMultiplier = 4` (was 6).

**Q18 — Per-star MH reward gating**
- `frontend/src/data/monty-hall-defs.ts` — extend the `MontyHallReward` interface (currently lines 35-42, no `minStar` field exists today):
  ```ts
  export interface MontyHallReward {
    id: string
    name: string
    description: string
    effectId: string
    revertId?: string
    duration: number
    minStar?: number  // 1-5; omit/undefined = 1
  }
  ```
  Then tag each reward in `MONTY_HALL_REWARD_POOL`:
  - First 2 rewards: `minStar: 1` (or omit)
  - Mid-tier rewards: `minStar: 2`
  - High-tier rewards (e.g., Gold Rush ×3): `minStar: 3`
  - Highest-tier: `minStar: 4` or `5`
  (Exact tiering — i.e., which `id` gets which `minStar` — is a design call. Land the infrastructure first; tune in a follow-up PR.)
- `frontend/src/systems/MontyHallSystem.ts:101-115` — in `_startEvent(doorCount)`, filter the pool before selecting. The current code is:
  ```ts
  const reward = MONTY_HALL_REWARD_POOL[
    Math.floor(this._rng() * MONTY_HALL_REWARD_POOL.length)
  ]
  ```
  Replace with:
  ```ts
  // _startEvent already runs inside a closure that captured `game.rng()`;
  // pull star from game state via the new signature OR closure-capture star at init.
  const star = game.state.starRating  // requires game to be available — easiest: add `game: Game` param
  const available = MONTY_HALL_REWARD_POOL.filter(r => (r.minStar ?? 1) <= star)
  const reward = available[Math.floor(this._rng() * available.length)]
  ```
  Note: `_startEvent` is currently called without a `game` argument (line 38). Pass `game` through the call site at line 38 to access `game.state.starRating`. Alternatively, cache star in a private field at `init()` (game is available there).

### Tests to Update

- `frontend/src/systems/__tests__/BuffSystem.test.ts` — `gold buff stacks additively, not multiplicatively`. Also add a 3-stack test (2× + 2× + 3× → bonus 4 → mult 5).
- `frontend/src/systems/__tests__/EconomySystem.test.ts` — gold-per-kill with stacked buffs.
- `frontend/src/systems/__tests__/TowerUpgradeSystem.test.ts` — refund math now uses `1 + bonus`; add a test where a stacked gold buff affects the refund value.
- **New file**: `frontend/src/systems/__tests__/MontyHallSystem.test.ts` (does not currently exist) — minimal cases: `1★ does not surface high-tier rewards`; `5★ surfaces all rewards`; verify the filter does not exclude rewards with `minStar` undefined.

### Acceptance Criteria

- [ ] Stacking two gold buffs (×2 then ×3) yields exactly 4× kills (not 6×)
- [ ] Buff expiration correctly removes the bonus (never goes below 0)
- [ ] 1★ MH event never offers Gold Rush ×3 or other high-tier rewards
- [ ] 5★ MH event offers the full reward pool

### Risk & Mitigation

- **Additive math correctness** — write at least one test for *three* stacked gold buffs (e.g., 2× + 2× + 3× → 5×) to catch off-by-one errors.
- **Reward tiering disagreement** — the exact `minStar` assignments are a balance call. Land the infrastructure (field + filter) first; let designers tune the values in a follow-up PR.

---

## Phase 6 — Tower Differentiation (MAGIC + LIMIT)

**Goal:** Save MAGIC and LIMIT from being dominated by Radar towers by giving them genuinely different roles.

This is the **largest design + implementation phase**. Both towers need new mechanics, new state on enemies/towers, and new tests. Recommend splitting into two PRs (one per tower).

### Changes

| ID | Description |
|----|-------------|
| Q7 | MAGIC: zone deals AoE damage AND applies a slow status to enemies in range. |
| Q8 | LIMIT: shots either pierce through multiple enemies in a line OR charge up for a burst hit. |

### Pre-work Required (before coding)

1. **Locate `MagicTowerSystem`** (not in `frontend/src/systems/` — may be embedded in `CombatSystem` or its own file). Document its current behavior.
2. **Locate `LimitTowerSystem`** similarly.
3. **Decide MAGIC details**:
   - AoE radius: fixed game-units (e.g., 4), or scales with `zone_width` talent?
   - Slow factor: `0.6` (40% speed reduction) for `2s`, refresh on re-hit?
   - Does it also still buff allied towers when toggled? (Yes — preserve the toggle.)
4. **Decide LIMIT details** — pick one of two designs (the team should choose):
   - **Pierce design**: shot passes through up to 3 enemies in a line; each takes full damage.
   - **Burst design**: tower charges for 3s after answer; releases an AoE burst at 1.5× damage.
5. Write a short design note (~1 page) at `docs/V2_implementation/tower-redesign-magic-limit.md` capturing the chosen designs. Land this **before** writing code.

### Files Modified (subject to design choices above)

**Q7 — MAGIC AoE + Slow**
- `frontend/src/entities/types.ts` — add `slowFactor: number` and `slowExpiresAt: number` to the `Enemy` interface.
- `frontend/src/systems/MovementSystem.ts` — when computing per-frame movement, multiply speed by `slowFactor` if active and unexpired.
- `frontend/src/systems/MagicTowerSystem.ts` (or wherever MAGIC ticks) — every tick, enumerate enemies in zone, deal `damage` to each, and set/refresh slow status.
- `frontend/src/data/tower-defs.ts:64-67` — update description; consider adding a `radius` or `aoeMultiplier` field.
- `frontend/src/renderers/MagicTowerRenderer.ts` (or equivalent) — visually indicate AoE radius and slow status on affected enemies.

**Q8 — LIMIT burst/pierce**
- `frontend/src/data/tower-defs.ts:151-166` — add either `pierceCount: 3` or `chargeTime: 3.0` + `burstMultiplier: 1.5`.
- `frontend/src/systems/LimitTowerSystem.ts` — implement chosen mechanic.
- `frontend/src/domain/combat/RadarTargeting.ts` — if pierce, reuse line-targeting logic; otherwise scan enemies along the projectile path.

### Tests to Update / Add

**MAGIC**
- **New file** `frontend/src/systems/__tests__/MagicTowerSystem.test.ts` (does not currently exist) — `zone damages all enemies in radius`, `zone applies slow that decays after 2s`
- `frontend/src/systems/__tests__/MovementSystem.test.ts` — add `slowed enemy moves at 60% normal speed`

**LIMIT**
- `frontend/src/systems/__tests__/LimitTowerSystem.test.ts` already exists — add cases for the chosen mechanic: `pierce hits up to 3 enemies in line` OR `burst releases after 3s charge at 1.5× damage`

### Acceptance Criteria

- [ ] Design note merged before implementation begins
- [ ] MAGIC visibly slows enemies and damages all enemies in its zone every tick
- [ ] LIMIT has a distinct visual feel from Radar A/B/C (either visible projectile path or charge-up animation)
- [ ] Manual playtest: a 3★ run can be cleared using mostly MAGIC + LIMIT (proves they're viable, not just niche)

### Risk & Mitigation

- **Scope creep** — both new mechanics are easy to over-design. Time-box each PR at ~2 days. If a mechanic is not done in that window, ship the partial version behind a feature flag.
- **Slow stacking** — keep it simple: re-applying slow just refreshes the timer; do not let multiple sources stack to a stronger slow. Document this in the design note.

---

## Phase 7 — Talent Tree Expansion

**Goal:** Resolve the "fully-mastered tree" problem (achievement TP = 55 ≈ tree cost = 60) by adding new advanced nodes that require existing nodes at max level.

### Changes

| ID | Description |
|----|-------------|
| Q14 | Add 1–2 advanced talent nodes per tower, each requiring an existing node at max level. |

### Pre-work Required

Survey what attributes are already plumbed end-to-end for each tower. The proposed node must affect a real, computed stat — not a placeholder. From the current registries, candidate attributes:

| Tower | Existing nodes | Proposed advanced node(s) |
|-------|----------------|---------------------------|
| MAGIC | zone_strength, zone_width, duration | `magic_slow_strength` (deeper slow %) — depends on Phase 6 landing |
| RADAR_A | range, sweep_speed | `radar_a_aoe_width` (wider sweep arc) |
| RADAR_B | speed, damage, target_count | `radar_b_crit_chance` (% chance to crit for 2×) |
| RADAR_C | damage, range, target_count | `radar_c_crit_damage` (crit multiplier 2× → 3×) |
| MATRIX | range, target_count, ramp | `matrix_resonance` (paired bonus damage) — wires into Phase 1 Q9 |
| LIMIT | damage, range | `limit_pierce_bonus` (+1 pierce) — depends on Phase 6 Q8 design |
| CALCULUS | pet_speed, pet_damage, pet_range | `calculus_pet_crit` (pet crit %) |

Each advanced node:
- `maxLevel: 2`
- `costPerLevel: 3` (qualitative tier per the Q13 rule)
- Prereq: the parent node at max level

This adds **7 nodes × 2 levels × 3 TP = 42 TP** of new content, comfortably exceeding the 55 TP achievement pool.

### Files Modified

- `backend/app/domain/talent/definitions.py:62+` — add the 7 new `_reg(...)` calls
- `frontend/src/data/talent-defs.ts:49+` — mirror the 7 nodes
- For each new attribute, add the corresponding mod application in the relevant tower system (e.g., crit chance in `RadarBTowerSystem`)

### Tests to Update / Add

- `backend/tests/test_talent.py` — validate new prereq enforcement; verify total tree cost
- Per-tower system tests — crit/resonance/pierce behavior

### Acceptance Criteria

- [ ] All 7 advanced nodes registered on backend and frontend
- [ ] Prerequisites correctly block purchase until parent is maxed
- [ ] Each new attribute affects gameplay (verified via test or playtest)
- [ ] A new player with all 55 achievement TP cannot fully complete the tree

### Risk & Mitigation

- **Dependency on Phase 6 design** — `magic_slow_strength` and `limit_pierce_bonus` only make sense if Q7/Q8 land first. Sequence the work so Phase 7 begins after Phase 6 PRs are merged.
- **UI rendering** — talent tree UI must visually distinguish "advanced" nodes from base nodes (icon, color, "Tier 2" badge). Coordinate with whoever owns the talent tree component.

---

## Phase 8 — Post-Deployment Validation

**Goal:** Confirm the overhaul achieves its design goals and didn't regress anything.

### Tasks

1. **Re-run baseline metrics** (from Phase 0) and diff against the new system:
   - Final scores per star — should be slightly higher at 5★ (gentler exponent), comparable at 1★
   - Gold totals per run — 5★ should be ~20% higher (wave bonus boost) but 1.5× reward ratio prevents runaway
   - Calculus pet count per run — should be dramatically lower at high-coefficient builds
   - Talent points spent on `pet_hp` — should be zero (talent removed)
2. **Playtest checklist** (manual, 30 min per star):
   - [ ] 1★ run feels easier than before (more accessible)
   - [ ] 3★ run feels balanced (no single dominant tower)
   - [ ] 5★ run is genuinely hard (Boss still scary even with shield)
   - [ ] MAGIC tower is built at least once in a 3★ run
   - [ ] LIMIT tower is built at least once in a 4★+ run
3. **Leaderboard sanity check** — top 10 scores should not all be identical (formula smoothing should produce some variance).
4. **Anti-cheat false-positive sweep** — review the past week of rejected score submissions; if rejection rate spikes >5×, suspect a constraint cap is too tight.
5. **Player feedback gathering** — if applicable, monitor in-game feedback channel or class teacher reports for 1 week.

### Rollback Plan

If a critical balance issue surfaces:
- Phase 1, 4, 5, 7 changes are pure data — revert the affected PR, no migration needed.
- Phase 2 changes require coordinated revert (C, Python, TS, fixtures). Keep the old fixtures file in git history.
- Phase 3, 6 changes touch live game state — if reverted post-deployment, currently-active sessions should be unaffected since they don't persist new fields server-side.

### Acceptance Criteria

- [ ] Baseline metrics rerun and committed alongside Phase 0 file as `balance-after-2026-05.md`
- [ ] Playtest checklist signed off
- [ ] No regression issues filed within 1 week of deployment
- [ ] If issues are found, a follow-up "balance hotfix" PR is opened within 48 hours

---

## Cross-Cutting Concerns

### Documentation Updates

- `docs/V2_implementation/phase-4-economy-scoring-events.md` — update scoring formula section to match new sqrt/blend math
- `docs/V2_implementation/phase-3-enemy-combat.md` — update BULWARK description (mult, not cap)
- `README.md` or `docs/balance.md` — short changelog of player-visible changes

### Backwards Compatibility

- **Scoring**: Phase 2 changes break leaderboard comparability. **Decision required**: operator (a) clears leaderboard, (b) adds `formula_version` column, or (c) accepts mixed scores.
- **Talent**: Phase 4 removes `pet_hp` — migration script required (Phase 4 section).
- **Replays**: any persisted replay scored under the old formula will not match the new formula on replay. If replays are user-visible, gate the re-scoring behind the same `formula_version`.

### Feature Flags

Not strictly needed for any single phase, but if the team prefers staged rollout:
- Phase 6 (tower redesign) is the strongest candidate for a flag — wrap new MAGIC/LIMIT behavior in `if (FF.newTowerMechanics) { ... } else { ... }`.
- Phase 2 (scoring) cannot easily be flagged because WASM is loaded once at startup; a flag would require two compiled WASM modules.

### PR Sequencing (recommended)

1. Phase 0 (tooling) — small PR, fast review
2. Phase 1 (numerical) — single PR, low review burden
3. Phase 4 (pets) — single PR including migration
4. Phase 5 (economy + MH gating) — single PR
5. Phase 3 (combat mechanics) — single PR
6. Phase 2 (scoring) — single PR, coordinated review with @backend + @gameplay
7. Phase 6 MAGIC — separate PR
8. Phase 6 LIMIT — separate PR
9. Phase 7 (talent expansion) — single PR after Phase 6 merges
10. Phase 8 — validation, no code merge

Phases 1, 3, 4, 5 can run in parallel; phases 2, 6, 7 should be sequential.

---

## Open Questions Requiring Decisions Before Start

1. **Leaderboard treatment for Phase 2** (clear, version-tag, or accept mixed) — **owner: product/ops**
2. **MAGIC slow stacking semantics** (refresh vs stack) — **owner: gameplay design**
3. **LIMIT mechanic choice** (pierce vs burst) — **owner: gameplay design**
4. **MH reward tier assignments** (which reward at which `minStar`) — **owner: gameplay design**
5. **Calculus base damage** (whether to compensate for Q12 nerf with pet-damage buff) — **owner: gameplay design**

Resolve these before kickoff or each phase will stall on the open question.

---

*End of plan.*
