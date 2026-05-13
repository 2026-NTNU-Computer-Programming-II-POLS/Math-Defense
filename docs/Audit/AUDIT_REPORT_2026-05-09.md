# Math Defense — Multi-Agent Audit Report

**Date:** 2026-05-09
**Scope:** `backend/` (FastAPI + PostgreSQL + DDD), `frontend/` (Vue 3 + TS + Pinia + WASM), `shared/` types.
**Method:** Five parallel agents — backend security, backend systemic bugs, backend architecture, frontend security/bugs, frontend architecture — each reading source directly. Findings are de-duplicated and cross-linked below.

---

## Executive Summary

Overall the codebase is well-organised: DDD layering on the backend is mostly clean, JWT/CSRF/cookie posture is solid, password handling and account lockout are correct, and the frontend has a real engine/system/domain split. The serious problems concentrate in three places:

1. **Session lifecycle invariants under concurrency** — read-modify-write paths in talent allocation, Beta-posterior assessment, and achievements lack user-level locks; the resulting lost-update / double-grant issues silently corrupt user-facing data.
2. **MFA / refresh-token revocation gaps** — a successful MFA challenge does not denylist the challenge JWT, password change does not revoke refresh tokens, and refresh-token reuse does not invalidate the family. Together they significantly weaken account-recovery semantics after credential compromise.
3. **Trust boundary between client-computed game state and server-recorded state** — the frontend submits `score` and `total_score` it computed itself, the backend caps but does not derive `kills`/`waves_survived` from the replay log, and a v2 session silently degrades to v1's wider tolerance when WASM fails to load. The replay-event endpoint also accepts events on completed sessions.

Architectural drift is real but localised: a god `SessionApplicationService`, a god `gameStore`, a god `useGameLoop`, and Vue views that reach past `services/` into `domain/` for level generation. None block product progress, but the next refactor is going to keep paying tax on these until they are split.

---

## Severity Heatmap

| Severity      | Backend Sec | Backend Bugs | Backend Arch | Frontend Sec/Bugs | Frontend Arch |
| ------------- | :---------: | :----------: | :----------: | :---------------: | :-----------: |
| Critical      |             |      2       |              |                   |               |
| High          |     2       |      5       |      6       |        1          |       6       |
| Medium        |     5       |     10       |      8       |        7          |       4       |
| Low           |     8       |      4       |      6       |        9          |       5       |
| Info          |     5       |              |              |                   |               |

---

## Top-10 Priorities (by impact × ease)

1. **B-SEC-1 / B-SEC-2** — Revoke refresh tokens on password-change and detect refresh-reuse. *(2-line fix each.)*
2. **B-BUG-1 (Critical)** — Denylist `mfa_token` JTI on successful MFA challenge. *(Reuses existing denylist machinery.)*
3. **B-BUG-2 (Critical)** — Talent-allocation race: anchor `FOR UPDATE` to the `users` row.
4. **B-BUG-6 (High)** — Beta-posterior lost-update: same fix pattern (user row lock or atomic SQL).
5. **B-BUG-7 (High)** — Reject replay-event appends on non-ACTIVE sessions; require strictly increasing `seq`.
6. **B-BUG-5 (High)** — Close DB session before the spectator WS streaming loop.
7. **B-BUG-4 (High)** — Switch `leaderboard_entries.challenge_id` FK to `ON DELETE CASCADE` (or tag with `was_challenge`).
8. **B-SEC-3 + B-BUG-15** — Add Origin check on the spectate WebSocket; fail closed when WASM is not loaded for v2 verification.
9. **F-BUG-1** — Delete the dead `<script src="/wasm/math_engine.js">` tag in `index.html`.
10. **F-BUG-2** — Replace `new Function(...)` in `expressionParser.ts` with a real expression evaluator.

---

# Part 1 — Backend Security

> Source: full audit by agent A (FastAPI / auth / rate-limiting / WS).

## B-SEC-1 — Refresh-token reuse not detected ⚠️ High
- **File:** `backend/app/application/auth_service.py:234-251`, `infrastructure/persistence/refresh_token_repository.py:28-43`
- A used or revoked refresh token raises `InvalidTokenError` but does not flag the family as compromised. With sliding rotation + 30-day TTL, a stolen refresh cookie stays usable until expiry.
- **Fix:** When `consume()` finds `used=True` or `revoked=True`, treat as compromise and `revoke_all_for_user`. Track `family_id` so only that lineage dies.

## B-SEC-2 — `change_password` does not revoke refresh tokens ⚠️ High
- **File:** `backend/app/application/auth_service.py:255-265`
- `password_version` is bumped (kills access tokens via `pv` claim), but refresh tokens survive — so a password change does not lock an attacker out.
- **Fix:** Call `_refresh_token_repo.revoke_all_for_user(user.id)` inside the same UoW. Same applies in `disable_mfa`.

