# Math Defense — Full Audit Report

**Date**: 2026-05-03  
**Scope**: Backend (FastAPI + SQLAlchemy + DDD) · Frontend (Vue 3 + TypeScript + engine systems)  
**Agents run**: 4 (backend-security, backend-ddd-bugs, frontend-security-soc, frontend-game-bugs)

---

## Quick-Reference Severity Matrix

| ID | Area | Severity | Short Title |
|----|------|----------|-------------|
| BS-1 | Backend Security | High | JWT algorithm not validated at config time |
| BS-2 | Backend Security | High | No refresh-token mechanism |
| BS-3 | Backend Security | High | Audit log committed outside caller transaction |
| BS-4 | Backend Security | Medium | `FRONTEND_URL` defaults to `localhost` |
| BS-5 | Backend Security | Medium | Demo-user email printed to logs |
| BS-6 | Backend Security | Medium | Raw exception message written to audit log |
| BS-7 | Backend Security | Low | Password validation asymmetry (register vs login) |
| BS-8 | Backend Security | Low | MFA setup returns raw TOTP secret in response |
| BB-1 | Backend Bug | High | Race condition: `TerritoryCapReachedError` not caught → 500 |
| BB-2 | Backend Bug | High | Talent point race: two concurrent allocations can go negative |
| BB-3 | Backend Bug | Medium | Session-end score recomputation exception too permissive |
| BB-4 | Backend Bug | Medium | Achievement null-guard missing (session deleted between fetch and check) |
| BB-5 | Backend Bug | Low | DB session not rolled back on error in `get_db()` |
| BB-6 | Backend Bug | Low | Score calculator `active_time` clamp undocumented |
| BB-7 | Backend Bug | Low | Talent node cost silently skips missing definitions |
| FS-1 | Frontend Security | Medium | CSRF token parsing duplicated in two files |
| FS-2 | Frontend Security | Low | MFA challenge token lives in a Vue `ref` |
| FG-1 | Frontend Bug | Critical | `MovementSystem` silently kills out-of-path enemies without event |
| FG-2 | Frontend Bug | High | `MatrixTowerSystem` leaks laser state when a paired tower is sold |
| FG-3 | Frontend Bug | High | `PetCombatSystem` processes already-dead enemies in the same tick |
| FG-4 | Frontend Bug | Medium | Chain-rule generator produces derivatives undefined at test points |
| FG-5 | Frontend Bug | Medium | Pet removal relies on brittle system-execution order |

**DDD / SoC**: Both backend and frontend layers are **fully compliant** — no violations found.

---

## Section 1 — Backend Security (done)

### BS-1 · High · JWT algorithm not validated at config time

**File**: `backend/app/config.py` ~line 39  
**Problem**: `algorithm` defaults to `"HS256"` with no validator enforcing that it is one of the allowed symmetric algorithms. If an operator sets `ALGORITHM=RS256` but provides only a symmetric secret, token verification will fail at runtime with an opaque error instead of at startup.  
**Fix**:
```python
@field_validator("algorithm")
@classmethod
def validate_algorithm(cls, v: str) -> str:
    allowed = {"HS256", "HS512"}
    if v not in allowed:
        raise ValueError(f"Algorithm must be one of {allowed}")
    return v
```

---

### BS-2 · High · No refresh-token mechanism

**File**: `backend/app/utils/security.py` + `backend/app/application/auth_service.py`  
**Problem**: Access tokens expire after 30 minutes and there is no refresh endpoint. Users who want persistent sessions must store their plaintext password to re-authenticate automatically.  
**Fix**: Issue short-lived access tokens (5–15 min) alongside long-lived refresh tokens stored in `httpOnly` cookies. Rotate refresh tokens on each use and implement a `/auth/refresh` endpoint. Revoke refresh tokens on logout.

---

### BS-3 · High · Audit log committed outside caller transaction

