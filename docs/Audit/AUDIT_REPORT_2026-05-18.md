# Math Defense -- Comprehensive Bug & Security Audit Report

**Date**: 2026-05-18
**Scope**: Full-stack audit (backend, frontend, infrastructure, database, API integration)
**Methodology**: 6 parallel agent audits covering backend security, backend logic, frontend security/bugs, infrastructure/DevOps, database/migrations, and API design/integration

---

## Executive Summary

The codebase demonstrates **high security maturity** for an educational application. Many standard vulnerability classes have been proactively addressed with tracked tickets (B-SEC-\*, B-BUG-\*, F-BUG-\*, C-\*). Defense-in-depth is evident throughout: HTTP-only cookies, CSRF double-submit, server-side score recomputation, replay verification, constant-time comparisons, and exhaustive rate limiting.

That said, **88 total findings** were identified across all domains. After deduplication, the consolidated list below contains **72 unique findings**.

| Severity | Count |
|----------|-------|
| Critical | 2     |
| High     | 10    |
| Medium   | 18    |
| Low      | 23    |
| Info     | 19    |

---

## Table of Contents

1. [Critical Findings](#1-critical-findings)
2. [High-Severity Findings](#2-high-severity-findings)
3. [Medium-Severity Findings](#3-medium-severity-findings)
4. [Low-Severity Findings](#4-low-severity-findings)
5. [Informational / Positive Observations](#5-informational--positive-observations)
6. [Prioritized Remediation Roadmap](#6-prioritized-remediation-roadmap)

---

## 1. Critical Findings

### C-01: `audit_logs` Table Has No Alembic Migration

- **Domain**: Database
- **Files**: `backend/app/models/audit_log.py`, `backend/alembic/versions/` (absent)
- **Description**: The `AuditLog` model is actively used by `infrastructure/audit_logger.py`, but no Alembic migration creates the table. Either the table doesn't exist (and every `record_audit_event` call silently fails via the swallowed exception), or it was created outside Alembic (schema drift). Additionally, the model uses legacy `Column()` syntax (not `Mapped`), `user_id` has no FK to `users.id`, and there are no indexes for querying.
- **Impact**: The entire security audit trail is either non-functional or untracked. Incident response and forensics are impossible.
- **Fix**: Create an Alembic migration for `audit_logs` with proper FK, indexes on `(user_id, created_at)` and `(event_type, created_at)`, and rewrite the model to use `Mapped` + `mapped_column`.

### C-02: Production Secrets Present on Disk (`.env`)

- **Domain**: Backend Security
- **File**: `.env` (lines 1-7)
- **Description**: The `.env` file contains a live `SECRET_KEY`, `DATABASE_URL` with password, and `POSTGRES_PASSWORD`. While `.env` is in `.gitignore`, if it was ever committed (even briefly), the secrets are in git history permanently. Anyone with workstation access can read these.
- **Impact**: A leaked `SECRET_KEY` allows forging arbitrary JWTs (including admin-role tokens) for full system takeover. Leaked DB credentials grant direct database access.
- **Fix**: (1) Run `git log --all --diff-filter=A -- .env` to verify these were never committed. (2) Rotate `SECRET_KEY` and `POSTGRES_PASSWORD` as a precaution. (3) Consider a secrets manager for production.

---

## 2. High-Severity Findings

### H-01: TOTP Secret Stored in Plaintext in Database

- **Domain**: Backend Security
- **Files**: `backend/app/models/user.py:25`, `backend/app/infrastructure/persistence/user_repository.py:61`
- **Description**: `totp_secret` is a plain `String(64)` column. A database compromise exposes every MFA-enabled user's TOTP seed, allowing attackers to generate valid codes and fully bypass MFA.
- **Fix**: Encrypt `totp_secret` at rest using application-level Fernet encryption keyed from a separate secret.

### H-02: MFA Setup Endpoint Requires No Re-authentication

- **Domain**: Backend Security
- **Files**: `backend/app/routers/auth.py:337-346`, `backend/app/application/auth_service.py:391-408`
- **Description**: `/api/auth/mfa/setup` returns the provisioning URI (embedding the TOTP secret) to any authenticated user without re-entering their password. A stolen session cookie allows an attacker to enroll their own authenticator device, then confirm MFA -- taking control of the victim's MFA.
- **Fix**: Require password re-verification on both `/mfa/setup` and `/mfa/confirm`, matching `/mfa/disable` which already requires `current_password`.

### H-03: In-Memory Login Throttle Dict Is Unbounded (DoS Vector)

- **Domain**: Backend Security
- **File**: `backend/app/limiter.py:106-129`
- **Description**: `_login_email_history` grows with one entry per unique email. A distributed attack spraying millions of unique fake emails within the 60-second window exhausts server memory (OOM crash).
- **Fix**: Add LRU eviction (e.g., max 100K entries) or move per-email throttling to Redis/DB.

### H-04: No Database Backup Strategy

- **Domain**: Infrastructure
- **File**: `docker-compose.prod.yml` (postgres service)
- **Description**: PostgreSQL data lives in a named Docker volume. No backup cron, no `pg_dump` script, no WAL archiving. A single `docker compose down -v` or host disk failure causes total, irrecoverable data loss.
- **Fix**: Implement `pg_dump` on a schedule to external storage, or configure WAL archiving for PITR.

### H-05: Frontend Admin Service Expects Arrays, Backend Returns Paginated Objects

- **Domain**: API Integration
- **Files**: `frontend/src/services/adminService.ts:20-28`, `backend/app/routers/admin.py:17-56`
- **Description**: `getTeachers()`, `getStudents()`, `getClasses()` declare return types as flat arrays (`UserSummary[]`, `ClassSummary[]`), but the backend returns `{ items: [...], total: int }`. The admin dashboard will fail to render -- `.map()`, `.filter()`, `.length` will break on an object.
- **Fix**: Update frontend types to `{ items: T[]; total: number }` and unwrap in the service layer.

### H-06: Missing FK Index on `game_sessions.challenge_id`

- **Domain**: Database
- **File**: `backend/app/models/game_session.py:30-32`
- **Description**: `challenge_id` is a FK to `challenges.id` but has no index. Challenge-filtered queries and `ON DELETE SET NULL` cascades require full table scans.
- **Fix**: Add `Index("ix_game_sessions_challenge_id", "challenge_id")` and a migration.

### H-07: `users.updated_at` Uses Python-Only `onupdate` -- No DB Trigger

- **Domain**: Database
- **Files**: `backend/app/models/user.py:36-40`, `backend/app/models/talent.py:25`, `backend/app/models/competency_state.py:31`
- **Description**: `onupdate=lambda: datetime.now(UTC)` fires only through the ORM. Raw SQL, Alembic data migrations, or manual psql fixes leave `updated_at` stale.
- **Fix**: Add a PostgreSQL trigger or use `server_onupdate=text("CURRENT_TIMESTAMP")`.

### H-08: Unbounded Query -- `leaderboard_repository.get_user_history`

- **Domain**: Database / Backend Logic
- **File**: `backend/app/infrastructure/persistence/leaderboard_repository.py:294-308`
- **Description**: Fetches ALL leaderboard entries for a user with no LIMIT. PB computation loads the full history into memory, reverses it, computes flags, then slices. Power users cause memory spikes.
- **Fix**: Add a LIMIT parameter or compute PB flags in SQL with a window function.

### H-09: Unbounded Query -- `user_repository.find_by_role`

- **Domain**: Database
- **File**: `backend/app/infrastructure/persistence/user_repository.py:35-37`
- **Description**: Fetches ALL users with a given role. `find_by_role_paginated` exists but `find_by_role` is also exposed and could load thousands of students.
- **Fix**: Remove `find_by_role` or add a LIMIT guard; route callers through the paginated version.

### H-10: `game_sessions` Model Missing Explicit `nullable=False` on Required Columns

- **Domain**: Database
- **Files**: `backend/app/models/game_session.py:41-50`
- **Description**: `status`, `current_wave`, `gold`, `hp`, `score` have ORM `default` values but don't declare `nullable=False` in `mapped_column`. The migration constrains them, but the model doesn't, meaning ORM-level validation doesn't catch missing fields.
- **Fix**: Add explicit `nullable=False` to these columns in the model.

---

## 3. Medium-Severity Findings

### M-01: Missing FOR UPDATE Lock on `update_session` -- Score Monotonicity TOCTOU

- **Domain**: Backend Logic
- **File**: `backend/app/application/session_service.py:215`
- **Description**: `update_session` reads the session without a row lock. Two concurrent PATCH requests can both pass the "score must not decrease" check against a stale snapshot, allowing a score regression.
- **Fix**: Use `find_by_id_for_update` in `update_session` (as `end_session` already does).

### M-02: Leaderboard Missing V2 `total_score` Field

- **Domain**: Backend Logic
- **Files**: `backend/app/application/session_event_handlers.py:57-66`, `backend/app/domain/leaderboard/aggregate.py`
- **Description**: `SessionCompleted` carries `total_score` but `LeaderboardEntry.create_from_session` never stores it. Rankings use raw integer `score` instead of the V2 floating-point score that includes time/efficiency/health factors.
- **Fix**: Add `total_score` column to leaderboard model and pass through from event.

### M-03: Frontend Sends `gold`/`hp` in PATCH; Backend Uses `extra="forbid"`

- **Domain**: API Integration
- **Files**: `frontend/src/services/sessionLifecycleService.ts:96-104`, `backend/app/schemas/game_session.py:80-99`
- **Description**: Every wave-end PATCH includes `gold` and `hp` keys, but `SessionUpdate` rejects unknown fields. This should cause 422 errors on every wave snapshot (unless values happen to be `undefined` at runtime).
- **Fix**: Remove `gold` and `hp` from `pushWaveSnapshot()`.

### M-04: Self-Service Teacher Role Registration

- **Domain**: Frontend / Backend Security
- **Files**: `frontend/src/views/AuthView.vue:173-177`, `backend/app/schemas/auth.py:36-40`
- **Description**: The registration form exposes a Student/Teacher dropdown. The schema rejects `"admin"` but accepts `"teacher"` without additional verification (admin approval, email domain check). The application-layer `register()` method also doesn't guard against `role="admin"` -- protection relies solely on the Pydantic schema.
- **Fix**: Either (a) require admin approval for teacher accounts, (b) validate against approved email domains, or (c) add an application-layer guard rejecting `role="admin"`.

### M-05: Account Enumeration via Registration

- **Domain**: Backend Security
- **File**: `backend/app/application/auth_service.py:128-135`
- **Description**: Returns `"Email already registered"` on duplicate email (acknowledged as B-SEC-17 trade-off). Allows automated enumeration of institutional email addresses.
- **Fix**: Return generic success and send "you already have an account" email to existing address (if moving to higher-security deployment).

### M-06: CSRF Implicitly Skipped on `/api/auth/mfa/challenge`

- **Domain**: Backend Security
- **File**: `backend/app/middleware/csrf.py:33`
- **Description**: This endpoint isn't in the exempt list but passes because no auth cookie exists during the MFA challenge phase. Safe by accident but fragile.
- **Fix**: Add explicit exemption with inline comment.

### M-07: WebSocket Spectate Re-auth Uses Stale Handshake Cookies

- **Domain**: Backend Security
- **File**: `backend/app/routers/replay.py:194-212`
- **Description**: WS cookies are captured at handshake and never update. A revoked user can spectate for up to 60 more seconds. Acceptable for educational context but worth documenting.
- **Fix**: Document as known limitation. For stricter requirements, pass fresh tokens in WS messages.

### M-08: Unauthenticated Global Leaderboard Exposes Player Names

- **Domain**: Backend Security / API Design
- **File**: `backend/app/routers/leaderboard.py:29-65`
- **Description**: `GET /api/leaderboard` uses optional auth, exposing player names to unauthenticated users. In an educational context, this could expose student identities.
- **Fix**: Require auth or anonymize names for unauthenticated viewers.

### M-09: `server_tokens` Not Disabled in `nginx-tls.conf`

- **Domain**: Infrastructure
- **File**: `nginx-tls.conf:40-41`
- **Description**: Production TLS config doesn't include `server_tokens off;`, leaking the nginx version in response headers.
- **Fix**: Add `server_tokens off;` to both server blocks.

### M-10: Missing TLS Session Cache and OCSP Stapling

- **Domain**: Infrastructure
- **File**: `nginx-tls.conf:46-50`
- **Description**: No `ssl_session_cache`, no `ssl_session_tickets off`, no OCSP stapling configured. Reduces forward secrecy and increases handshake latency.
- **Fix**: Add standard TLS hardening directives.

### M-11: No Dependabot / Renovate Configuration

- **Domain**: Infrastructure
- **File**: `.github/` (missing `dependabot.yml`)
- **Description**: CI runs `pip-audit` and `npm audit` on PRs, but no automated mechanism opens PRs for new security patches between active development.
- **Fix**: Add `.github/dependabot.yml` for pip, npm, and github-actions ecosystems.

### M-12: No Docker Resource Limits in Production

- **Domain**: Infrastructure
- **Files**: `docker-compose.yml`, `docker-compose.prod.yml`
- **Description**: No `mem_limit`, `cpus`, or `deploy.resources` on any service. A runaway process can OOM the host.
- **Fix**: Add resource limits to production compose.

### M-13: PostgreSQL Single Superuser Account (No Least-Privilege)

- **Domain**: Infrastructure
- **Files**: `docker-compose.yml:6-8`, `.env.example:24`
- **Description**: The same `mathdefense` user handles both Alembic migrations and runtime queries with full DDL+DML privileges.
- **Fix**: Create separate `mathdefense_admin` (DDL) and `mathdefense_app` (DML-only) roles.

### M-14: CI Uses `mymindstorm/setup-emsdk@v14` Without SHA Pin

- **Domain**: Infrastructure
- **File**: `.github/workflows/ci.yml:71`
- **Description**: First-party actions are SHA-pinned, but this third-party action uses a mutable tag -- supply chain risk.
- **Fix**: Pin to a specific commit SHA.

### M-15: Python Domain Constraints Not Enforced at DB Level

- **Domain**: Database
- **Files**: `backend/app/domain/constraints.py`, `backend/app/models/game_session.py`
- **Description**: `score`, `kills`, `waves_survived`, `hp`, `gold` have Python-side bounds but no DB CHECK constraints. Only `star_rating` has a CHECK.
- **Fix**: Add `CHECK (score >= 0)`, `CHECK (kills >= 0)`, etc.

### M-16: `competency_state.alpha/beta` No CHECK for Positive Values

- **Domain**: Database
- **File**: `backend/app/models/competency_state.py:25-26`
- **Description**: Beta distribution parameters must be > 0. No DB constraint enforces this; a zero or negative value produces NaN/infinity.
- **Fix**: Add `CHECK (alpha > 0)` and `CHECK (beta > 0)`.

### M-17: `ia_recent_accuracy` No CHECK for [0, 1] Range

- **Domain**: Database
- **File**: `backend/app/models/user.py:32`
- **Description**: Float representing a fraction has no DB constraint. A bug could write values outside [0, 1].
- **Fix**: Add `CHECK (ia_recent_accuracy BETWEEN 0.0 AND 1.0)`.

### M-18: Unbounded Queries in Multiple Repositories

- **Domain**: Database
- **Files**: `class_repository.py:40-42` (`find_all`), `territory_repository.py:71-73` (`find_all_activities`), `session_event_repository.py:65-79` (`list_for_session`)
- **Description**: Multiple repository methods load all rows with no LIMIT. `find_all_paginated` alternatives exist for some but the unbounded versions are still exposed.
- **Fix**: Remove or deprecate unbounded methods; route callers through paginated versions.

---

## 4. Low-Severity Findings

### L-01: `override_total_score` Bypasses All Clamping

- **File**: `backend/app/domain/session/aggregate.py:330-337`
- **Description**: Accepts any float without bounds checking. A WASM bug could store negative or astronomically large values.
- **Fix**: Add sanity clamp: `min(max(0.0, value), TOTAL_SCORE_MAX)`.

### L-02: `_verify_score` Accepts Tampered Timing When Events Are Missing

- **File**: `backend/app/application/session_service.py:567-692`
- **Description**: When no replay events exist, client-submitted timing is used as-is for score recomputation. Documented as accepted trade-off, but could be exploited.
- **Fix**: Force `total_score = 0` when no replay events are available and `waves_survived = 0`.

### L-03: `attach_reflection` Missing FOR UPDATE Lock

- **File**: `backend/app/application/session_service.py:421-444`
- **Description**: Two concurrent reflection submissions can both see `reflection_text = None`, and the `overwritten` flag will incorrectly report `False` for the second writer.
- **Fix**: Use `find_by_id_for_update`.

### L-04: `_stale_cutoff_hours` Mutable Class State

- **File**: `backend/app/domain/session/aggregate.py:26-34`
- **Description**: Class-level attribute mutated at runtime. Safe in production (set once at startup) but not thread-safe for parallel tests.

### L-05: `territory_repository` Advisory Lock Missing Dialect Check

- **File**: `backend/app/infrastructure/persistence/territory_repository.py:185-200`
- **Description**: Unconditionally calls `pg_advisory_xact_lock()` without checking the DB dialect, unlike other advisory lock callsites.
- **Fix**: Add `if self._db.get_bind().dialect.name == "postgresql"` guard.

### L-06: Season Point Multiplier Timing Edge Case

- **File**: `backend/app/application/achievement_service.py:100-106`
- **Description**: Multiplier is applied based on wall-clock time at achievement-check, not session-completion time. Could misapply at season boundaries.

### L-07: v-html in ManualModal with Unvalidated URL Schemes

- **File**: `frontend/src/components/common/ManualModal.vue:136`, `frontend/src/utils/simpleMarkdown.ts`
- **Description**: Link regex doesn't validate URL scheme. A malicious markdown file could use `javascript:` URLs. Mitigated by first-party content authoring.
- **Fix**: Add URL scheme allowlist to link generation.

### L-08: WASM Singleton Scratch Buffers Not Thread-Safe

- **File**: `frontend/src/math/WasmBridge.ts:392-395, 545-558`
- **Description**: Shared scratch buffers would race if Web Workers were introduced. Safe for single-threaded JS.

### L-09: Expression Parser Recursion Depth Unbounded

- **File**: `frontend/src/math/expressionParser.ts`
- **Description**: Recursive `evalNode()` has no depth limit. The 200-char input cap constrains practical nesting. Worst case crashes the player's own browser tab.

### L-10: Token Probe 15s Interval Per Tab

- **File**: `frontend/src/composables/useTokenProbe.ts`
- **Description**: Session heartbeat every 15s per open tab. Many tabs on a shared computer create noticeable backend load.

### L-11: Frontend `PersonalHistoryResponse` Missing `total` Field

- **File**: `frontend/src/services/leaderboardService.ts:29-31`
- **Description**: Backend returns `total: int` for pagination but frontend type omits it.

### L-12: Frontend `RankingEntry.student_id` Should Be Nullable

- **File**: `frontend/src/services/territoryService.ts:44`
- **Description**: Backend returns `null` for non-owner viewers but frontend type is `string` (not nullable).

### L-13: Frontend `ActivityInfo` Missing `settled_at`/`settled_by` Fields

- **File**: `frontend/src/services/territoryService.ts:3-11`
- **Description**: Backend sends these fields but frontend type omits them.

### L-14: Email Verification Token in GET Query Parameter

- **File**: `backend/app/routers/auth.py:314-322`
- **Description**: Standard pattern but tokens can appear in server logs and browser history. Mitigated by one-time use and 24h expiry.

### L-15: `refresh_tokens.expires_at` Index Not Declared in Model

- **File**: `backend/app/models/refresh_token.py`
- **Description**: Migration creates the index but model doesn't declare `index=True`. Autogenerate may suggest dropping it.

### L-16: `initial_answer` Column Drift -- Model Says NOT NULL, Migration Says Nullable

- **File**: `backend/app/models/game_session.py:35`, migration `a1b2c3d4e5f6:20`
- **Description**: Model declares `nullable=False` but migration added it as `nullable=True`. A NULL value would crash ORM load.

### L-17: No Rate Limit on `/health` Endpoint

- **File**: `backend/app/main.py:221-228`
- **Description**: Trivial endpoints with no rate limiting could be used for DDoS amplification.

### L-18: `.dockerignore` Gaps

- **File**: `.dockerignore`
- **Description**: Missing exclusions for `backend/postgres`, `*.md`, `.github`, `docs/` inflate build context.

### L-19: HSTS `preload` Set Without Domain Verification

- **File**: `security-headers.conf:5`
- **Description**: `preload` directive signals for HSTS preload list submission. Rolling back to HTTP becomes extremely difficult if submitted. For a student project, removing `preload` is safer.

### L-20: `nginx.conf` Has Dead Code After `return 301`

- **File**: `nginx.conf:25-121`
- **Description**: Redirect fires before any location blocks are reached. All config after line 25 is dead code.

### L-21: Duplicate Index on `territory_occupations.slot_id`

- **File**: `backend/app/models/territory.py:59,63`
- **Description**: Unique constraint already creates a B-tree index; explicit index is redundant.

### L-22: Redundant Unique Constraint on `study_enrollments`

- **File**: `backend/app/models/study.py:39-41`
- **Description**: Composite PK `(user_id, study_id)` already enforces uniqueness.

### L-23: Connection Pool Config Is Static

- **File**: `backend/app/db/database.py:5-11`
- **Description**: `pool_size=10, max_overflow=20` hardcoded. Multi-worker deployment could exhaust small DB instances.
- **Fix**: Make configurable via settings.

---

## 5. Informational / Positive Observations

The following areas demonstrate strong security practices:

| Area | Details |
|------|---------|
| **JWT Security** | Algorithm pinning, `iss`/`aud` claims, JTI revocation, `pv` (password version) claim, algorithm confusion explicitly mitigated |
| **Refresh Token Rotation** | Hash-only storage, one-time use, reuse detection revokes entire family, FOR UPDATE locking |
| **CSRF Protection** | Double-submit cookie with `secrets.compare_digest`, mandatory in production |
| **Bcrypt** | 12 rounds, 72-byte limit enforced, constant-time dummy hash on user-not-found |
| **Password Strength** | zxcvbn in application layer (not Pydantic -- avoids DoS vector) |
| **SQL Injection** | All queries via ORM with parameterized `text()` calls |
| **Cookie Security** | `httponly`, `secure`, `samesite=lax`, path-scoped, validated in config |
| **Auth Token Storage** | HTTP-only cookies (not localStorage), documented at top of `api.ts` |
| **Open Redirect Protection** | `AuthView.vue` validates `?next=` against origin, rejects backslashes (F-BUG-10 fix) |
| **Anti-Cheat** | Server-side score recomputation, replay verification, per-level caps, WASM bit-exact parity |
| **Error Handling** | Global catch-all returns fixed message, never leaks stack traces, `ctx.error` stripped from validation errors |
| **CSV Export** | Formula injection prevention with `_csv_safe()` |
| **Container Hardening** | `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges`, `tmpfs` for writable paths in prod |
| **Non-Root Containers** | Backend uses `USER app`, frontend uses `nginx-unprivileged` |
| **Dev Port Binding** | All dev ports bound to `127.0.0.1` only |
| **CI Action Pinning** | First-party GitHub Actions SHA-pinned |
| **Dependency Auditing** | `pip-audit` and `npm audit` in CI on every PR |
| **X-Forwarded-For** | Nginx overwrites XFF; backend right-to-left walk with trusted proxy validation |
| **Security Headers** | HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP, CORP, CSP |

---

## 6. Prioritized Remediation Roadmap

### Immediate (This Sprint)

| # | Finding | Effort |
|---|---------|--------|
| C-01 | Create `audit_logs` Alembic migration | 1-2 hours |
| C-02 | Verify `.env` never committed; rotate secrets | 30 min |
| H-05 | Fix admin service frontend types (paginated) | 30 min |
| M-03 | Remove `gold`/`hp` from wave PATCH payload | 15 min |
| H-06 | Add index on `game_sessions.challenge_id` | 30 min |
| H-10 | Add `nullable=False` to required game_session columns | 30 min |

### Short-Term (Next 2 Sprints)

| # | Finding | Effort |
|---|---------|--------|
| H-02 | Require password re-auth on MFA setup/confirm | 2-3 hours |
| H-01 | Encrypt TOTP secrets at rest | 3-4 hours |
| H-03 | Add LRU cap to `_login_email_history` | 1 hour |
| H-04 | Implement `pg_dump` backup schedule | 2-3 hours |
| M-01 | Add FOR UPDATE to `update_session` | 30 min |
| M-09 | Add `server_tokens off` to nginx-tls.conf | 15 min |
| M-10 | Add TLS session cache + OCSP stapling | 30 min |
| M-14 | SHA-pin `setup-emsdk` action | 15 min |
| M-15 | Add CHECK constraints for domain invariants | 1-2 hours |

### Medium-Term (Backlog)

| # | Finding | Effort |
|---|---------|--------|
| H-07 | Add DB trigger for `updated_at` | 1-2 hours |
| H-08/H-09 | Fix/remove unbounded queries | 2-3 hours |
| M-02 | Add `total_score` to leaderboard | 2-3 hours |
| M-04 | Add teacher role verification flow | 3-4 hours |
| M-11 | Add Dependabot config | 30 min |
| M-12 | Add Docker resource limits | 30 min |
| M-13 | Create least-privilege DB roles | 1-2 hours |
| M-16/M-17 | Add CHECK constraints for competency/accuracy | 30 min |
| M-18 | Deprecate unbounded repository methods | 1-2 hours |
| L-* | Address low-severity items as encountered | Ongoing |

---

*Report generated by 6 parallel audit agents examining backend security, backend logic, frontend security/bugs, infrastructure/DevOps, database/migrations, and API design/integration.*