## B-SEC-3 — Spectate WebSocket has no Origin check (CSWSH) — Medium
- **File:** `backend/app/routers/replay.py:113-188`
- Cookies attach automatically; CSRF middleware exempts WS. Owner-only auth blocks cross-user reads, but a malicious page can still exfiltrate the victim's own session+seed.
- **Fix:** Validate `websocket.headers.get("origin")` against `settings.cors_origins` before `accept()`; reject 4403.

## B-SEC-4 — CSRF middleware skips WebSockets entirely — Medium
- **File:** `backend/app/middleware/csrf.py:45-73`
- Combined with B-SEC-3, cookie-bearing WS handshakes are unprotected by both CSRF and Origin. Consider `samesite="strict"` for the auth cookie if the SPA does not need cross-site nav entry.

## B-SEC-5 — Replay event payload size unbounded — Medium
- **File:** `backend/app/schemas/replay.py:15` (constant declared but never used), `:18-28` (no per-payload validator)
- Caps exist on batch (500) and per session (50k), but a single event payload is unbounded → ~50 GB per session attainable.
- **Fix:** Add `field_validator("payload")` enforcing `len(json.dumps(v)) <= _PAYLOAD_MAX_BYTES` and add a per-user/day quota.

## B-SEC-6 — `disable_mfa` requires only password (no TOTP step-up) — Medium
- **File:** `backend/app/application/auth_service.py:359-373`
- Once an attacker clears MFA on a single login, password alone disables MFA.
- **Fix:** Require a fresh TOTP code in `DisableMFARequest`; email "MFA was disabled" notification.

## B-SEC-7 — Email-verification tokens stored in plaintext — Medium
- **File:** `backend/app/infrastructure/persistence/email_verification_repository.py:16-25`
- Refresh tokens and JWT JTIs are hashed; verification tokens are not.
- **Fix:** Store SHA-256 hash; same pattern as refresh tokens.

## B-SEC-8 — Authenticated read of any challenge by ID (mild IDOR) — Low
- **File:** `backend/app/routers/challenge.py:93-102`
- Any logged-in user can fetch any challenge if they guess the UUID. Not enumerable in practice; document or gate.

## B-SEC-9 — Audit log records full email cleartext on every login attempt — Low
- **File:** `backend/app/routers/auth.py:102, 123, 133, 146`
- Hash or partially redact emails in the audit `details` blob; keep `user_id` for correlation.

## B-SEC-10 — Admin can disable themselves / last admin — Low
- **File:** `backend/app/routers/admin.py:59-69`; `application/admin_service.py:50-60`
- Reject `user_id == requester.id` and "last active admin" cases.

## B-SEC-11 — Demo seed bypasses zxcvbn — Low
- **File:** `backend/app/seed.py:33-67`
- Reuse `_validate_password_strength` even in seed; refuse to seed when `frontend_url` looks production-like.

## B-SEC-12 — Rate limits per-IP only — Low / Medium
- **File:** `backend/app/limiter.py:22-37`
- NAT'd classrooms share one bucket; distributed credential stuffing dodges per-IP cap. Per-account lockout already covers the credential-stuffing case; layer email-per-minute on `/login`.

## B-SEC-13 — Multi-hop proxy `X-Forwarded-For` parsing trusts leftmost — Low
- **File:** `backend/app/limiter.py:9-19, 29-34`
- Walk XFF right-to-left, stripping trusted proxies, and use the first untrusted entry.

## B-SEC-14 — Spectator hub does not re-validate auth per-frame — Low
- **File:** `backend/app/routers/replay.py:148-186`

## B-SEC-15 — `WASM_ENGINE_PATH` not validated — Info
- **File:** `backend/app/infrastructure/wasm_runtime.py:33-36, 49-59`

## B-SEC-16 — `RequestValidationError` handler may surface internal exception text — Info
- **File:** `backend/app/main.py:136-159`

## B-SEC-17 — `/register` enumerates accounts via "Email already registered" — Low
- **File:** `backend/app/application/auth_service.py:108-109, 119, 125`

## B-SEC-18 — `SessionCreate.path_config` accepts deeply-nested JSON — Low
- **File:** `backend/app/schemas/game_session.py:23, 49-54`
- Mirror `_check_depth(v, max_depth=8)` from `schemas/territory.py`.

## B-SEC-19 — `User-Agent` stored uncapped in audit log — Info

## B-SEC-20 — Logout swallows token-revocation errors silently — Info

### Already mitigated (verified)