**File**: `backend/app/infrastructure/audit_logger.py` ~line 34  
**Problem**: The logger calls `db.commit()` immediately inside itself. If the calling request then raises an exception and rolls back, the audit entry is already persisted, creating a record of an action that never completed. Conversely, if the caller commits and the audit call was skipped due to an error, the action occurs without a log entry.  
**Fix**: Remove the `db.commit()` from the logger. Let the caller's Unit-of-Work commit both the domain change and the audit entry atomically:
```python
# audit_logger.py — just add, never commit
db.add(log_entry)
```

---

### BS-4 · Medium · `FRONTEND_URL` defaults to `localhost`

**File**: `backend/app/config.py` ~line 74  
**Problem**: `frontend_url: str = "http://localhost:5173"` is used to build email-verification links. If `FRONTEND_URL` is not set in production, every verification email will contain a `localhost` link that is unreachable from outside the server.  
**Fix**: Remove the default; make the field required and validate it is a proper HTTP/HTTPS URL:
```python
frontend_url: str  # required — no default

@field_validator("frontend_url")
@classmethod
def validate_frontend_url(cls, v: str) -> str:
    if not v.startswith(("http://", "https://")):
        raise ValueError("FRONTEND_URL must be an absolute URL")
    return v
```

---

### BS-5 · Medium · Demo-user email printed to logs

**File**: `backend/app/seed.py` ~line 65  
**Problem**: `logger.info("Seeded demo user: %s", DEMO_EMAIL)` writes the hardcoded credential email to any log aggregation system. Discovering it makes targeted attacks trivial.  
**Fix**: Log only the role, not the address:
```python
logger.info("Seeded demo user (role: student)")
```

---

### BS-6 · Medium · Raw exception message written to audit log

**File**: `backend/app/routers/auth.py` ~lines 117–118, 299  
**Problem**: `{"email": req.email, "error": str(e)}` records the full exception string, which may contain stack frames, internal DB messages, or token format details.  
**Fix**: Log only the exception type:
```python
{"email": req.email, "error_type": type(e).__name__}
```

---

### BS-7 · Low · Password validation asymmetry

**File**: `backend/app/schemas/auth.py`  
**Problem**: `RegisterRequest` applies full password strength rules (8+ chars, letter + digit, zxcvbn score ≥ 2), but `LoginRequest` checks only the 72-byte bcrypt limit. A shorter password that bypasses the length check could theoretically be injected at the login endpoint.  
**Fix**: Add a minimum-length validator to `LoginRequest`:
```python
@field_validator("password")
@classmethod
def password_min_length(cls, v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password too short")
    return v
```

---

### BS-8 · Low · MFA setup returns raw TOTP secret in response

**File**: `backend/app/routers/auth.py` ~lines 238–247  
**Problem**: `/mfa/setup` returns the TOTP secret string in the JSON response body. If TLS termination is misconfigured or responses are cached by a proxy, the secret is exposed before the user confirms it.  
**Fix**: Return only the provisioning URI (which the authenticator app scans) and omit the raw secret field. Alternatively, store the secret only after the user confirms it via `/mfa/confirm`, not before.

---

### Backend Security: Positive Controls (summary)

The following controls are well-implemented and require no changes:

- **bcrypt with 12 rounds** + 72-byte truncation guard
- **JWT** includes `jti`, `iss`, `aud`, `exp`, `iat`, `sub`; algorithm explicitly pinned on decode
- **Token denylist** persisted in PostgreSQL; stale entries purged by scheduler
- **Login throttling** via PostgreSQL advisory locking; progressive lockout after 5 failures
- **CSRF** double-submit cookie with `SameSite=Lax`; token rotated every response
- **Security headers**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`
- **CORS** origins required and validated as proper URLs at startup
- **Input validation** with `extra="forbid"` on all request schemas
- **Password version** on User to invalidate tokens on password change
- **Email verification** tokens are one-time use with 24-hour expiry

---

## Section 2 — Backend DDD Architecture (done)

**Result: COMPLIANT — no violations found.**

All five audited invariants pass:

| Invariant | Status |
|-----------|--------|
| `domain/` does not import `infrastructure/` or `application/` | ✓ |
| `application/` does not import SQLAlchemy ORM models directly | ✓ |
| Routers call application services only (no direct repo/ORM access) | ✓ |
| Aggregates reference other aggregates by ID, not by object | ✓ |
| No God-module files mixing multiple responsibilities | ✓ |

---

## Section 3 — Backend Systemic Bugs (done)

### BB-1 · High · Race condition: `TerritoryCapReachedError` not caught → 500

**File**: `backend/app/application/territory_service.py` ~lines 254–276  
**Problem**: Two concurrent `attempt_occupation` requests from the same student can both read `count=4`, both pass the effective-count check, and then both call `activity.attempt_occupation()`. The aggregate's cap check raises `TerritoryCapReachedError`, but only `IntegrityError` is caught in the outer `try/except`. The uncaught domain error propagates as a 500 Internal Server Error instead of returning `{"seized": False}`.  
**Fix**:
```python
try:
    occupation = activity.attempt_occupation(slot, student_id, score, effective_count, session_id)
