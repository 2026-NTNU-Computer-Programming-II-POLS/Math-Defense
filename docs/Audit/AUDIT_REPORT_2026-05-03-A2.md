# Score Calculation — Systemic Bug Audit

**Date:** 2026-05-03
**Scope:** End-to-end review of the Math Defense score pipeline for systemic bugs.
**Method:** Four parallel investigation agents covered (1) the core formula, (2) input tracking, (3) submission/leaderboard, (4) score-adjacent calculations. Each agent's high-severity claims were then spot-verified by reading the cited code directly. Items marked **VERIFIED** were re-read; items marked **REPORTED** are agent findings that look plausible but were not re-read line-by-line.

---

## TL;DR

The formula itself (frontend `score-calculator.ts` ↔ backend `score_calculator.py`) is largely consistent. The systemic problems live around it:

1. **Anti-cheat is opt-out by client.** A client that omits any V2 scoring field bypasses server recompute entirely and the unverified `total_score` is persisted.
2. **`costTotal` is silently leaky.** Tower upgrades and tower refunds (and the `REFUND_LAST_TOWER` buff) move gold but never call `addCost`, so the score formula's cost denominator drifts away from actual spend.
3. **Deleted users disappear from the leaderboard,** even though the migration was deliberately written with `ON DELETE SET NULL` to preserve their entries.
4. **Talent multipliers break frontend/backend parity** for the recompute, because the backend has no knowledge of the talent stack that produced a given `kill_value`.

Severity legend: **High** = corrupts stored score or enables cheating · **Medium** = distorts displayed/derived values under realistic conditions · **Low** = edge-case or defense-in-depth.

---

## High severity

### H1. Optional V2 scoring fields let clients bypass anti-cheat — VERIFIED
- **Where:** `backend/app/schemas/game_session.py:69-77`, `backend/app/application/session_service.py:318-343`, `backend/app/domain/scoring/score_calculator.py:18-27`
- **What:** `SessionEnd` declares `kill_value`, `cost_total`, `time_total`, `time_exclude_prepare`, `health_origin`, `health_final`, and `total_score` as `Optional[…] = None` "for backward compat". `_verify_score` calls `recompute_total_score(...)`, which returns `None` if any field is `None`, and on `None` `_verify_score` returns early **without overwriting** `session.total_score`.
- **Impact:** A client can submit `total_score=999_999` and omit any of the input fields. `_verify_score` short-circuits, the client value passes through to the DB and the leaderboard. There is no warning log on the bypass path (the warning at `session_service.py:339` only fires on the *successful* recompute path).
- **Fix sketch:** Either (a) make all V2 fields required on `SessionEnd` and remove the `None`-short-circuit in `recompute_total_score`, or (b) treat "any field missing" as a hard reject (HTTP 400) instead of a silent skip, and log it.

### H2. Tower refund returns gold but never reduces `costTotal` — VERIFIED
- **Where:** `frontend/src/systems/TowerUpgradeSystem.ts:76-90`
- **What:** `_refund` calls `game.changeGold(refund)` (line 87) but never calls `game.addCost(-refund)` (or `-cost`). For comparison, `SpellSystem.ts:77` *does* call `game.addCost(-def.cost)` on the no-target refund path, so the inconsistency is established within the codebase.
- **Impact:** `costTotal` permanently retains the original tower cost, shrinking `s2 = killValue / costTotal` and depressing the final score for any player who refunds. The backend recompute uses the same inflated `cost_total`, so the corruption is server-confirmed.