- JWT `alg`/`iss`/`aud` pinned and verified at decode.
- CSRF compare uses `secrets.compare_digest`.
- Bcrypt 72-byte rejection on register/login.
- Account lockout via atomic UPSERT row-lock.
- Login user-enumeration timing handled with dummy hash.
- No raw SQL injection — all `text()` calls are parametrised.
- Hardcoded secrets / default DB password rejected at boot.
- Cookie flags: httponly, secure, samesite=lax, scoped.
- CORS allow-list strictly validated.
- `/docs` only mounted in debug.
- TOTP replay window enforced (90 s).
- Container drops root, migrations serialised via PG advisory lock.
- Dependency versions look current as of audit date — re-run `pip-audit` periodically.

---

# Part 2 — Backend Systemic Bugs

> Source: full audit by agent B (transactions / concurrency / business logic).

## B-BUG-1 — MFA challenge JWT reusable for full TTL ⛔ Critical
- **File:** `app/application/auth_service.py:375-405`
- Challenge token is never denylisted on success. Replay within the 5-min TTL with a fresh TOTP code = full MFA bypass.
- **Fix:** `self._token_denylist.deny(jti, exp)` before issuing access/refresh tokens.

## B-BUG-2 — Talent allocation race lets users overspend points ⛔ Critical
- **File:** `app/application/talent_service.py:92-128`; `infrastructure/persistence/talent_repository.py:21-28`
- `find_by_user_for_update().with_for_update()` locks zero rows when the user has no allocations. Two concurrent allocations both pass the budget check and INSERT in different nodes → `points_available` goes negative.
- **Fix:** `SELECT ... FROM users WHERE id = :u FOR UPDATE` to anchor the lock at user level (or per-user advisory lock).

## B-BUG-3 — Achievement service reports double-unlock when DB dedup fires — High
- **File:** `app/application/achievement_service.py:97-105`; `infrastructure/persistence/achievement_repository.py:31-46`
- `pg_insert(...).on_conflict_do_nothing(...)` is silent; service appends to `newly_unlocked` regardless of `rowcount`. Beta posterior gets double evidence; client toasts twice.
- **Fix:** Inspect `result.rowcount`; only append when `> 0`.

## B-BUG-4 — Soft-deleting a teacher pollutes global leaderboard — High
- **File:** `app/models/leaderboard.py:31-33` (`ondelete="SET NULL"`); `infrastructure/persistence/leaderboard_repository.py:115`
- Cascading user→challenge delete → SET NULL on `leaderboard.challenge_id` → those (potentially uncapped) scores enter the global ranking.
- **Fix:** `ON DELETE CASCADE` on `leaderboard_entries.challenge_id`, or tag rows with `was_challenge BOOLEAN`.

## B-BUG-5 — Spectator WS leaks DB pool connections — High
- **File:** `app/routers/replay.py:113-188`
- `SessionLocal()` is opened on connect and held for the WS lifetime → 11 spectators saturate `pool_size=10`, blocking all HTTP.
- **Fix:** Close the session immediately after auth + history bootstrap; the streaming loop reads from the in-process hub.

## B-BUG-6 — Beta posterior lost-update under READ COMMITTED — High
- **File:** `app/application/assessment_service.py:67-94`; `infrastructure/persistence/competency_state_repository.py:71-99`
- Read-modify-write, no row lock. Two concurrent events on the same `(user, competency)` lose one update.
- **Fix:** Either `FOR UPDATE` or push the increment into SQL via `on_conflict_do_update set_={"alpha": competency_state.alpha + :d, ...}`.

## B-BUG-7 — Replay events accepted on completed sessions — High
- **File:** `app/application/replay_service.py:57-94`
- No status check + no monotonic-`seq` check. Owner can splice forged events into completed runs that get replayed to spectators.
- **Fix:** Raise `SessionNotActiveError` when not ACTIVE; require `seq > current_max`.

## B-BUG-8 — `kills` / `waves_survived` echo client values from `end_session` — Medium
- **File:** `app/application/leaderboard_service.py:91-172`; `app/application/session_service.py:228-253`
- Submit-score path is server-trust, but the values it trusts came from the client through `end_session` and were only capped, not derived.
- **Fix:** Derive from the replay event log at `end_session`.

## B-BUG-9 — `get_db` auto-commits on yield exit — Medium
- **File:** `app/db/database.py:20-29`
- Conflicts with the UoW pattern; mid-state flushes commit on routes that intend not to.
- **Fix:** Drop the auto-commit. All writes go through a UoW.

## B-BUG-10 — Post-commit dispatch silently drops failures — Medium
- **File:** `app/application/session_service.py:287-319`
- Leaderboard / achievement / assessment side effects each get an independent UoW with `except Exception: log.exception(...)`. No retry, no outbox, no flag.
- **Fix:** Outbox table inside the same UoW as the session save; tighten `except Exception` to `except (SQLAlchemyError, DomainError)`.