except (ScoreNotHighEnoughError, TerritoryCapReachedError):
    return {"seized": False, "occupation": None}
try:
    self._territory_repo.record_session_use(session_id)
    self._territory_repo.save_occupation(occupation)
    self._uow.commit()
except IntegrityError:
    return {"seized": False, "occupation": None}
```

---

### BB-2 · High · Talent point race: two concurrent allocations can go negative

**File**: `backend/app/application/talent_service.py` ~lines 91–127  
**Problem**: Two concurrent `allocate_point()` calls by the same user can both read `available=5`, both validate they have enough points, and both commit — leaving the user with −1 available points. The `find_by_user_for_update()` lock is released at commit, so the second request acquires the lock only after the first has already committed the decrement.  
**Fix**: Re-read and recompute `available` inside the UoW after acquiring the row lock, immediately before the allocation attempt, so the check uses the post-lock value:
```python
with self._uow:
    alloc_list = self._talent_repo.find_by_user_for_update(user_id)
    spent = sum(
        TALENT_NODE_DEFS[a.talent_node_id].cost_per_level * a.current_level
        for a in alloc_list if a.talent_node_id in TALENT_NODE_DEFS
    )
    available = earned - spent
    if available < node_def.cost_per_level:
        raise InsufficientTalentPointsError(...)
    ...
```

---

### BB-3 · Medium · Session-end score recomputation exception too permissive

**File**: `backend/app/application/session_service.py` ~lines 125–193  
**Problem**: `_verify_score()` is called inside the UoW after the session aggregate has already been modified. If the recomputation raises (e.g., divide-by-zero in an edge-case input), the exception is silently caught by a broad `except Exception` and only logged, while the partially-modified session is still committed with the client-supplied score unchanged.  
**Fix**: Either let the exception propagate (fail the request) or verify the score before mutating the aggregate, so a computation failure has no side effects.

---

### BB-4 · Medium · Achievement evaluation missing null guard

**File**: `backend/app/application/achievement_service.py` ~lines 217–247  
**Problem**: If the session is deleted between the event being dispatched and the achievement service querying it (e.g., a concurrent cleanup job), `session` is `None` and `hp_lost` defaults to `0`. This silently satisfies "perfect run" conditions and incorrectly unlocks achievements.  
**Fix**:
```python
if not session:
    logger.warning("Session %s not found for achievement check; skipping", event.session_id)
    return []
