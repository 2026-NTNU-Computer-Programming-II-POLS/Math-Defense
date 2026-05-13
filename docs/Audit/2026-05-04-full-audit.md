# Math Defense — Full Codebase Audit

**Date:** 2026-05-04  
**Auditors:** Four parallel specialized agents (Security, Backend Architecture, Frontend Architecture, Anti-Cheat/Scoring)  
**Branch:** `main` — commit `ef681a7`

---

## Table of Contents

1. [Critical / High Priority Summary](#1-critical--high-priority-summary)
2. [Security Vulnerabilities](#2-security-vulnerabilities)
3. [Anti-Cheat & Scoring Pipeline](#3-anti-cheat--scoring-pipeline)
4. [Backend DDD / Architecture](#4-backend-ddd--architecture)
5. [Frontend Architecture & Bugs](#5-frontend-architecture--bugs)
6. [What Was Confirmed Clean](#6-what-was-confirmed-clean)
7. [Full Findings Index](#7-full-findings-index)

---

## 1. Critical / High Priority Summary

These are the findings that should be fixed before any public release.

| ID | Area | Severity | One-line description |
|----|------|----------|----------------------|
| SEC-01 | Security | **High** | Real credentials in `.env` file (JWT secret + DB password) |
| AC-03 | Anti-cheat | **High** | Integer `score` field is never server-recomputed — leaderboard inflatable |
| AC-04 | Anti-cheat | **High** | No minimum gameplay enforcement — create session → immediately end with max values |
| AC-06 | Anti-cheat | **High** | `health_origin` is client-supplied and fed into server score recomputation |
| FE-16 | Frontend | **High** | `MatrixTowerSystem` damage = dot product of positions — silently deactivates for some tower arrangements |
| FE-17 | Frontend | **High** | `LimitTowerSystem` `-inf` outcome heals enemies to full HP every cooldown tick |
| FE-18 | Frontend | **High** | Boss split-on-death ordering assumption undocumented — one reorder breaks it |
| BE-01 | Backend DDD | **High** | All application services import `sqlalchemy.exc.IntegrityError` (infra leak) |
| BE-03 | Backend DDD | **High** | `routers/class_.py` instantiates `SqlAlchemyUserRepository` directly |
| BE-04 | Backend DDD | **High** | Auth router calls `db.commit()` directly, bypassing UoW |

---

## 2. Security Vulnerabilities

### SEC-01 · High · Real credentials on disk in `.env`

**File:** `.env` (project root)

The live `.env` contains a real `SECRET_KEY`, `DATABASE_URL` (including PostgreSQL password), and `POSTGRES_PASSWORD`. Although `.gitignore` excludes `.env` from commits, the file exists on the developer machine. Anyone with local read access (or a CI artifact leak) obtains the JWT signing key and database credentials.

**Impact:** Forged JWT tokens for any user; direct DB read/write access to all game data and PII.

**Fix:** Rotate `SECRET_KEY` and DB password immediately. Verify via `git log --all --full-history -- .env` that it was never committed. Use a secrets manager in production (Vault, AWS SSM, GitHub Actions secrets).

---

### SEC-02 · Medium · Algorithm is HS256 (symmetric HMAC), no RS256 option

**File:** `backend/app/config.py:39`, `backend/app/utils/security.py:46,61`

`ALGORITHM` is whitelisted to `{"HS256", "HS512"}` only. Any service that needs to verify tokens must share the same secret key. A compromised co-tenant leaks the signing key across the whole system.

**Fix:** Add `"RS256"` to the allowlist, generate an RSA key pair, configure `ALGORITHM=RS256` in production.

---

### SEC-03 · Medium · `SetUserActiveRequest` missing `extra="forbid"`

**File:** `backend/app/schemas/admin.py:17`

Every other request schema uses `model_config = ConfigDict(extra="forbid")`. `SetUserActiveRequest` has no `model_config`, so Pydantic silently drops unknown fields (its default `"ignore"`). Not directly exploitable today, but inconsistent and a future mass-assignment risk.

**Fix:** Add `model_config = ConfigDict(extra="forbid")`.

---

### SEC-04 · Medium · `/api/auth/logout` is CSRF-exempt despite being a state-changing POST

**File:** `backend/app/middleware/csrf.py:29-30`

`_EXEMPT_PATHS` includes `/api/auth/logout`. A malicious third-party page can silently log out a victim via a cross-site POST, causing session disruption or as a stepping stone for session fixation.

**Fix:** Remove `/api/auth/logout` from `_EXEMPT_PATHS`; ensure the frontend sends the CSRF token header on logout.

---

### SEC-05 · Medium · TOTP `valid_window=1` with no used-code record — replay attack possible

**File:** `backend/app/utils/totp.py:14`

```python
pyotp.TOTP(secret).verify(code, valid_window=1)
```

A code is accepted for ~90 seconds and there is no server-side record of which codes have already been consumed. An intercepted TOTP code can be replayed within its validity window.

**Fix:** Store the last-used TOTP timestamp per user and reject any code already accepted in the current window.

---

### SEC-06 · Medium · Rate limiting bypass: IP-based + per-account lockout are independently circumventable

**File:** `backend/app/limiter.py`, `backend/app/infrastructure/login_guard.py`

An attacker with 10 rotating IPs can attempt 10 passwords/minute without triggering the IP limit, and 5 attempts per 5 minutes before account lockout — combining to a meaningful offline attack rate.

**Fix:** Implement exponential back-off on lockout (e.g., 15 min after 3rd lockout). Add `Retry-After` headers. Consider CAPTCHA after repeated lockouts.

---

### SEC-07 · Low · `PathConfig` uses `extra="allow"` — unbounded JSON stored to DB

**File:** `backend/app/schemas/territory.py:13-18`

Teacher-role users can embed arbitrary extra fields in `path_config`. The 10 KiB size cap limits storage impact, but semantic content is unconstrained.

**Fix:** Declare known fields explicitly and switch to `extra="ignore"`, or add a nesting-depth check.

---

### SEC-08 · Low · `UserNotFoundError` returns HTTP 401 (should be 403)

**File:** `backend/app/domain/errors.py:54-55`

A structurally valid JWT for a deleted user returns 401, conflating "unauthenticated" with "account gone." Aids token/user enumeration through error message inspection.

**Fix:** Change `status_code` to `403`.

---

### SEC-09 · Low · `FRONTEND_URL` absent from `.env` — backend crashes at startup; HTML email injection risk

**File:** `backend/app/config.py:76-120`, `backend/app/utils/email_service.py:48`

`frontend_url` is interpolated directly into email HTML without sanitization. A misconfigured URL containing `<` or `"` produces malformed HTML.

**Fix:** Add `FRONTEND_URL` to the `.env` template; wrap the URL in `html.escape()` before HTML interpolation.

---

### SEC-10 · Low · Audit log stores plaintext email PII (including failed-login guesses)

**File:** `backend/app/routers/auth.py:101,132,145`

`LOGIN_FAILURE` events log the submitted email verbatim. An attacker with DB access harvests all email addresses ever attempted, including non-registered guesses.

**Fix:** Replace `"email": req.email` with `"email_anon": _anon(req.email)` using the existing `_anon()` helper already in the file.

---

## 3. Anti-Cheat & Scoring Pipeline

### AC-01 · Medium · `end_session` uses non-locking read — concurrent double-submit race

**File:** `backend/app/application/session_service.py:128`

`find_by_id` loads the session without a `FOR UPDATE` row lock. Two simultaneous POST requests to `/{id}/end` both see `status == ACTIVE` and both proceed. The unique index on `leaderboard.session_id` is the only backstop; the domain layer should not rely on a DB constraint for this invariant.

**Fix:** Change line 128 to `find_by_id_for_update`.

---

### AC-02 · None (good) · `_verify_score` always overwrites with server-recomputed value

**File:** `backend/app/application/session_service.py:322-356`

The server recomputes `total_score` from first principles and unconditionally overwrites the client-submitted value. A cheating client cannot inflate `total_score` directly. **Correctly implemented.**

---

### AC-03 · High · Integer `score` field is client-trusted — leaderboard and achievement inflation

**File:** `backend/app/domain/session/aggregate.py:182-216`, `backend/app/application/session_service.py:153-158`

The integer `score` field (kill bounties) is validated only by range caps (`LEVEL_MAX_SCORES`) and a delta cap (`MAX_SCORE_DELTA` = 50,000 per update). It is **never server-recomputed**. A cheater who submits incremental WAVE_END updates (each ≤ 50,000) then a capped final value achieves maximum leaderboard score in two requests. This score also feeds achievement evaluation (`single_session_score`, `total_score` achievements).

**Fix:** Either (a) derive `score` from a server-managed kill-event log, or (b) use only `total_score` (server-recomputed) for leaderboard ranking and mark sessions missing V2 fields as unranked.

---

### AC-04 · High · No minimum gameplay enforcement — create → immediately end with max values

**File:** `backend/app/routers/game_session.py:81-104`, `backend/app/domain/session/aggregate.py:182`

There is no "minimum wave count before end" check and no minimum elapsed time enforcement. A cheater creates a session and immediately calls `end_session` with `waves_survived = 20`, `kills = 500`, `score = LEVEL_MAX_SCORES[star]`. All aggregate invariants pass because `last_reported_score` starts at 0.

**Fix:** Require at least one WAVE_END update before `end_session`, or enforce `min elapsed = minimum_wave_time × waves_survived` server-side.

---

### AC-05 · Medium · WAVE_END replay at the same wave number is accepted — delta cap circumventable

**File:** `backend/app/domain/session/aggregate.py:159-161`

The server rejects `current_wave < self.current_wave` but accepts `current_wave == self.current_wave`. Multiple PATCH calls with the same wave number but increasing `score` each consume the delta allowance independently, allowing the cap to be reached incrementally.

**Fix:** Reject or no-op PATCH requests where `current_wave == self.current_wave`.

---

### AC-06 · High · `health_origin` is client-supplied and fed into server score formula

**File:** `backend/app/domain/scoring/score_calculator.py:53`, `backend/app/application/session_service.py:164`

`health_origin` appears in the exponent denominator: `exponent_denom = 1 + (2 + health_origin - health_final - int(initial_answer))`. Submitting `health_origin = 1` dramatically reduces the exponent (e.g., from `0.04` to `0.33`), boosting `total_score` significantly since it is raised to the power `1/exponent_denom`. The server blindly uses the client value in its own recomputation.

**Fix:** Remove `health_origin` from `SessionEnd`. In `_verify_score`, substitute the known constant `INITIAL_HP` (imported from shared constants) instead of reading the client-supplied field.

---

### AC-07 · None (good) · Score formula parity: frontend and backend are identical

Both `score-calculator.ts` and `score_calculator.py` implement the same formula (`S1`, `S2`, `K`, `TotalScore`) with matching logic. The tolerance for discrepancy logging is `0.0005`, well above the maximum rounding error from the frontend's 4-decimal rounding. **No exploitable gap.**

---

### AC-08 · Medium · Monty Hall rewards are entirely client-side — no server validation

**File:** `frontend/src/data/monty-hall-defs.ts`, `frontend/src/systems/MontyHallSystem.ts` (no backend counterpart)

Monty Hall events (which can award full heals, free tower charges, triple gold) are triggered, resolved, and rewarded entirely on the client. The server never validates whether the thresholds were legitimately met. A cheating client can apply Monty Hall rewards at will, reducing `cost_total` and suppressing HP loss — both of which feed the server-side recomputation.

**Fix:** Record Monty Hall rewards claimed per session, enforce a cap equal to `MONTY_HALL_THRESHOLDS_BY_STAR[star].length`, and validate plausibility of `kill_value` against reward count.

---

### AC-09 · Medium · Achievement unlock indirect bypass through Findings AC-03 and AC-04

**File:** `backend/app/application/achievement_service.py:56`

There is no direct API to unlock achievements. However, achievement evaluation uses the client-supplied integer `score`, `kills`, and `waves_survived` from `SessionCompleted` (see AC-03). Achievements like `score_single_5000`, `kills_100`, etc., can be unlocked without legitimate gameplay through the padded score or the immediate-end bypass.

**Fix:** Inherits from AC-03 and AC-04 fixes.


2026-05-04 DONE (above)


---

### AC-10 · Low · Talent points sourced from DB — no direct injection

**File:** `backend/app/application/talent_service.py:94`

`allocate_point` computes available points from `achievement_repo.sum_talent_points(user_id)` (DB read), not from client input. There is no endpoint to directly add talent points. **No vulnerability here.** Risk is inherited from AC-09.

---

### AC-11 · None (good) · Session binding via `user_id` filter — no cross-user manipulation

Every mutating endpoint passes `current_user.id` (from JWT) alongside `session_id` into repository queries filtering on both columns. User A cannot read or modify User B's session. **Correctly implemented.**

---

### AC-12 · Medium · Concurrent `end_session` race: both requests load independent ACTIVE objects (overlaps AC-01)

**File:** `backend/app/application/session_service.py:128`

Both concurrent end requests load separate `GameSession` Python objects showing `status == ACTIVE`. Both call `complete()` without raising. The last DB write wins. The unique index on `leaderboard.session_id` prevents duplicate leaderboard entries but does not prevent the aggregate from being completed twice in memory.

**Fix:** Same as AC-01 — use `find_by_id_for_update`.

---

### AC-13 · Low · `n_prep_phases` field accepted but ignored

**File:** `backend/app/schemas/game_session.py:76`

`n_prep_phases` is validated and accepted but never stored or used; the server derives prep phase count from `len(time_exclude_prepare)`. Dead input surface.

**Fix:** Remove from `SessionEnd` schema, or assert `n_prep_phases == len(time_exclude_prepare)`.

---

## 4. Backend DDD / Architecture

### BE-01 · High · All five application services import `sqlalchemy.exc`

**Files + approximate lines:**

| File | Import |
|------|--------|
| `application/session_service.py:8` | `from sqlalchemy.exc import IntegrityError, SQLAlchemyError` |
| `application/territory_service.py:9` | `from sqlalchemy.exc import IntegrityError` |
| `application/class_service.py:7` | `from sqlalchemy.exc import IntegrityError` |
| `application/auth_service.py:10` | `from sqlalchemy.exc import IntegrityError` |
| `application/leaderboard_service.py:8` | `from sqlalchemy.exc import IntegrityError` |

**Rule violated:** Application layer must not know about the ORM/persistence technology. `sqlalchemy.exc.IntegrityError` is an infrastructure concern.

**Impact:** Switching the persistence backend requires rewriting all five services. Unit-testing with in-memory fakes requires either importing SQLAlchemy or monkey-patching the exception hierarchy.

**Fix:** Define `ConstraintViolationError` / `DuplicateKeyError` in `domain/errors.py`. Have repositories catch `IntegrityError` and re-raise the domain error. Application services catch only domain errors.

---

### BE-02 · Medium · Application services typed against concrete `SqlAlchemyUnitOfWork`

**Files:** All eight application service `__init__` signatures, e.g. `session_service.py:42`

```python
uow: SqlAlchemyUnitOfWork,
```

The concrete class is used even via `TYPE_CHECKING`, coupling the application layer to the SQLAlchemy implementation by name.

**Fix:** Define a `UnitOfWork` Protocol in `app/application/ports.py` with `__enter__`, `__exit__`, `commit`, `rollback`. Change all service constructors to `uow: UnitOfWork`.

---

### BE-03 · High · Router instantiates `SqlAlchemyUserRepository` directly

**File:** `backend/app/routers/class_.py:10,54,86,133,163`

```python
from app.infrastructure.persistence.user_repository import SqlAlchemyUserRepository
# ...
user_repo = SqlAlchemyUserRepository(db)
teachers = {u.id: u for u in user_repo.find_by_ids(teacher_ids)}
```

The HTTP layer bypasses the application service entirely for user-enrichment and constructs the infrastructure repository inline.

**Impact:** User-fetch logic is split between router and service. Testing requires a real DB session. No consistency guarantee.

**Fix:** Add enrichment methods to `ClassApplicationService` (e.g., `list_classes_for_student_with_teacher`). The router feeds from service results only.

---

### BE-04 · High · Auth router calls `db.commit()` directly, bypassing UoW

**File:** `backend/app/routers/auth.py:146,352`

```python
record_audit_event(db, request, "LOGIN_FAILURE", ...)
db.commit()  # raw commit in the except block
```

This can prematurely commit half-written state or interfere with an enclosing UoW.

**Fix:** Move audit-log persistence to its own short-lived session (fire-and-forget) so it never depends on the caller's transaction state. Remove all `db.commit()` calls from the router.

---

### BE-05 · Medium · `audit_logger` writes are silently dropped on transaction rollback

**File:** `backend/app/infrastructure/audit_logger.py:1-27`

`record_audit_event` does `db.add(log_entry)` without committing. If the surrounding UoW rolls back (e.g., failed registration), the audit row is lost silently.

**Fix:** Give `record_audit_event` its own `Session` (opened from `SessionLocal`) that commits immediately, making it rollback-safe.

---

### BE-06 · Medium · `UserAchievement` aggregate is anemic — no invariants enforced

**File:** `backend/app/domain/achievement/aggregate.py`

`UserAchievement` has no methods or invariants. The "unlock once per user" rule is enforced solely by a DB unique constraint (`uq_user_achievement`). Any caller that bypasses the repository silently violates the invariant.

**Fix:** Move evaluation logic into a `AchievementPolicy` domain service. The aggregate's `create` method should validate `talent_points` against the known definition.

---

### BE-07 · Medium · `TalentAllocation.upgrade()` enforces no max-level cap

**File:** `backend/app/domain/talent/aggregate.py`, `backend/app/application/talent_service.py:106-119`

Max-level check and prerequisite resolution live entirely in the application service. Calling `upgrade()` directly exceeds `max_level` without raising.

**Fix:** `TalentAllocation.upgrade(max_level: int)` should raise `MaxLevelReachedError` when `self.current_level >= max_level`.

---

### BE-08 · Low · `TerritoryRepository` protocol exposes PG-specific advisory lock

**File:** `backend/app/domain/territory/repository.py`

`acquire_student_activity_lock` is declared as a first-class Protocol method, embedding a PostgreSQL-specific implementation detail in the domain contract. Any non-PG implementation must provide a meaningless no-op without guidance.

**Fix:** Move the advisory-lock call inside `SqlAlchemyTerritoryRepository.count_occupations_by_student_for_update` as an implementation detail; remove it from the Protocol.

---

### BE-09 · Medium · `login_guard.purge_stale` calls `db.commit()` internally

**File:** `backend/app/infrastructure/login_guard.py:118`

All other functions leave commit to the caller. `purge_stale` commits internally, creating inconsistent transaction ownership.

**Fix:** Remove `db.commit()` from `purge_stale`. The janitor in `main.py` should commit explicitly after all purge calls.

---

### BE-10 · Low · `level_cleared_at_star` achievement has no minimum-completion gate

**File:** `backend/app/application/achievement_service.py:120`

The condition only checks `session_star == condition_value`. A player who runs a 3-star level and immediately loses (0 waves survived, 0 score) still unlocks "Complete a 3-star level."

**Fix:** Add a guard (e.g., `waves_survived >= 1` or `score >= threshold`) and document the intent.

---

### BE-11 · Medium · `max_star_cleared` condition type is documented but never evaluated

**File:** `backend/app/domain/achievement/definitions.py:15` (comment), `backend/app/application/achievement_service.py:97-128`

The comment lists `max_star_cleared` as a valid condition type, but `_evaluate` has no matching branch. Any achievement added with this type silently returns `False` forever.

**Fix:** Either implement the branch or remove the comment. Add a defensive `else: logger.warning("Unknown condition_type %s", ct)`.

---

### BE-12 · Low · `_verify_score` mutates aggregate field directly from outside the aggregate

**File:** `backend/app/application/session_service.py:322-356`

```python
session.total_score = recomputed  # bypasses record_scoring_context
```

The application service writes to the aggregate's field directly, bypassing any future invariant `record_scoring_context` might add.

**Fix:** Add an `override_total_score(value: float | None)` method on `GameSession` for server-side overrides, with a comment documenting the intent.

---

### BE-13 · Medium · `_newly_unlocked_achievements` is a dynamic attribute stapled onto the aggregate

**File:** `backend/app/application/session_service.py:193`, `backend/app/application/mappers.py:12`

```python
session._newly_unlocked_achievements = [...]   # not declared in __init__
# ...
achievements = getattr(session, "_newly_unlocked_achievements", [])  # silent fallback
```

`GameSession` is used as a cross-boundary carrier for an HTTP response concern. The `getattr` fallback silently drops achievements if the attribute is never set.

**Fix:** Return a `@dataclass EndSessionResult(session: GameSession, newly_unlocked: list[dict])` from `end_session`. The mapper receives both arguments explicitly.


2026-05-04 DONE (above)

---

## 5. Frontend Architecture & Bugs

### FE-01 · Medium · `MontyHallSystem` imports `reactive` from Vue

**File:** `frontend/src/systems/MontyHallSystem.ts:1`

The `systems/` layer must be framework-free. `reactive` is used to make `this.current` Vue-reactive so `MontyHallPanel.vue` can observe it via `computed()`. This creates a hidden runtime dependency on the Vue runtime inside the game engine.

**Fix:** Remove `reactive` import. Emit a `MONTY_HALL_STATE_CHANGED` event with the full state snapshot. The component subscribes via the engine bus and stores a local `ref()` copy.

---

### FE-03 · Medium · Components directly call `engine.eventBus.emit()` and system methods

**Files:** `TowerInfoPanel.vue:49`, `BuffCardPanel.vue:128`, `MontyHallPanel.vue:78`, and others

Components call `gameStore.getEngine()` then emit events and call system methods (`sys?.finishEvent(engine)`) directly, mutating game state from the UI layer.

**Fix:** Wrap each engine mutation in a `gameStore` action (e.g., `gameStore.requestTowerUpgrade(id)`). Components never need `getEngine()`.

---

### FE-04 · Low-Medium · `EconomySystem.update` advances `timeTotal` in all game phases

**File:** `frontend/src/systems/EconomySystem.ts:68`

```ts
game.state.timeTotal = game.time
```

This runs unconditionally every tick, including during `MONTY_HALL` and `CHAIN_RULE` phases. Time spent in UI-pause phases inflates `timeTotal` in a way not captured by `timeExcludePrepare`, skewing the scoring formula.

**Fix:** Only advance `timeTotal` during `GamePhase.WAVE`, or add a dedicated `waveTime` tracker.

---

### FE-05 · Medium · `WaveSystem._startWave` — `spawnInterval = 0` causes infinite loop

**File:** `frontend/src/systems/WaveSystem.ts:42`

No guard against zero or negative `spawnInterval`. A malformed wave definition hangs the browser tab.

**Fix:** `this._spawnInterval = Math.max(0.05, waveDef.spawnInterval)`.

---

### FE-06 · Medium · `CombatSystem` runs before `EnemyAbilitySystem` — helper speed buff has a one-frame lag

**File:** `frontend/src/systems/CombatSystem.ts:58`, `frontend/src/composables/useGameLoop.ts:136-158`

`CombatSystem` is registered second; `EnemyAbilitySystem` is fourteenth. `speedBoost` written by the ability system in tick N is consumed by combat in tick N+1, causing a persistent one-frame lag on helper enemy speed buffs.

**Fix:** Either reset `speedBoost = 0` at the beginning of the combat tick (not the end), or register `EnemyAbilitySystem` before `CombatSystem`.

---

### FE-09 · Low · Unsafe `as any` on `towerModifierProvider` call

**File:** `frontend/src/composables/useGameLoop.ts:95`

```ts
talentStore.getTowerModifiers(towerType as any)
```

Suppresses a type error rather than resolving the underlying type mismatch.

**Fix:** Check `getTowerModifiers`'s signature and either narrow the call or fix the parameter type.

---

### FE-10 · Low · Unsafe `as { goldReward?: number }` cast in `BuffCardPanel.vue`

**File:** `frontend/src/components/game/BuffCardPanel.vue:172`

`BuffCard` does not declare `goldReward`. If the field is renamed, this silently returns `0`.

**Fix:** Add `goldReward?: number` to the `BuffCard` interface or the `CurseCard` discriminated subtype.

---

### FE-11 · Medium · `authStore` `probeTimer` is never cleared on app teardown

**File:** `frontend/src/stores/authStore.ts:87-94`

`setInterval` calling `authService.me()` is cleared on logout but not on page unload or SSR teardown. In test environments, leaked intervals cause stale request errors.

**Fix:** Acknowledge this as a design trade-off or add a `stopProbe()` call in the app's `beforeUnmount` / `app.unmount()` hook.

---

### FE-12 · Medium · RAF loop in `gameStore._startTimingSync` not cancelled on `wireEngine` error

**File:** `frontend/src/composables/useGameLoop.ts:206-225`

If `wireEngine` throws after `bindEngine(g)` but before `game.value = g`, the catch block calls `g.destroy()` but not `gameStore.unbindEngine()`. The RAF loop runs with a reference to the destroyed game object.

**Fix:** Call `gameStore.unbindEngine()` in the `wireEngine` catch block.

---

### FE-14 · Medium · `SpellBar.vue` — missing engine guard on mount; spell casting silently breaks on bad ordering

**File:** `frontend/src/components/game/SpellBar.vue:12-18`

If the engine is not yet initialized when `SpellBar` mounts, `_unsubClick` is never set and spells are permanently unregistered. Currently prevented by `v-if="ready"` in `GameView.vue`, but the guard is invisible at the component level.

**Fix:** Assert or warn in dev if `engine` is null at mount time.

---

### FE-15 · Low · `MontyHallPanel.vue` — watcher with `{ immediate: true }` calls `window.addEventListener` before mount

**File:** `frontend/src/components/game/MontyHallPanel.vue:29-35`

In SSR or test environments without `window`, this throws. The watcher does not guard against `window` being undefined.

**Fix:** Wrap in `if (typeof window !== 'undefined')` or move to `onMounted`.

---

### FE-16 · High · `MatrixTowerSystem` damage = dot product of tower positions — silent deactivation for opposite-quadrant arrangements

**File:** `frontend/src/systems/MatrixTowerSystem.ts:77`

```ts
const baseDamage = tower.x * pair.x + tower.y * pair.y
```

Towers in opposite quadrants produce a negative dot product → laser silently deactivates (`baseDamage <= 0` guard, line 78). Towers near the origin produce near-zero damage. This creates enormous damage variance based solely on map position, with no in-game explanation.

**Fix:** If the dot product mechanic is intentional, add UI feedback explaining why the laser is inactive. If not, use a formula that reflects tower tier/upgrade stats.

---

### FE-17 · High · `LimitTowerSystem` `-inf` outcome heals enemies to full HP every cooldown tick

**File:** `frontend/src/systems/LimitTowerSystem.ts:64-66`

```ts
case '-inf':
  enemy.hp = enemy.maxHp
  continue
```

With no cooldown gate or cap, a level-3 Limit tower continuously heals every enemy in range to full HP.

**Fix:** Cap the heal to `enemy.maxHp * 0.1` or emit an event and disable the tower after the first full-heal application.

---

### FE-18 · High · Boss chain-rule split-on-death relies on undocumented line-ordering assumption

**File:** `frontend/src/systems/EnemyAbilitySystem.ts:87-88`

```ts
boss.chainRuleAnsweredCorrectly = true  // must be line 87
this.emit(Events.ENEMY_KILLED, boss)    // must be line 88
```

`ENEMY_KILLED` dispatches synchronously (EventBus uses snapshot). The `_onEnemyKilled` guard reads `chainRuleAnsweredCorrectly` immediately. The guard works only because line 87 precedes line 88. A future reorder silently causes a double boss split.

**Fix:** Add a comment documenting this ordering dependency.

---

### FE-19 · Low · `useSessionSync.ts` — stale-closure risk on `bind()` retry

**File:** `frontend/src/composables/useSessionSync.ts:97`

Each `bind()` call creates a new `pending` ref. On retry, old event handlers could still reference the old ref. In practice, the composable clears handlers before re-binding, but the pattern is fragile.

**Fix:** Hoist `pending` outside `bind()` so its identity is stable across retries.

---

### FE-20 · Low · `api.ts` — 204 response casts `undefined as T`

**File:** `frontend/src/services/api.ts:170`

```ts
if (res.status === 204) return undefined as T
```

Callers typed as `Promise<SomeModel>` receive `undefined` without a compile error.

**Fix:** Use a `void` return overload or `T extends void ? undefined : never`.

---

### FE-21 · Medium · `leaderboardService.submit` appears to be dead code

**File:** `frontend/src/services/leaderboardService.ts:26-30`

`submit` sends `kills`, `waves_survived`, `session_id` to a separate `/api/leaderboard` endpoint. It has no call sites in the audited codebase. If leaderboard entries are now derived server-side from session completion, this method is dead and the endpoint may be stale.

**Fix:** Confirm whether the endpoint is still active. Remove dead call sites and methods.

---

### FE-22 · Low-Medium · `score-calculator.ts` — `healthFinal > healthOrigin` edge case clamps exponent

**File:** `frontend/src/domain/scoring/score-calculator.ts:43`

If `healthFinal > healthOrigin` (theoretically possible if a buff increases `maxHp` above `healthOrigin`), `rawExponentDenom < 1` is clamped to 1 and a warning is logged. Scoring becomes incorrect silently.

**Fix:** Document the assumption that `healthOrigin` equals `INITIAL_HP` (a constant); see also AC-06 fix.

---

### FE-23 · Medium · JS fallback for `numericalIntegrate` uses `|f(x)|` but WASM may use signed integral

**File:** `frontend/src/math/WasmBridge.ts:202-209`

The JS fallback applies `Math.abs` to each sample. If the WASM implementation computes a signed integral, the two backends produce different damage values for functions that go negative in the integration range.

**Fix:** Verify WASM behavior for negative-valued functions and align the JS fallback accordingly.

---

## 6. What Was Confirmed Clean

These areas were audited and found to be correctly implemented:

| Area | Verdict |
|------|---------|
| SQL injection | All queries use SQLAlchemy ORM or named bind parameters — no string-formatted SQL found |
| Role guards at route level | Every admin/teacher route has `Depends(require_role(...))` at the decorator |
| Password hashing | bcrypt rounds=12, 72-byte truncation guard, timing-safe `bcrypt.checkpw`, constant-time dummy on user-not-found |
| Token storage | `HttpOnly; Secure; SameSite=Lax` for access token; refresh scoped to `/api/auth/refresh` only |
| Token revocation | JTI denylist in PG for access tokens; hash-based one-time-use for refresh; `revoke_all_for_user` on logout |
| CORS | Explicit allowlist, no wildcard `*` with credentials |
| MFA challenge isolation | `mfa_challenge` token type blocked from granting resource access in `authenticate_token` |
| Password version invalidation | `pv` claim in JWT; password change increments version and invalidates all prior tokens |
| Refresh token rotation | Each refresh consumes old token, issues new one |
| Session binding | `user_id` filter on every mutating query — cross-user manipulation impossible |
| Score formula parity | Frontend `score-calculator.ts` and backend `score_calculator.py` are identical; tolerance correct |
| `total_score` trust boundary | Server unconditionally overwrites client value — not exploitable |
| Frontend `data/` layer | No imports from `domain/`, `stores/`, or `views/` — clean SoC |
| TOTP isolation | `mfa_challenge` tokens are ephemeral and cannot be reused for resource access |

---

## 7. Full Findings Index

| ID | Area | Severity | Short description |
|----|------|----------|-------------------|
| SEC-01 | Security | **High** | Real credentials in `.env` |
| SEC-02 | Security | Medium | HS256 only — no RS256 option |
| SEC-03 | Security | Medium | `SetUserActiveRequest` missing `extra="forbid"` |
| SEC-04 | Security | Medium | `/logout` CSRF-exempt despite state-changing POST |
| SEC-05 | Security | Medium | TOTP replay attack possible (no used-code record) |
| SEC-06 | Security | Medium | Rate limit bypass via IP rotation + per-account lockout gap |
| SEC-07 | Security | Low | `PathConfig` allows unbounded JSON |
| SEC-08 | Security | Low | `UserNotFoundError` returns 401 (should be 403) |
| SEC-09 | Security | Low | `FRONTEND_URL` missing; HTML email injection risk |
| SEC-10 | Security | Low | Audit log stores plaintext email PII |
| AC-01 | Anti-cheat | Medium | `end_session` non-locking read — double-submit race |
| AC-03 | Anti-cheat | **High** | Integer `score` never recomputed — leaderboard inflation |
| AC-04 | Anti-cheat | **High** | No gameplay enforcement — create + immediate end |
| AC-05 | Anti-cheat | Medium | WAVE_END replay at same wave accepted |
| AC-06 | Anti-cheat | **High** | `health_origin` client-supplied, used in server formula |
| AC-08 | Anti-cheat | Medium | Monty Hall rewards entirely client-side |
| AC-09 | Anti-cheat | Medium | Achievement unlock indirect bypass via AC-03/AC-04 |
| AC-12 | Anti-cheat | Medium | Concurrent end-session race (duplicate of AC-01) |
| AC-13 | Anti-cheat | Low | `n_prep_phases` accepted but ignored |
| BE-01 | Backend DDD | **High** | App services import `sqlalchemy.exc` |
| BE-02 | Backend DDD | Medium | App services typed against concrete `SqlAlchemyUnitOfWork` |
| BE-03 | Backend DDD | **High** | Router instantiates `SqlAlchemyUserRepository` directly |
| BE-04 | Backend DDD | **High** | Auth router calls `db.commit()` directly |
| BE-05 | Backend DDD | Medium | Audit log silently dropped on transaction rollback |
| BE-06 | Backend DDD | Medium | `UserAchievement` aggregate is anemic |
| BE-07 | Backend DDD | Medium | `TalentAllocation.upgrade()` enforces no max-level cap |
| BE-08 | Backend DDD | Low | `TerritoryRepository` protocol exposes PG advisory lock |
| BE-09 | Backend DDD | Medium | `login_guard.purge_stale` calls `db.commit()` internally |
| BE-10 | Backend DDD | Low | `level_cleared_at_star` has no minimum-completion gate |
| BE-11 | Backend DDD | Medium | `max_star_cleared` condition type undocumented and unimplemented |
| BE-12 | Backend DDD | Low | `_verify_score` mutates aggregate field from outside |
| BE-13 | Backend DDD | Medium | `_newly_unlocked_achievements` stapled as dynamic attribute on aggregate |
| FE-01 | Frontend | Medium | `MontyHallSystem` imports `reactive` from Vue |
| FE-03 | Frontend | Medium | Components call `engine.eventBus.emit()` and system methods directly |
| FE-04 | Frontend | Low-Med | `timeTotal` advances in all phases, not only WAVE |
| FE-05 | Frontend | Medium | Zero `spawnInterval` causes infinite loop in `WaveSystem` |
| FE-06 | Frontend | Medium | Helper speed buff has one-frame lag (system registration order) |
| FE-09 | Frontend | Low | Unsafe `as any` on `towerModifierProvider` call |
| FE-10 | Frontend | Low | Unsafe `as { goldReward? }` cast in `BuffCardPanel` |
| FE-11 | Frontend | Medium | `authStore` probe timer not cleared on app teardown |
| FE-12 | Frontend | Medium | RAF loop not cancelled on `wireEngine` error |
| FE-14 | Frontend | Medium | `SpellBar` — missing engine guard on mount |
| FE-15 | Frontend | Low | `MontyHallPanel` watcher calls `window.addEventListener` before mount |
| FE-16 | Frontend | **High** | Matrix tower damage = position dot product — silent deactivation |
| FE-17 | Frontend | **High** | Limit tower `-inf` outcome heals enemies to full HP every tick |
| FE-18 | Frontend | **High** | Boss split relies on undocumented line-ordering assumption |
| FE-19 | Frontend | Low | `useSessionSync` stale-closure risk on retry |
| FE-20 | Frontend | Low | `api.ts` 204 cast `undefined as T` bypasses type safety |
| FE-21 | Frontend | Medium | `leaderboardService.submit` appears to be dead code |
| FE-22 | Frontend | Low-Med | Score exponent clamps silently if `healthFinal > healthOrigin` |
| FE-23 | Frontend | Medium | JS vs WASM `numericalIntegrate` may disagree on signed vs unsigned |