## B-BUG-11 — `talent_points` award uses pre-loop snapshot of season state — Medium
- **File:** `app/application/achievement_service.py:90-111`
- `now`/`seasons_by_id` are captured before the loop; combined with B-BUG-3 the same achievement can be inserted twice with mismatched season multipliers.

## B-BUG-12 — `find_active_by_user` retry depth = 1 → 500 under triple-concurrent create — Medium
- **File:** `app/infrastructure/persistence/session_repository.py:38-43`; `app/application/session_service.py:102-112`
- Three concurrent `create_session` requests can all collide on retry → `RuntimeError("unreachable")`.
- **Fix:** Per-user `pg_advisory_xact_lock(hashtext(user_id))` at the top of `_create_session_once`, or bounded back-off.

## B-BUG-13 — Pagination order has no tiebreaker — Medium
- **File:** `app/infrastructure/persistence/class_repository.py:47`; `user_repository.py:42`
- Identical `created_at` (bulk seeds) → page duplicates / skips.
- **Fix:** Append `.id` as the final order key.

## B-BUG-14 — `SessionCompleted` events accumulate — Low (latent)
- **File:** `app/domain/session/aggregate.py:121, 338-344`; `app/application/session_service.py:264-268`
- `clear_events()` exists but is never called. Latches the moment any aggregate cache is introduced.

## B-BUG-15 — v2 score verification silently degrades when WASM fails to load — Medium
- **File:** `app/application/session_service.py:486-539`; `app/infrastructure/wasm_runtime.py`
- `is_wasm_loaded() == False` collapses tolerance from 1e-4 to 5e-4 with no audit signal.
- **Fix:** Fail closed on `replay_version >= 2` when WASM is unavailable (503 or downgrade with audit row).

## B-BUG-16 — Study enrollment / probe / affect read-then-insert race — Medium
- **File:** `app/application/study_service.py:53-72, 86-114, 117-164`
- Concurrent submissions either 500 (with unique constraint) or duplicate-row (without).
- **Fix:** `INSERT ... ON CONFLICT DO NOTHING RETURNING ...`; verify uniqueness on `(user_id, study_id, …)`.

## B-BUG-17 — `update_session` has no economic invariants on `gold`/`hp` — Low
- **File:** `app/domain/session/aggregate.py:194-216`
- Client may PATCH `gold=999_999_999` (clamped to GOLD_MAX) and reach the score cap legitimately.
- **Fix:** Source `gold/hp` from the replay event log; reject client-provided values.

## B-BUG-18 — `LoginAttempt.username` lacks DB-level lower() check — Low
- **File:** `app/application/auth_service.py:153-179`
- Regression-by-omission risk: any future writer that forgets `.lower()` splits the attempt counter.

## B-BUG-19 — `update_player_name` / `update_avatar` skip domain validation — Low
- **File:** `app/application/auth_service.py:267-285`
- Direct attribute mutation. Move to aggregate command (`User.rename(name)`).

## B-BUG-20 — `_handle_session_completed` re-reads session unnecessarily — Low
- **File:** `app/application/session_service.py:425-453`
- Add `practice_mode` to `SessionCompleted` event and skip the round-trip.

## B-BUG-21 — Test coverage gaps that hide all of the above — Medium (meta)
- No concurrency tests for talent / Beta posterior / session creation.
- No test for forged events on completed session.
- No test for `mfa_token` reuse.
- No test for teacher cascade → leaderboard pollution.
- No test for spectator WS pool exhaustion.
- **Fix:** `concurrent.futures.ThreadPoolExecutor`-driven tests against the existing PG suite, one per finding.

---

# Part 3 — Backend Architecture / Responsibilities

> Source: full audit by agent C (DDD layering / responsibility clarity).

## B-ARCH-1 — `routers/auth.py` reaches into a SQLAlchemy repository ⚠️ High
- **File:** `backend/app/routers/auth.py:12, 207-228`
- Auth router imports `SqlAlchemySessionRepository` to compute IA-unlock state. Routers must not know infrastructure types.
- **Fix:** Add `AuthApplicationService.get_me_view(user)` (or `SessionApplicationService.has_correct_ia_session`) and call via `build_*_service(db)`.

## B-ARCH-2 — `routers/replay.py` runs raw ORM queries for owner authz ⚠️ High
- **File:** `backend/app/routers/replay.py:25, 131-150`
- WS spectate route does `db.query(GameSessionModel)…first()` and checks `user_id` directly.
- **Fix:** `ReplayApplicationService.authorize_spectator(...)` (or reuse `get_replay`).