### H3. Tower upgrades deduct gold but never add to `costTotal` — VERIFIED
- **Where:** `frontend/src/systems/TowerUpgradeSystem.ts:38-74` (specifically line 48: `game.changeGold(-cost)` with no companion `game.addCost(cost)`)
- **What:** `_upgrade` spends gold for the upgrade tier but does not record that spend in `costTotal`. Compare with `TowerPlacementSystem.ts:116` and `BuffSystem.ts:199`, which do call `addCost` after a `changeGold(-cost)`.
- **Impact:** The more a player upgrades, the more `costTotal` *understates* real spend, **inflating** `s2 = killValue / costTotal`. So upgrade-heavy play is rewarded with an artificially better score; refund-heavy play is punished (H2). The two together make the cost-efficiency term essentially noise relative to the player's actual economic decisions.

### H4. `REFUND_LAST_TOWER` buff returns gold but tower stays and `costTotal` is untouched — VERIFIED
- **Where:** `frontend/src/systems/BuffSystem.ts:112-117`
- **What:** The effect calls `g.changeGold(last.cost)` only — the tower object is not removed from `g.towers`, and there is no `addCost(-last.cost)`. Player keeps the tower, gets full cost back as gold, and `costTotal` is unchanged.
- **Impact:** Same direction as H3 — `s2` inflates relative to actual net spend. Plus the player retains the tower's combat value, which compounds the issue.

### H5. Deleted users vanish from leaderboard despite `ON DELETE SET NULL` — VERIFIED
- **Where:** `backend/app/infrastructure/persistence/leaderboard_repository.py:71-97` (global) and `:128-167` (by-class); migration `backend/alembic/versions/e5b2c9d4a1f7_indexes_and_leaderboard_fk_set_null.py`
- **What:** The migration was added specifically so that deleting a user does *not* cascade-delete their leaderboard rows; the FK is set to `SET NULL`. But the leaderboard repo (a) filters `LeaderboardEntryModel.user_id.isnot(None)` in the count (line 72) and (b) does an INNER `JOIN User` for the row fetch (line 97). Result: rows whose `user_id` was nulled by user deletion are excluded from both count and rows.
- **Impact:** Two reads of the migration intent diverge from the query intent. If the goal of `SET NULL` was to preserve historical scores, the leaderboard never shows them. If the goal was actually to drop them quietly, the migration could simply have used `ON DELETE CASCADE` — so the discrepancy is at minimum a documentation/intent bug, and likely a feature bug.
- **Secondary:** The dense-rank correlated subquery (`leaderboard_repository.py:81-86`) also does **not** filter `L2.user_id.isnot(None)`, so deleted-user scores still inflate ranks of surviving entries. So a tied-for-first survivor could be displayed as rank 3 because two now-invisible deleted users had a higher score.

### H6. Talent damage/range/speed multipliers break recompute parity — REPORTED
- **Where:** `frontend/src/systems/TowerUpgradeSystem.ts:53-69`, `frontend/src/systems/TowerPlacementSystem.ts` (talent application), backend has no equivalent
- **What:** Frontend applies talent multipliers to `effectiveDamage`, `effectiveRange`, `cooldown`. The resulting `kill_value` reflects the talent stack. The backend recompute consumes `kill_value` as a black-box scalar — it has no way to know whether a high `kill_value` is "earned via talents" or "fabricated by a tampered client".
- **Impact:** The recompute can only catch tampering of `total_score` *given the inputs the client reported*. A client that fakes high `kill_value` claiming "I have damage talents" is indistinguishable from a legitimate run. Anti-cheat is therefore weaker than the presence of `recompute_total_score` suggests.
- **Note:** This is a structural limitation, not a coding bug. The fix is either to feed the active talent set into recompute and re-derive plausibility bounds, or to declare server-side that `kill_value` is trusted and rely on talent-acquisition tracking elsewhere for cheat detection.

---

## Medium severity