```

---

### BB-5 · Low · `get_db()` does not rollback on error

**File**: `backend/app/db/database.py` ~lines 20–25  
**Problem**: If an exception escapes the `yield` block, the session is closed by `finally` but never explicitly rolled back. SQLAlchemy will eventually rollback on `close()`, but explicit rollback is safer and makes intent clear.  
**Fix**:
```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
```

---

### BB-6 · Low · Score calculator `active_time` clamp undocumented

**File**: `backend/app/domain/scoring/score_calculator.py` ~line 30  
**Problem**: `active_time = max(0.001, time_total - prep_sum)` silently clamps sub-millisecond sessions to 0.001 seconds, making their `S1` score artificially inflated. The clamping is correct (prevents division by zero) but the rationale is invisible.  
**Fix**: Add a one-line comment:
```python
# Clamp to 0.001 to prevent ZeroDivisionError from timing precision errors
active_time = max(0.001, time_total - prep_sum)
```

---

### BB-7 · Low · Talent node cost silently skips missing definitions

**File**: `backend/app/application/talent_service.py` ~lines 35–41  
**Problem**: If a talent node is removed from `TALENT_NODE_DEFS` during a balance patch but old allocations remain in the DB, the cost loop skips that allocation, artificially inflating `available` points. The user can then over-spend into nodes they should not afford.  
**Fix**:
```python
if not node_def:
    raise ValueError(f"Talent node '{alloc.talent_node_id}' has no definition — data integrity error")