## B-ARCH-3 — `routers/class_.py` joins two services inline — Medium
- **File:** `backend/app/routers/class_.py:159-185`
- Router orchestrates `class_service` + `session_service` and assembles `ClassReflectionOut`. Move into a `ClassReflectionService.list_for_class(class_id, requester)`.

## B-ARCH-4 — `SessionApplicationService` is a god module ⚠️ High
- **File:** `backend/app/application/session_service.py` (559 lines)
- Stale check + V2 score recompute + IA-accuracy update on `User` aggregate + leaderboard insert + achievement evaluation + assessment events + post-commit dispatch.
- **Fix:** Split into a thin lifecycle service plus event handlers subscribing to `SessionCompleted` (the `_dispatch_post_commit` machinery is 80% of an event bus already).

## B-ARCH-5 — Talent rules live in the service, not the aggregate ⚠️ High
- **File:** `backend/app/application/talent_service.py:35-130`
- Spent-points calc, available-points budget, prerequisite check, max-level cap are all in the application service. The aggregate is anaemic (40 lines).
- **Fix:** Promote to a `TalentTree` aggregate / domain service that raises domain errors.

## B-ARCH-6 — `recompute_total_score` duplicated bit-for-bit in Python and TS ⚠️ High
- **Files:** `backend/app/domain/scoring/score_calculator.py`, `frontend/src/domain/scoring/score-calculator.ts`
- Source-of-truth ambiguity for the very formula the V2 protocol is built around.
- **Fix:** Move into the same WASM module already used for `pow`, or generate one side from the other; at minimum a shared parity test.

## B-ARCH-7 — `Email` value object duplicates Pydantic email validation — Medium
- **Files:** `backend/app/domain/user/value_objects.py:16-44`; `app/schemas/auth.py:43-51`
- Pick one canonical normaliser + validator.

## B-ARCH-8 — Domain errors carry HTTP status codes — Medium
- **File:** `backend/app/domain/errors.py:9-184`; `app/main.py:127-133`
- Domain layer should be HTTP-free. Move the mapping to the exception handler.

## B-ARCH-9 — `routers/auth.py::get_me` builds response inline — Medium
- See B-ARCH-1; add `AuthApplicationService.get_me_view`.

## B-ARCH-10 — Score-cap rule duplicated between aggregate and `LeaderboardApplicationService` — Medium
- **File:** `backend/app/application/leaderboard_service.py:118-138`
- Aggregate already enforces `LEVEL_MAX_KILLS`/`LEVEL_MAX_WAVES`; leaderboard service repeats it.

## B-ARCH-11 — `factories.py` is a wiring junk drawer — Medium
- **File:** `backend/app/factories.py` (195 lines, 12 builders)
- Every builder constructs its own UoW over the same `db` → multiple UoWs per request. Use FastAPI `Depends` or a per-request container.

## B-ARCH-12 — `seed.py` writes raw SQL bypassing the aggregate — Low
- **File:** `backend/app/seed.py:33-67`

## B-ARCH-13 — Vestigial `app/domain/identity/` package — Low

## B-ARCH-14 — `ChallengeApplicationService` translates errors based on its own input flag — Low
- **File:** `backend/app/application/challenge_service.py:78-90`

## B-ARCH-15 — `domain/session/aggregate.py` mutable module-level stale-cutoff — Low
- **File:** `backend/app/domain/session/aggregate.py:21-37`

## B-ARCH-16 — Bcrypt 72-byte rule encoded in 3 files — Low
- Define `BCRYPT_MAX_BYTES` once.

## B-ARCH-17 — `shared_constants.py` reaches outside `app/` to repo-root `shared/` — Low
- Ship `game-constants.json` as package data instead of relying on the directory layout.

## B-ARCH-18 — zxcvbn runs inside Pydantic validation — Low
- Move to application service so it executes after rate limiting.

## B-ARCH-19 — Cross-aggregate write in `SessionApplicationService` — Medium
- **File:** `backend/app/application/session_service.py:541-554`
- `_refresh_ia_recent_accuracy` mutates `User` aggregate by direct attribute assignment, then saves via the user repo, all inside the session use case.
- **Fix:** Add `User.update_ia_accuracy(value)` and dispatch via a dedicated `SessionCompleted` handler.

## B-ARCH-20 — Aggregate raises generic `DomainValueError` in `replace_constraints` then service translates — Low
- See B-ARCH-14.

---

# Part 4 — Frontend Security & Systemic Bugs

> Source: full audit by agent D.

## F-BUG-1 — Stale `<script src="/wasm/math_engine.js">` in `index.html` ⚠️ High
- **File:** `frontend/index.html:11`
- 404 on every page load with no SRI/CSP. Future deploys placing content at that path become a top-level executable.
- **Fix:** Delete the script tag (Vite bundles the WASM glue). Add CSP `<meta>` and `object-src 'none'`.

