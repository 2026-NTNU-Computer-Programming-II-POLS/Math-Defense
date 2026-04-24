# Math Defense — Full Audit Report

**Date:** 2026-04-24  
**Scope:** Backend (API/Domain + Infrastructure) · Frontend (UI/UX/Logic) · Security  
**Methodology:** Static code analysis via four parallel agents (no tests run)

---

## Table of Contents

1. [Security Findings](#1-security-findings) ← Read this first
2. [Backend — API, Domain & Application Layer](#2-backend--api-domain--application-layer)
3. [Backend — Infrastructure, DB & Configuration](#3-backend--infrastructure-db--configuration)
4. [Frontend — UI/UX, Components & Game Logic](#4-frontend--uiux-components--game-logic)
5. [Summary Table](#5-summary-table)

---

## 1. Security Findings

### SEC-01 — Secrets committed to the repository
**Severity: CRITICAL**  
**File:** `.env` lines 1–3  
**OWASP:** A07 Identification and Authentication Failures / CWE-798

The `.env` file containing actual `SECRET_KEY`, `DATABASE_URL` (with password), and `POSTGRES_PASSWORD` is committed to the repository. Any person with read access to the repo can:

- Forge arbitrary JWTs (JWT HMAC key exposed) and impersonate any user.
- Connect to the PostgreSQL database directly and read/modify all user data, scores, and entries.

**Fix:** Run `git rm --cached .env`, add `.env` to `.gitignore`, then rotate the `SECRET_KEY` and database password immediately.

---

### SEC-02 — Access token returned in JSON body
**Severity: HIGH**  
**Files:** `backend/app/routers/auth.py:56,66` · `backend/app/schemas/auth.py:81`  
**OWASP:** A02 Cryptographic Failures / CWE-200

Both `/register` and `/login` return `TokenResponse` containing `access_token` in the JSON body **and** set it in an HTTP-only cookie. The cookie alone is sufficient and safer; the body field breaks defense-in-depth by making the token readable from JavaScript response objects, browser history, and log files.

**Fix:** Remove the `access_token` field from `TokenResponse` (or make it `None`/excluded). The HTTP-only cookie is the authoritative carrier.

---

### SEC-03 — Logout uses `credentials: 'same-origin'` in cross-origin deployments
**Severity: HIGH**  
**File:** `frontend/src/services/authService.ts:34,36`  
**OWASP:** A04 Insecure Design / CWE-639

When the frontend and backend live on different origins (the normal production topology), `credentials: 'same-origin'` does **not** send the auth cookie to the backend. The logout endpoint therefore never receives the token, the `denied_tokens` denylist is never updated, and the JWT remains valid for up to 30 minutes after the user thinks they have logged out.

Note: `backend/app/routers/auth.py:82-89` already has a silent `pass` for logout failures, confirming this scenario was anticipated but not fixed.

**Fix:** Change the logout fetch to `credentials: 'include'`. Also add `Set-Cookie: ...; Max-Age=0` in the logout response to clear the cookie regardless of credential mode.

---

### SEC-04 — Rate-limit key extraction is undocumented for production
**Severity: HIGH**  
**File:** `backend/app/limiter.py:5-16`  
**OWASP:** A05 Security Misconfiguration / CWE-770

The custom IP extractor uses raw socket `request.client.host` and explicitly tells operators to replace it with `X-Forwarded-For` logic when deployed behind a reverse proxy — but provides no implementation or startup validation. If deployed behind a proxy (Nginx, Docker Compose, etc.) without this customization, all requests appear to come from the proxy's IP, collapsing rate limits for all users into a single bucket and effectively disabling brute-force protection.

**Fix:** Implement trusted-proxy IP extraction at startup, or document clearly in deployment instructions. Add a startup check that warns when `PROXY_MODE=true` is set but no trusted proxy IP is configured.

---

### SEC-05 — Unauthenticated leaderboard exposes all usernames
**Severity: MEDIUM**  
**File:** `backend/app/routers/leaderboard.py:23-31`  
**OWASP:** A01 Broken Access Control

The `GET /api/leaderboard` endpoint requires no authentication, allowing anonymous enumeration of all username–score pairs. While a public leaderboard may be intentional, it enables username harvesting for credential-stuffing attacks.

**Fix:** If public access is intended, document it. If restricted access is intended, add `Depends(get_current_user)`.

---

### SEC-06 — No password change or password reset endpoint
**Severity: LOW**  
**File:** Missing — not present anywhere in codebase

Users cannot change a compromised password or recover a forgotten one. Accounts become permanently inaccessible or permanently compromised.

**Fix:** Add `POST /auth/change-password` (requires current password) and optionally `POST /auth/forgot-password` with an email-based reset flow.

---

### SEC-07 — Token probe interval too long
**Severity: LOW**  
**File:** `frontend/src/stores/authStore.ts:22`

`TOKEN_PROBE_INTERVAL_MS = 60_000`. With 30-minute token expiry, an expired session can continue operating undetected for up to 60 seconds after token expiry.

**Fix:** Reduce to 10–15 seconds.

---

### Security: Good practices confirmed

The following are **correctly implemented** and require no changes:

- JWT uses HS256 with issuer/audience claims; "none" algorithm not accepted.
- Passwords hashed with bcrypt/12 rounds; truncated to 72 bytes (UTF-8 aware).
- Constant-time dummy hash prevents username-enumeration via timing.
- One active session per user enforced by partial unique index.
- All state-changing endpoints verify `user_id` ownership.
- Score and level are always taken from the authoritative server-side session, not client submission.
- CSRF double-submit cookie with `SameSite=Lax` and `Secure` flag.
- `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` headers set.
- All queries use SQLAlchemy ORM parameterization (no raw SQL injection risk).
- Login brute-force lockout: 5 attempts in 5 minutes → 5-minute lockout.

---

## 2. Backend — API, Domain & Application Layer

### BE-01 — `kill_cap` default derived from user-supplied input
**Severity: HIGH**  
**File:** `backend/app/domain/session/aggregate.py:168`

```python
kill_cap = LEVEL_MAX_KILLS.get(int(self.level), result.kills + 1)
```

If a level is absent from `LEVEL_MAX_KILLS`, the fallback is `result.kills + 1`, which always satisfies the subsequent `result.kills ≤ kill_cap` check. Any new level added without updating the constraints dict silently disables the kill anti-cheat.

**Fix:** Replace the default with a hard constant (e.g., `KILLS_MAX` or `0`) that causes the check to fail for unrecognized levels.

---

### BE-02 — `waves_survived` validation skips zero-wave sessions
**Severity: HIGH**  
**File:** `backend/app/application/leaderboard_service.py:80`

```python
if session.current_wave > 0 and waves_survived > session.current_wave:
    raise SessionValidationError(...)
```

When `current_wave == 0` (session created but never played), the guard is bypassed entirely, allowing any `waves_survived` value up to the level maximum to be submitted without error.

**Fix:** Remove the `session.current_wave > 0` guard, or add an explicit check that `waves_survived ≤ session.current_wave` regardless of whether `current_wave` is 0.

---

### BE-03 — `POST /api/leaderboard` has no `response_model`
**Severity: MEDIUM**  
**File:** `backend/app/routers/leaderboard.py:49`

Every other endpoint in the codebase uses a Pydantic `response_model`. The score-submission endpoint returns a bare `dict` with no schema validation, no OpenAPI documentation, and no forward-compatibility contract.

**Fix:** Define a `ScoreSubmissionResponse(BaseModel)` schema in `app/schemas/leaderboard.py` with `id: str` and `score: int`, and apply `response_model=ScoreSubmissionResponse` to the endpoint.

---

### BE-04 — Idempotency catch-up path uses request values, not original session values
**Severity: MEDIUM**  
**File:** `backend/app/application/session_service.py:117-126`

When a completed session is re-submitted (the idempotency path), the `SessionCompleted` event is re-dispatched using `kills` and `waves_survived` from the **new request** rather than the original session data. A client that retries with different stats will record wrong leaderboard values.

**Fix:** Source `kills` and `waves_survived` from the stored session aggregate, not from the incoming `EndSessionRequest`.

---

## 3. Backend — Infrastructure, DB & Configuration

### BE-05 — Missing index on `leaderboard_entries.session_id`
**Severity: HIGH**  
**File:** `backend/app/models/leaderboard.py:25`

`session_id` is a foreign key used in `find_by_session_id()` (the duplicate-submission guard called under row lock). Without an index this is a full table scan on every session-end request.

**Fix:** Add `index=True` to the `session_id` column definition, or add an `Index("ix_leaderboard_entries_session_id", "session_id")` in the model's `__table_args__`.

---

### BE-06 — No `pool_recycle` on SQLAlchemy engine
**Severity: MEDIUM**  
**File:** `backend/app/db/database.py:5-10`

The engine has `pool_size=10, max_overflow=20` but no `pool_recycle`. PostgreSQL servers commonly close idle connections after a timeout (`idle_in_transaction_session_timeout`). Without recycling, stale connections cause "server closed the connection unexpectedly" errors under low-traffic periods.

**Fix:** Add `pool_recycle=3600` (or match the PostgreSQL idle timeout).

---

### BE-07 — Background janitor does not use a context manager for its DB session
**Severity: MEDIUM**  
**File:** `backend/app/main.py:64-71`

`_auth_store_janitor()` creates `SessionLocal()` with a bare `try/finally`. If `db.close()` itself raises, the connection leaks back into the pool in an unknown state. The janitor runs indefinitely, so repeated exceptions will exhaust the pool over time.

**Fix:** Replace with `with SessionLocal() as db:` to guarantee cleanup regardless of exceptions.

---

### BE-08 — Missing index on `leaderboard_entries.created_at`
**Severity: MEDIUM**  
**File:** `backend/app/models/leaderboard.py`

The ranked-leaderboard query sorts by `created_at` as a tiebreaker. Without an index this becomes a full table scan for every paginated leaderboard request as the table grows.

**Fix:** Add `index=True` to the `created_at` column.

---

### BE-09 — Cascade delete silently removes all scores when a user is deleted
**Severity: MEDIUM**  
**Files:** `backend/app/models/game_session.py:25` · `backend/app/models/leaderboard.py:19,25`

`ondelete="CASCADE"` on both tables means deleting a user permanently removes their sessions and leaderboard entries with no audit trail. For a competitive game this is irreversible data loss.

**Fix:** Consider soft-delete (add `deleted_at` to `User`) or replace `CASCADE` with `SET NULL` on leaderboard entries so history is preserved.

---

### BE-10 — Missing index on `login_attempts.locked_until`
**Severity: LOW**  
**File:** `backend/app/infrastructure/persistence/login_attempt_repository.py`

The stale-row cleanup query (`purge_stale()`) filters by `locked_until < now` with no index, causing a full scan of the `login_attempts` table on every janitor tick.

**Fix:** Add `index=True` to the `locked_until` column.

---

### BE-11 — No CORS origin syntax validation at startup
**Severity: LOW**  
**File:** `backend/app/config.py:63-72`

`parse_cors_origins()` accepts any string starting with `http://` or `https://`, so `"https://"` (no host) passes validation and can cause silent CORS misconfiguration.

**Fix:** Add a URL-parse step to confirm the host component is non-empty.

---

## 4. Frontend — UI/UX, Components & Game Logic

### FE-01 — Level not found produces silent failure
**Severity: MEDIUM**  
**File:** `frontend/src/composables/useGameLoop.ts:113`

When `LEVEL_START` fires, the level is looked up via `LEVELS.find(...)`. If the level is not found (invalid `levelId` from the backend, or a missing definition), the function returns `undefined` silently. No error modal is shown and the player sees a blank canvas or a frozen game state with no explanation.

**Fix:** Add an explicit `if (!level) { emit error modal "Level failed to load (K-3)" }` guard.

---

### FE-02 — FourierPanel sliders are not reset between boss encounters
**Severity: MEDIUM**  
**File:** `frontend/src/components/game/FourierPanel.vue:43-112`

When a new boss phase starts (`BOSS_SHIELD_START`), the target frequencies and amplitudes update, but the player's six slider values (`freq1–3`, `amp1–3`) retain their values from the previous encounter. Players must manually reset all six sliders at the start of every boss wave, leading to a confusing experience.

**Fix:** Watch for `BOSS_SHIELD_START` events and reset slider values to their default/neutral positions.

---

### FE-03 — BuildPanel `localParams` may hold stale state on rapid tower switching
**Severity: MEDIUM**  
**File:** `frontend/src/components/game/BuildPanel.vue:52-75`

`localParams` is reset by a `watch` on `tower`, but Vue watchers are asynchronous by default. A player clicking two towers in quick succession before the watch callback runs could have the specialized sub-panels (MatrixInputPanel, IntegralPanel, FourierPanel) briefly render with a mix of old and new tower parameters before the reset fires.

**Fix:** Add `{ flush: 'sync' }` to the watch to make the reset synchronous, or use `watchEffect` with a guard.

---

### FE-04 — BuffCardPanel focus restoration fails on disabled/hidden elements
**Severity: MEDIUM** (Accessibility)  
**File:** `frontend/src/components/game/BuffCardPanel.vue:104-108`

In `onUnmounted`, focus is restored to `previousFocus` inside a `try/catch`. If that element is disabled, hidden, or removed from the DOM, the `focus()` call throws and the catch silently swallows it, leaving focus on `<body>` and breaking keyboard navigation for all subsequent interactions.

**Fix:** Before calling `.focus()`, check `previousFocus.offsetParent !== null && !previousFocus.disabled`.

---

### FE-05 — IntegralPanel canvas is not DPR-aware
**Severity: MEDIUM**  
**File:** `frontend/src/components/game/IntegralPanel.vue:130-135`

The canvas is initialized with `dpr: false`, meaning it renders at logical pixels. On 2× or 3× DPR devices (Retina/HiDPI screens) the integration visualization, curve, and text labels appear blurry.

**Fix:** Remove `dpr: false` and let `useCanvasPlot` apply `window.devicePixelRatio` scaling, or manually scale the canvas context by `devicePixelRatio`.

---

### FE-06 — Missing null check for tower object in useGameLoop
**Severity: MEDIUM**  
**File:** `frontend/src/composables/useGameLoop.ts:154`

After type-guard checks pass, the code casts `tower as Tower` without verifying all required interface properties exist. If the backend or game engine emits a partial tower object, downstream operations in `CombatSystem` will access `undefined` properties.

**Fix:** Use a Zod schema or explicit property checks before the cast.

---

### FE-07 — `useSessionSync` does not guard against duplicate `WAVE_END` emissions
**Severity: LOW**  
**File:** `frontend/src/composables/useSessionSync.ts:117-177`

If the engine emits `WAVE_END` twice for the same wave, the second call syncs identical data to the backend without deduplication. This creates redundant PATCH requests and could cause confusing session-state records.

**Fix:** Track `lastSyncedWave` and skip the sync if `job.snapshot.wave === lastSyncedWave`.

---

### FE-08 — No empty-state element for zero-entry leaderboard
**Severity: LOW**  
**File:** `frontend/src/views/LeaderboardView.vue:87-89`

The "no records" message is placed inside `<tbody>` as raw text rather than inside a `<tr><td>` element. Some browsers may misrender this, causing layout issues.

**Fix:** Wrap the empty-state text in `<tr><td colspan="5">No records yet</td></tr>`.

---

### FE-09 — Announce `rAF` callback runs after component unmount
**Severity: LOW**  
**File:** `frontend/src/views/GameView.vue:39-44`

The `announce` helper resets `liveMessage` then schedules a `requestAnimationFrame` to set it. If the component unmounts during the frame delay, the callback still writes to the ref. Vue handles this safely, but it is an anti-pattern that can produce hard-to-trace bugs if the pattern is copied elsewhere.

**Fix:** Cancel the rAF in `onUnmounted`, or use `nextTick` instead of rAF.

---

### FE-10 — Retry on engine error may accumulate orphaned event listeners
**Severity: LOW**  
**File:** `frontend/src/views/GameView.vue:185-189`

If the engine boot fails mid-initialization, calling `retry()` invokes `boot()` again without guaranteeing cleanup of listeners from the failed attempt. Repeated retries accumulate listeners that each respond to engine events.

**Fix:** Call the engine teardown/cleanup function unconditionally before each `boot()` call in `retry()`.

---

### FE-11 — Tower bar shows no in-game tooltip for tower descriptions
**Severity: LOW** (UX)  
**File:** `frontend/src/components/game/TowerBar.vue:82-83`

Tower buttons use the native HTML `title` attribute for descriptions. Native browser tooltips are invisible in most dark-themed UIs and unreachable via keyboard.

**Fix:** Add a custom CSS tooltip (`:hover` + `::after`, or a Vue `v-tooltip` directive) visible in the game's dark theme.

---

## 5. Summary Table

### By Severity

| ID | Area | Severity | Issue |
|----|------|----------|-------|
| SEC-01 | Security | **CRITICAL** | Secrets committed to repo (.env) |
| SEC-02 | Security | **HIGH** | JWT token returned in JSON body |
| SEC-03 | Security | **HIGH** | Logout credential mode bypasses token revocation |
| SEC-04 | Security | **HIGH** | Rate-limit key extraction undocumented for production |
| BE-01 | Backend | **HIGH** | `kill_cap` default derived from user input (anti-cheat bypass) |
| BE-02 | Backend | **HIGH** | `waves_survived` validation skips zero-wave sessions |
| BE-05 | Backend | **HIGH** | Missing index on `leaderboard_entries.session_id` |
| SEC-05 | Security | **MEDIUM** | Unauthenticated leaderboard exposes all usernames |
| BE-03 | Backend | **MEDIUM** | `POST /api/leaderboard` has no `response_model` |
| BE-04 | Backend | **MEDIUM** | Idempotency path uses request values instead of original session values |
| BE-06 | Backend | **MEDIUM** | No `pool_recycle` on SQLAlchemy engine |
| BE-07 | Backend | **MEDIUM** | Janitor DB session not in context manager |
| BE-08 | Backend | **MEDIUM** | Missing index on `leaderboard_entries.created_at` |
| BE-09 | Backend | **MEDIUM** | Cascade delete silently removes all user scores |
| FE-01 | Frontend | **MEDIUM** | Silent failure when level is not found |
| FE-02 | Frontend | **MEDIUM** | FourierPanel sliders not reset between boss encounters |
| FE-03 | Frontend | **MEDIUM** | BuildPanel `localParams` stale state on rapid tower switching |
| FE-04 | Frontend | **MEDIUM** | BuffCardPanel focus restoration fails on disabled elements |
| FE-05 | Frontend | **MEDIUM** | IntegralPanel canvas not DPR-aware (blurry on HiDPI) |
| FE-06 | Frontend | **MEDIUM** | Missing null check for tower object in useGameLoop |
| BE-10 | Backend | **LOW** | Missing index on `login_attempts.locked_until` |
| BE-11 | Backend | **LOW** | CORS origin validation accepts bare `https://` |
| SEC-06 | Security | **LOW** | No password change / reset endpoint |
| SEC-07 | Security | **LOW** | Token probe interval too long (60 s) |
| FE-07 | Frontend | **LOW** | Duplicate `WAVE_END` not deduplicated in useSessionSync |
| FE-08 | Frontend | **LOW** | Leaderboard empty-state markup invalid inside `<tbody>` |
| FE-09 | Frontend | **LOW** | Announce rAF runs after component unmount |
| FE-10 | Frontend | **LOW** | Retry on engine error may accumulate orphaned listeners |
| FE-11 | Frontend | **LOW** | Tower descriptions not visible in dark-themed UI |

### Counts

| Severity | Security | Backend | Frontend | Total |
|----------|----------|---------|----------|-------|
| Critical | 1 | 0 | 0 | **1** |
| High | 3 | 3 | 0 | **6** |
| Medium | 1 | 6 | 6 | **13** |
| Low | 2 | 2 | 5 | **9** |
| **Total** | **7** | **11** | **11** | **29** |

---

*Report generated 2026-04-24. Based on static analysis of the `main` branch at commit `ac7a52d`.*