```

---

## Section 4 — Frontend Security (done)

### FS-1 · Medium · CSRF token parsing duplicated in two files

**Files**: `frontend/src/services/api.ts` ~lines 32–40, 108–111; `frontend/src/services/authService.ts` ~lines 59–62  
**Problem**: Manual `document.cookie` parsing for the CSRF token is copy-pasted into two service files. Any future change to the cookie name or parsing strategy must be made in both places. Additionally, if an XSS vulnerability were introduced elsewhere, having the CSRF token accessible from JavaScript makes it readable by the attacker (defeating the double-submit defence).  
**Fix**: Extract cookie parsing to a single helper in `api.ts` and import it from `authService.ts`. Long-term, evaluate whether the backend can validate CSRF transparently via `SameSite=Strict` cookies without requiring the frontend to manage tokens at all.

---

### FS-2 · Low · MFA challenge token lives in a Vue `ref`

**File**: `frontend/src/composables/useAuth.ts` ~lines 10, 21, 55, 75, 87  
**Problem**: The MFA interim token returned after the first authentication step is stored in a reactive `ref` (`mfaToken`) that persists for the lifetime of the composable. It is accessible to any code that calls `useAuth()` and could be inspected via Vue DevTools in development.  
**Fix**: Scope the token to the duration of the MFA submission (a local `let` inside the login function) or have the backend maintain MFA session state via an `httpOnly` cookie instead of returning a token to JavaScript.

---

### Frontend Security: Positive Controls (summary)

- **Auth tokens**: stored in `httpOnly` cookies only; JavaScript has no access
- **XSS**: zero `v-html` / `innerHTML` usage found across all components
- **KaTeX rendering**: all LaTeX strings are generated from hardcoded templates; no user input is embedded
- **Route guards**: enforced asynchronously after `auth.initPromise` resolves (server-validated role required before protected pages render)
- **Avatar URLs**: restricted to a hardcoded preset array; no user-supplied URLs are accepted
- **API base URL**: read from `import.meta.env.VITE_API_BASE_URL`; no hardcoded secrets found
- **Session expiry**: 401 responses trigger `handleSessionExpiry()` which clears state and redirects; no redirect loop possible

---

## Section 5 — Frontend SoC / Layer Rules (done)

**Result: COMPLIANT — no violations found.**

| Layer rule | Status |
|------------|--------|
| `math/` has zero imports from domain, composables, views, or stores | ✓ |
| `data/` has zero imports from domain, composables, views, or stores | ✓ |
| `domain/` imports `@/math/` and `@/data/` only | ✓ |
| Engine systems have zero direct Pinia store imports | ✓ |
| Engine ↔ Pinia bridge uses callbacks only (`game.towerModifierProvider`, etc.) | ✓ |
| Components emit events to `game.eventBus`; they never mutate engine state directly | ✓ |
| Services contain API calls and data types only; no business logic mixed in | ✓ |

---

## Section 6 — Frontend Game-Logic Bugs (done)

### FG-1 · Critical · `MovementSystem` silently kills out-of-path enemies without emitting an event

**File**: `frontend/src/systems/MovementSystem.ts` ~lines 85–95  
**Problem**: When an enemy's `x` position falls outside all path segments (e.g., due to floating-point drift), the system sets `enemy.alive = false` and `enemy.active = false` silently — no event is emitted. This means:
- `EconomySystem` receives no kill reward
- `EnemyAbilitySystem` never triggers a boss split-on-death for this enemy
- `PetCombatSystem` may still be targeting this enemy in the same tick and call `applyDamage` on it, resulting in an inconsistent kill where the kill event is emitted by the combat path but the entity is already dead

**Current code**:
```typescript
if (!segment) {
  console.warn(`[MovementSystem] Enemy ${enemy.id} at x=${enemy.x} outside path...`)
  enemy.alive = false   // ← Silent kill, no event
  enemy.active = false
  return
}
```

**Fix**: Emit the canonical kill event so downstream systems handle cleanup consistently:
```typescript
if (!segment) {
  enemy.alive = false
  enemy.active = false
  game.eventBus.emit(Events.ENEMY_KILLED, { enemy, source: 'out-of-path' })
  return
}
```

---

### FG-2 · High · `MatrixTowerSystem` leaks laser state when a paired tower is sold

**File**: `frontend/src/systems/MatrixTowerSystem.ts` ~lines 46–108; `frontend/src/systems/TowerUpgradeSystem.ts` ~lines 76–90  
**Problem**: `TowerUpgradeSystem._refund()` removes the tower from `game.towers` and emits `TOWER_REFUND_RESULT`, but does **not** emit a `TOWER_REMOVED` event. `MatrixTowerSystem` has no listener for removal events, so:

1. Tower A and Tower B are paired (`matrixPairId` = each other's ID).
2. Tower A is sold → removed from `game.towers`.
3. Tower B's `matrixPairId` still points to Tower A's ID.
4. `MatrixTowerSystem.update()` correctly skips Tower B (`if (!pair) continue`), so no crash.
5. But the `_lasers` map retains the stale `"A:B"` key indefinitely, growing each time a Matrix pair is partially sold.
6. If a new tower is ever assigned the same ID as A (hash collision), its laser data is pre-populated from the stale entry.

**Fix**: In `MatrixTowerSystem`, listen for tower removal and clean up:
```typescript
game.eventBus.on(Events.TOWER_REFUND_RESULT, ({ towerId }) => {
  for (const key of this._lasers.keys()) {
    const [a, b] = key.split(':')
    if (a === towerId || b === towerId) this._lasers.delete(key)
  }
})
```
Also clear the surviving partner's `matrixPairId`:
```typescript
const partner = game.towers.find(t => t.matrixPairId === towerId)
if (partner) partner.matrixPairId = null
```

---

### FG-3 · High · `PetCombatSystem` processes already-dead enemies in the same tick

**File**: `frontend/src/systems/CalculusTowerSystem.ts` (PetCombatSystem) ~lines 182–235  
**Problem**: Multiple pets can select the same target. If Pet A kills an enemy mid-loop (sets `enemy.alive = false`), Pet B in the same `for (const pet of game.pets)` iteration still finds that target by ID and calls `_dealDamage` on it. The current guard `if (!enemy.alive) return` in `SplitPolicy.applyDamage` prevents double-kill in practice, but only because `SplitPolicy` is the final gate. If any future system path bypasses that guard, double-kills will silently produce duplicate kill rewards or double-split events.  
**Fix**: After Pet A kills the enemy, break the pet loop early or mark the enemy as "claimed" with a frame token before descending into the pet loop. Alternatively, validate liveness at the top of `_dealDamage` before any side effects:
```typescript
if (!target.alive) return   // add as first line of _dealDamage
```

---

### FG-4 · Medium · Chain-rule generator can produce derivatives undefined at test points

**File**: `frontend/src/math/chain-rule-generator.ts` ~lines 7–86  
**Problem**: The outer function pool includes `ln(u)`, whose derivative is `1/u`. If the inner function evaluates to `0` at the chosen test point (e.g., inner = `2x`, outer = `ln(x)`, test point `x = 0`), the derivative is `1/0 = Infinity` or `NaN`. This propagates to the displayed answer choices, showing `∞` or `NaN` as a multiple-choice option, which confuses players and may break the correctness validator.  
**Fix**: After generating a question, evaluate the composite derivative at the canonical test point (e.g., `x = 1`) before returning it. If the result is non-finite, regenerate:
```typescript
const derivAtTest = evaluateDerivativeAt(expr, testPoint)
if (!isFinite(derivAtTest)) return generateChainRuleQuestion(seed + 1) // retry
```

---

### FG-5 · Medium · Pet removal relies on brittle system execution order

**File**: `frontend/src/systems/CalculusTowerSystem.ts` ~lines 100–157 vs ~lines 182–235  
**Problem**: `CalculusTowerSystem._removePets()` splices from `game.pets` directly. It runs before `PetCombatSystem.update()` in the system list (by current `useGameLoop.ts` ordering). If that order changes, `PetCombatSystem` could iterate a pet that is removed mid-loop by `CalculusTowerSystem`, or conversely process a pet that should have been cleaned up this frame.  
**Fix**: Replace in-frame splicing with a tombstone flag:
```typescript
// Instead of game.pets.splice(idx, 1):
pet.active = false