## F-BUG-2 — `new Function()` evaluates raw player input in MagicMode — Medium
- **File:** `frontend/src/math/expressionParser.ts:22`
- Regex preprocessing inserts `Math.*` calls but does not whitelist the rest. Replays embed expressions; spectator/replay viewers execute attacker payloads.
- **Fix:** Replace with a real expression parser (or `mathjs` safe-eval). Bound `inputExpr.length` to ~200 chars (see F-BUG-17).

## F-BUG-3 — Auth-token probe interval can leak across logout flows — Medium
- **File:** `frontend/src/stores/authStore.ts:92-102`
- Re-entry into `startTokenProbe` keeps the first interval alive when callers race; BFCache restore keeps polling after logout.
- **Fix:** `clearInterval` at the top of `startTokenProbe`; pause on `visibilitychange` / `pagehide`.

## F-BUG-4 — `EventRecorder` retry buffer is unbounded — Medium
- **File:** `frontend/src/engine/replay/EventRecorder.ts:186-238`
- Sustained network failure re-prepends batches indefinitely → mobile-Safari OOM. Beacon flush silently 403s after CSRF rotation.
- **Fix:** Cap `_buffer` length (~5k); track consecutive-failure count; stop after N.

## F-BUG-5 — Spectator client trusts WS payload shape — Medium
- **File:** `frontend/src/engine/replay/SpectatorClient.ts:51-64`; `views/SpectateView.vue:38-55`
- `JSON.parse` then `as` cast — malformed frames break the consumer; auth-class closes (4401/4403) look like network blips.
- **Fix:** Add zod / hand-written validation; surface auth close codes distinctly.

## F-BUG-6 — `useSessionSync.endSession` posts client-computed `total_score` — Medium
- **File:** `frontend/src/composables/useSessionSync.ts:235-256`
- Burp-replay risk: if backend ever weakens its recompute (or the comparison drift in B-BUG-15), client value wins.
- **Fix:** Stop sending `score`/`total_score`; backend derives from inputs.

## F-BUG-7 — `recommendationDismissed` localStorage shared across users — Medium
- **Files:** `frontend/src/views/TalentTreeView.vue:23-36`; `LevelSelectView.vue:22-34`
- School-lab shared device → one student's dismiss hides recommendation for the next student.
- **Fix:** Namespace with `${authStore.user?.id}`; clear on logout.

## F-BUG-8 — `ProfileView` password-reset `setTimeout` not cleaned — Low
- **File:** `frontend/src/views/ProfileView.vue:63`

## F-BUG-9 — `TowerBar` shake timer not cleared on unmount — Low
- **File:** `frontend/src/components/game/TowerBar.vue:120-131`

## F-BUG-10 — Open-redirect protection in AuthView fragile to backslash variants — Low
- **File:** `frontend/src/views/AuthView.vue:74-77`
- Use `new URL(raw, location.origin)` and verify origin equality.

## F-BUG-11 — SpectatorClient never auto-reconnects, masks auth failures — Low/Medium
- **File:** `frontend/src/engine/replay/SpectatorClient.ts:65-70`

## F-BUG-12 — `recordedSeq` collisions if engine re-armed without recorder destroy — Low
- **File:** `frontend/src/engine/replay/EventRecorder.ts:98, 150-158`

## F-BUG-13 — `useGameLoop.boot` race with `canvasRef` after fast back-button — Low
- **File:** `frontend/src/composables/useGameLoop.ts:97-111`
- Add a `disposed` flag set in `onUnmounted` and check after every `await`.

## F-BUG-14 — `sessionStorage initial-answer-context` JSON has no size validation / shape check — Low
- **Files:** `frontend/src/views/TerritoryDetailView.vue:81-88`; `InitialAnswerView.vue:26`

## F-BUG-15 — `useGameLoop.retry` doesn't cancel inflight boot ⚠️ Low/Medium
- **File:** `frontend/src/composables/useGameLoop.ts:113-121`
- Two `Game` instances can end up bound to one canvas: doubled enemy speed, doubled events emitted, doubled recorded seqs.
- **Fix:** `bootGeneration` counter; bail out on stale generations.

## F-BUG-16 — CSRF token bound only at first attempt, no refresh-and-retry — Low
- **File:** `frontend/src/services/api.ts:108-112, 75-93`
- On 403 with CSRF body, refetch a safe endpoint to mint a fresh cookie and retry once.

## F-BUG-17 — `MagicModePanel.applyFunction` doesn't cap expression length / nesting — Low
- **File:** `frontend/src/components/game/MagicModePanel.vue:77-97`

## F-BUG-18 — `principleOverlayEnabled` toggle doesn't immediately hide the current overlay — Low
- **File:** `frontend/src/composables/useGameLoop.ts:286-290`