### M1. `health_origin` capture point depends on event ordering — REPORTED
- **Where:** `frontend/src/systems/EconomySystem.ts:56` (sets `healthOrigin = game.state.hp` on `LEVEL_START`)
- **What:** If anything mutates HP between game-state init and the `LEVEL_START` handler firing (e.g. a buff that survives across levels and re-applies on `LEVEL_START`), `healthOrigin` captures the *post-mutation* value. The score formula then sees `healthOrigin - healthFinal` ≈ 0 even when the player did take damage.
- **Impact:** If `healthOrigin == healthFinal`, `exponent_denom = 1 + (2 + 0 - ia) = 3 - ia`, so `exponent` is `1/3` or `1/2`. With a normal-damage run, `exponent_denom` would have been smaller (= bigger exponent = bigger score) — so a corrupted capture *underweights* a clean-run bonus the player actually earned. Direction of the bug depends on which pre-LEVEL_START effects fire.
- **Verify by reading:** check `BuffSystem.ts` `LEVEL_START` handler vs. `EconomySystem.ts` `LEVEL_START` handler ordering.

### M2. `prep_time_sum > time_total` is clamped, not rejected — VERIFIED
- **Where:** `frontend/src/domain/scoring/score-calculator.ts:23`, `backend/app/domain/scoring/score_calculator.py:31`
- **What:** Both implementations clamp `activeTime = max(0.001, time_total - prep_sum)`. If a client reports `time_total=10, time_exclude_prepare=[8,5]` (sum 13), `activeTime` becomes `0.001` and `s1 = kill_value / 0.001 = 1000 * kill_value`. There is no upstream validation that `sum(time_exclude_prepare) ≤ time_total`.
- **Impact:** A trivially-malformed payload yields a 1000× `s1` boost. The schema only validates each prep entry's individual range (`Field(ge=0, le=7200.0)`, `max_length=50`) and `time_total`'s range, never the cross-field invariant.
- **Fix sketch:** Add a `model_validator` to `SessionEnd` rejecting `sum(time_exclude_prepare) > time_total + epsilon`, and have `recompute_total_score` raise instead of producing a giant `s1` if it ever sees that state.

### M3. Frontend rounds outputs, backend doesn't — tolerance hides it — VERIFIED
- **Where:** `frontend/src/domain/scoring/score-calculator.ts:53-55` rounds `totalScore` to 4 decimals; `backend/app/domain/scoring/score_calculator.py` returns full precision; `session_service.py:337` uses `tolerance = max(0.01, 0.05 * recomputed)`.
- **What:** For "normal" scores the 5% tolerance absorbs the rounding gap. But for very small scores (< 0.2) the tolerance floor of `0.01` is wider than rounding error and the assertion is effectively vacuous; for very large scores the 5% tolerance accepts a 50k delta on a 1M score.
- **Impact:** Anti-cheat resolution is weak at both extremes. Combined with H1 (bypass path) the practical strength is "good faith only".

### M4. `total_score` upper bound is enforced at the schema, not at the aggregate — REPORTED
- **Where:** `backend/app/schemas/game_session.py:77` enforces `le=1_000_000`; `backend/app/domain/session/aggregate.py:246-247` only clamps the lower bound.
- **What:** Defense-in-depth gap. Any non-HTTP caller (background job, fixture loader, future internal API) that constructs a `GameSession` directly can persist scores well beyond the schema cap. Today nobody does, but the invariant should live on the aggregate.

### M5. Idempotent `end_session` retry uses legacy `session.score`, not `total_score` — REPORTED
- **Where:** `backend/app/application/session_service.py` around the catch-up branch (~line 134-149 per agent report)
- **What:** When `end_session` is called on an already-COMPLETED session, the catch-up path that re-emits the leaderboard event uses the legacy integer `session.score`, not the V2 `session.total_score`. The leaderboard insert is protected by a unique constraint so duplicates won't appear, but logs and any downstream consumers of that re-emit would see the wrong score.
- **Verify by reading** the actual catch-up code path and what value it forwards.

### M6. Achievement thresholds say "over X" but use `>=` — REPORTED
- **Where:** `backend/app/application/achievement_service.py:102-126`, descriptions in `backend/app/domain/achievement/definitions.py` / `frontend/src/data/achievement-defs.ts`
- **What:** Description text reads "achieve total score over 1,000" but the comparison is `score >= 1000`. Off-by-one in user-visible semantics.
- **Impact:** Cosmetic / spec-vs-impl drift. Pick one and align.