// After all systems run, in a cleanup pass:
game.pets = game.pets.filter(p => p.active)
```
This makes pet removal order-independent.

---

### Frontend Game-Logic: Negative Findings (things verified as correct)

| Item | Verdict |
|------|---------|
| `requestAnimationFrame` cancellation in `Game.stop()` | Correct |
| `EventBus.emit()` snapshots listeners before iteration | Correct |
| Event listener cleanup in `useGameLoop.onUnmounted()` | Correct |
| Projectile collision: `break` after first hit prevents double-hit | Correct |
| `speedBoost` accumulated then reset each tick | Correct |
| Helper aura uses `Math.max` (no stacking of multiple helpers) | Correct |
| Limit question shuffle uses unbiased Fisher-Yates | Correct |
| Monty Hall reveal logic: host avoids prize door and player's door | Correct |
| Score formula denominator guarded by `Math.max(1, ...)` | Correct |
| `game.pets` array cleared on `startLevel()` | Correct |
| All enemy/projectile arrays reset between levels | Correct |
| DPR media-query listener properly removed on unmount | Correct |
| Log evaluator guards `arg <= 0` before `Math.log` | Correct |

---

## Section 7 — Recommended Fix Order

| Priority | ID | Action |
|----------|----|--------|
| 1 (do now) | FG-1 | Emit `ENEMY_KILLED` from `MovementSystem` out-of-path branch |
| 2 (do now) | BB-1 | Catch `TerritoryCapReachedError` in territory service |
| 3 (do now) | BB-2 | Re-read available points inside the talent UoW lock |
| 4 (do now) | FG-2 | Clean up laser map + partner `matrixPairId` on tower sell |
| 5 (sprint) | BS-1 | Add JWT algorithm validator to `Settings` |
| 6 (sprint) | BS-3 | Remove `db.commit()` from `audit_logger.py` |
| 7 (sprint) | FG-3 | Guard `_dealDamage` with `if (!target.alive) return` |
| 8 (sprint) | FG-4 | Validate chain-rule derivative is finite before delivering |
| 9 (sprint) | BB-3 | Tighten session-end score recomputation exception handling |
| 10 (sprint) | BB-4 | Add null guard in achievement evaluation |
| 11 (backlog) | BS-2 | Implement refresh-token flow |
| 12 (backlog) | BS-4 | Make `FRONTEND_URL` required; validate format |
| 13 (backlog) | FG-5 | Refactor pet removal to use tombstone `active = false` |
| 14 (backlog) | FS-1 | Deduplicate CSRF cookie parsing into one helper |
| 15 (backlog) | BB-7 | Raise on missing talent node definition |
| 16 (hygiene) | BS-5 | Remove email from seed log |
| 17 (hygiene) | BS-6 | Log exception type, not message, in audit entries |
| 18 (hygiene) | BB-6 | Add comment explaining `active_time` clamp |