## F-BUG-19 — Multiple views call native `confirm()`/`alert()` — Low
- **Files:** `TerritoryDetailView.vue:48,74,101`; `TalentTreeView.vue:80`; etc.
- Route through `uiStore.showModal` (see F-ARCH-10).

## F-BUG-20 — `WAVE_END` queued update may race with `LEVEL_END` final write — Low/Medium
- **File:** `frontend/src/composables/useSessionSync.ts:152-216`
- Await in-flight `syncing` before `endSession`, or merge wave state into the end payload.

### Already mitigated (verified)

- Cookie-based auth + CSRF double-submit + httpOnly token storage are correctly implemented in `api.ts` / `authService.ts`.

---

# Part 5 — Frontend Architecture / Responsibilities

> Source: full audit by agent E.

## F-ARCH-1 — `gameStore` is a kitchen-sink mirror with engine-control side effects ⚠️ High
- **File:** `frontend/src/stores/gameStore.ts` (lines 19-322)
- Owns its own RAF loop (`_startTimingSync`, 252-271), 13 EventBus subscriptions, engine command methods, and reaches `getSystem('montyHall')`.
- **Fix:** Split into `gameStateStore` (read-only mirror), `gameCommandService` (bus emitter), and move RAF into `useGameLoop`.

## F-ARCH-2 — `authStore.logout` knows about every other store and the router ⚠️ High
- **File:** `frontend/src/stores/authStore.ts:143-175`
- Dynamic-imports talent / territory / UI stores to clear them, then pushes the router. Hidden cross-store coupling growing linearly with new stores.
- **Fix:** Emit an `auth:logout` signal; each store subscribes to its own teardown.

## F-ARCH-3 — Score formula duplicated across Python and TS ⚠️ High
- See B-ARCH-6. Move to shared WASM or codegen.

## F-ARCH-4 — Renderers reach into entity internals (Demeter violations) ⚠️ High
- **Files:** `frontend/src/renderers/EnemyRenderer.ts:12-58`; `TowerRenderer.ts:44-108`
- Renderers read every internal numeric field directly and branch on `disabled`/`configured`/phase.
- **Fix:** `engine/projections/` view-model layer (precedent: `project-path-panel.ts`); renderers consume only `TowerView`/`EnemyView` snapshots.

## F-ARCH-5 — `useGameLoop` is a 470-line god composable ⚠️ High
- **File:** `frontend/src/composables/useGameLoop.ts`
- Mixes WASM init, talent loading, system registration, UI bridges, session sync, audio, principle pedagogy, checkpoint restore, DPR-resize, error/retry. `pickPrincipleForWave` (445-472) is application-domain logic embedded in a composable.
- **Fix:** Decompose into `useEngineBoot`, `registerSystems(game)` (pure, in `engine/`), `useEngineUiBridges`, `usePrincipleOverlay`, `useEngineAudio`. Move checkpoint restore into `Game.restoreFromCheckpoint(cp)`.

## F-ARCH-6 — Vue views call `domain/level/` directly ⚠️ High
- **Files:** `frontend/src/views/{LevelSelectView,TerritoryDetailView,ReplayView,InitialAnswerView}.vue`
- Same WASM-vs-JS branching block copy-pasted across 3 views.
- **Fix:** `levelGenerationService.generate(starRating, seed) → { level, replayVersion }`.

## F-ARCH-7 — `engine/` ↔ `systems/` ↔ `domain/` ↔ `entities/` boundary unenforced — Medium
- **Files:** `engine/Game.ts:280-544`; `engine/Renderer.ts:11`; `systems/TowerPlacementSystem.ts:6,51`
- Empty `domain/tower/` folder; engine implements entity logic (`changeGold`, `changeHp`, `addScore`, `addCost`).
- **Fix:** Document import rules in CLAUDE.md and enforce with `eslint-plugin-import` `no-restricted-paths`. Move `Game.changeGold/Hp/Score/Cost` into the existing `EconomySystem`.

## F-ARCH-8 — `useSessionSync` mixes API + UI modals + game-logic recompute — Medium
- **File:** `frontend/src/composables/useSessionSync.ts:154-269`
- Calls `uiStore.showModal`, recomputes the score domain logic, invalidates achievements cache, reads/writes `sessionStorage`.
- **Fix:** Split into `sessionLifecycleService` (API only) and a thin Vue glue.

## F-ARCH-9 — `ReplayView` re-implements `wireEngine` (system list duplicated) — Medium
- **Files:** `frontend/src/views/ReplayView.vue:141-160`; `composables/useGameLoop.ts:183-209`
- Silent drift risk when a new system is added.
- **Fix:** Extract `engine/registerCoreSystems(game, opts)` and call from both.