### M7. Star-rating-driven starting gold biases score across difficulties — design observation
- **Where:** `shared/game-constants.json:36` (`startingGoldByStar`)
- **What:** Higher star rating = more starting gold = more `costTotal` available to spend = lower `s2`. The score formula does not normalise by star.
- **Impact:** Cross-difficulty leaderboards are not commensurable. If the leaderboard is supposed to be globally rank-comparable, this is a real bug; if it's level-scoped, it's intentional. The frontend `Leaderboard` view should be checked for the assumption it makes.

---

## Low severity / notes

### L1. `kill_value = 0` ⇒ score = 0 regardless — by design
- `0^anything = 0`. A run with no kills has no score. Documented here only because the code does not say so.

### L2. `cost_total = 0` collapses `s2` to 0 and `k` to `0.7 * s1` — by design
- Both implementations explicitly branch on `cost_total > 0`. A no-tower strategy is penalised by 30% of `s1`. Acceptable, but undocumented.

### L3. `health_final > health_origin` triggers `max(1, ...)` clamp silently
- `score_calculator.py:43`, `score-calculator.ts:38`. Defensive but silent — no log if the formula sees an impossible HP delta.

### L4. `mUsed` reported by frontend but not backend
- Only a debugging asymmetry. The `s1 >= s2` branch decision is identical; floating-point ties on the boundary could in principle make the two pick different branches but give the same `k`. Worth knowing if you ever debug a parity discrepancy.

### L5. Tab-hidden frame clamp keeps timer in sync with sim — verified intentional
- `Game._loop()` clamps `frameTime` to 0.1s. `timeTotal` accumulates simulated time, not wall clock. Correct.

---

## Claims I downgraded or rejected after re-reading the code

- **"Territory score is cheatable because the score is taken from the request"** — *rejected.* `territory_service.py:199-214` (`_validate_session`) loads the session by id from the DB and reads `session.total_score`, which was already finalised by `_verify_score` at session-end time. The vulnerability is upstream (H1), not in territory.
- **"First prep phase after wave 1 is never recorded in `time_exclude_prepare`"** — *uncertain, downgraded.* The handler at `frontend/src/composables/useGameLoop.ts:193-202` gates on `g.state.wave > 0` to skip the very first BUILD entry (game start). Whether wave is incremented on COMBAT-end or BUILD-enter determines if the second BUILD entry passes the gate. Worth a focused trace, but the bug as stated does not hold without verifying wave-counter timing.
- **"Wave/boss bonuses leak into `costTotal`"** — *not found.* `EconomySystem.ts:42-49` adds bonuses via `game.changeGold(...)` only; no `addCost` call. They correctly do **not** decrement cost — they are income, not negative spend.

---

## Recommended remediation order

1. **H1** — make V2 scoring fields required on `SessionEnd` and remove the `None` short-circuit (or hard-reject). This is a single-file change that closes the easiest cheat path.
2. **H2 + H3 + H4** — add `game.addCost(±x)` to the three sites that move gold without it. Three small edits in two files.
3. **H5** — decide intent. Either flip both queries to `LEFT JOIN User` and render NULL `player_name` as "Deleted User", or change the migration to `CASCADE`. Update the rank subquery to match.
4. **M2** — add a `SessionEnd.model_validator` rejecting `sum(time_exclude_prepare) > time_total`.
5. **M1** — write a focused test that buffs HP before `LEVEL_START` and asserts `healthOrigin` matches the pre-buff value.
6. **H6** — out of scope for a quick patch; needs a design decision about what the recompute should validate.

Per the project's standing rule, none of the "verified" items above were trusted to passing tests — they were re-read in the cited files. The "reported" items are still worth a second look before patching.