## F-ARCH-10 — Native `confirm()`/`alert()` while a Modal store exists — Medium
- See F-BUG-19. Add `uiStore.confirmModal(title, msg): Promise<boolean>` and ban natives via ESLint.

## F-ARCH-11 — `useAuthStore.refreshProfile` and `init` duplicate `MeResponse → User` mapping — Low
- **File:** `frontend/src/stores/authStore.ts:47-57, 116-126`

## F-ARCH-12 — `data/` is a junk drawer — Low
- Empty `level-defs.ts`, generators (`wave-generator.ts`), and study-protocol items (`probe-items.ts`) all share the folder.
- **Fix:** Move generators to `domain/wave/`, study items to `domain/study/`, delete the empty `level-defs.ts`.

## F-ARCH-13 — Empty `config/` while constants are scattered — Low
- `data/constants.ts`, `shared/game-constants.json`, env vars, hardcoded `1280`/`720` literals in `GameView.vue`, two separate `REQUEST_TIMEOUT_MS` declarations.

## F-ARCH-14 — `useLeaderboard` returns a method named `fetch` (shadows `window.fetch`) — Low
- **File:** `frontend/src/composables/useLeaderboard.ts:12`. Rename to `load`/`refresh`.

## F-ARCH-15 — `engine/event-handlers/registry.ts` is documentation, not enforcement — Low
- 237-line registry of `module: 'stores/gameStore', handler: 'anonymous'` entries with no compile-time check.

---

# Cross-Cutting Themes

1. **Read-modify-write without user-level locks** — `talent_service.allocate_point`, `assessment_service.record_event`, achievement upserts, study enrollment, session creation. Single common fix: per-user `pg_advisory_xact_lock(hashtext(user_id))` helper.
2. **Trust boundary for game state** — client computes `score`, sends `total_score`, sends `gold`/`hp` PATCH, and `kills`/`waves_survived` flow through `end_session` before reaching the leaderboard. Backend has v2 verification but degrades silently when WASM is missing. Single fix axis: derive everything possible from the replay event log; reject when `replay_version >= 2` and WASM absent.
3. **Layer leaks** — backend routers reach into `infrastructure/` (B-ARCH-1, -2); Vue views reach into `domain/` (F-ARCH-6); renderers reach into entity fields (F-ARCH-4). Single fix axis: enforce import rules with linters (`importlinter` for Python, `eslint-plugin-import` for TS).
4. **God modules** — `SessionApplicationService` (B-ARCH-4), `gameStore` (F-ARCH-1), `useGameLoop` (F-ARCH-5). Each grew because no clear handler/event abstraction is available. Single fix axis: finish the event-bus / domain-event refactor that's already 80% built (`_dispatch_post_commit`, EventBus).
5. **Token / session lifecycle gaps** — refresh-token reuse not detected (B-SEC-1), password-change keeps refresh tokens (B-SEC-2), MFA challenge JTI not denylisted (B-BUG-1), `disable_mfa` requires no TOTP (B-SEC-6). Together these mean an attacker who briefly captures session credentials retains access through every standard "remediation" the user attempts.
6. **Test coverage of invariants** — every concurrency finding (B-BUG-2, -6, -12, -16) has no test. Adding `ThreadPoolExecutor`-based tests against the existing PG suite is high-leverage.

---

# Suggested Sequencing (suggested PR groups, smallest first)

1. **Hotfix (1 PR, ~50 lines):** B-BUG-1, B-SEC-1, B-SEC-2, F-BUG-1.
2. **Concurrency hardening (1 PR, helper + 4 callsites):** B-BUG-2, B-BUG-6, B-BUG-12, B-BUG-16 — introduce a `with_user_advisory_lock(uid)` helper and use it.
3. **Replay-trust hardening (1 PR):** B-BUG-7 (status check), B-BUG-8 (derive kills from events), B-BUG-15 (fail closed), F-BUG-6 (stop sending score).
4. **Spectator hardening (1 PR):** B-BUG-5 (close DB session), B-SEC-3 (Origin check), B-SEC-4 (CSRF/WS), F-BUG-5 (validate WS shape).
5. **Leaderboard pollution (1 PR):** B-BUG-4 (FK CASCADE).
6. **Architecture sweep (split across multiple PRs, each small):** B-ARCH-1, -2, -4, -6, -19; F-ARCH-1, -2, -4, -5, -6, -7.
7. **Lifecycle + UX cleanup:** F-BUG-3, -4, -8, -9, -13, -15, -19 — driven by an ESLint rule banning `setInterval`/`setTimeout`/`confirm`/`alert` in components.
8. **Test backfill:** B-BUG-21 — one concurrency test per `FOR UPDATE` callsite.

---

*End of report.*
