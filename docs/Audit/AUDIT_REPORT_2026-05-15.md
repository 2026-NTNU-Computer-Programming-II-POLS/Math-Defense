# Math Game — Codebase Audit Report

**Date:** 2026-05-15
**Method:** Five parallel review agents, each reading source directly (not relying on test results), covering: backend auth/security, backend domain/application logic, frontend game engine, frontend application layer, and infrastructure/config. All High/Medium findings were then **re-verified against source** by reading the cited files; five severity ratings were corrected downward as a result (see Verification Notes at the end).
**Focus:** Systemic bugs, security vulnerabilities, and code with unclear responsibilities.

---

## Executive Summary

The codebase is, overall, **well-engineered and unusually well-hardened** for a classroom project: JWT claims are pinned, refresh-token rotation has reuse detection, lockout is an atomic UPSERT, containers run non-root with dropped capabilities, CORS is allow-listed, secrets fail closed at startup, and the frontend keeps auth tokens out of JS-readable storage. Most "obvious" vulnerabilities are already explicitly handled — often with audit-reference comments in the code.

The findings below are the **real residual issues**. After verification, there are **no Critical or High findings**.

| Severity | Count | Items |
|----------|-------|-------|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 5 | BA-S1, BA-U1, BA-B1, BD-1, FA-B1 |
| Low | 41 | see sections below |

**Top priorities:**
1. **BD-1 (Medium)** — the leaderboard ranks by the client-submitted `score`, whose only forgery defense is the coarse per-level cap. Unlike `waves_survived`, it is not replay-verified, and the server-recomputed `total_score` (available on the event) is unused. A scripted client can climb to the per-level maximum.
2. **BA-S1 / BA-U1 (Medium)** — refresh-token reuse-detection performs a hidden cascade revocation inside a query-shaped repository method, making the commit responsibility invisible to callers and fragile to future edits.
3. **BA-B1 (Medium)** — the `challenge` router grants `Role.ADMIN` on owner-checked mutations, so admins always get 403 on teacher-owned challenges — dead/contradictory authorization surface.
4. **FA-B1 (Medium)** — `AdminView` loads data for the *previous* tab because `loadData()` runs before the async route change settles.
5. **IN-C4 (Low, but worth acting on)** — CI skips `event-registry-check` and `lint-determinism`, so determinism regressions (load-bearing for the replay-validation system) are not caught.

---

## 1. Backend — Authentication, Authorization & Security

Scope: `middleware/`, `utils/`, `infrastructure/` (login_guard, token_denylist, email_service, scheduler), all `routers/`, auth-related `schemas/`, `domain/auth/`, `domain/user/`, `application/auth_service.py`, `config.py`, `main.py`.

### Security

**(FIXED) BA-S1 — Refresh-token reuse-detection revocation depends on an unconditional commit in `logout_token` — Medium**
`backend/app/application/auth_service.py:247-261`
`logout_token` calls `refresh_token_repo.consume(token_hash)`. On a *reused* token (stolen-cookie replay), `consume()` internally calls `revoke_all_for_user()` and returns `None` (verified — `refresh_token_repository.py:46-48`). `logout_token` happens to commit unconditionally at the end, so the revocation persists — but **only by luck of control flow**. `refresh_access_token` documents that an explicit early `commit()` is required on the `user_id is None` path; `logout_token` has no equivalent safeguard. Any future early-return added before the commit would silently drop a compromise-revocation.
*Fix:* have `consume()` return a typed result (e.g. `REUSE_DETECTED`) so callers explicitly own the commit; or add an explicit comment + early commit, matching `refresh_access_token`.

**BA-S2 — Spectator WebSocket re-auth: minor revocation lag — Low**
`backend/app/routers/replay.py:216-227`
Periodic re-auth correctly re-checks the denylist/password-version, but a banned user can stream up to ~60s past revocation. Already acknowledged in code. The `4401` close on `re_user.id != user.id` is effectively dead code (a token always decodes to the same `sub`).

**BA-S3 — Per-email login throttle is in-process only — Low**
`backend/app/limiter.py:104-131`
`_login_email_history` is a process-local dict; under multi-worker/replica deployment the effective rate is `LIMIT × workers`, and a restart zeroes the window. The persistent `LoginAttempt` lockout is the real control, so this is acceptable as designed — noted for awareness.

**BA-S4 — `register()` reveals account existence — Low (accepted)**
`backend/app/application/auth_service.py:133-134`
`"Email already registered"` is an enumeration oracle, consciously accepted for a school game (code comment B-SEC-17). No action required.

### Systemic Bugs

**(FIXED) BA-B1 — `challenge` router grants `Role.ADMIN` on owner-checked mutations → admins always get 403 — Medium**
`backend/app/routers/challenge.py:116,134,150` vs `backend/app/application/challenge_service.py:66,80,95`
`rename_challenge`, `update_constraints`, and `delete_challenge` use `require_role(Role.TEACHER, Role.ADMIN)` and pass `teacher_id=user.id`. The service then calls `challenge.assert_owned_by(teacher_id)` — an admin's id never matches a teacher's `challenge.teacher_id`, so every admin mutation on a teacher-authored challenge raises 403. (`create_challenge` is unaffected — it has no ownership check and simply records the admin as owner.) This is dead authorization surface that contradicts the rest of the codebase, where admins are deliberately read-only for mutations (see `class_.py`).
*Fix:* drop `Role.ADMIN` from those three decorators, or add an explicit admin-bypass branch in the service (mirroring `ClassApplicationService._verify_owner_or_admin`).

**BA-B2 — Blanket `ValueError` handler masks server bugs as 422 — Low**
`backend/app/main.py:168-173`
Any internal `ValueError` (parse failure, json error) is returned as `422`, hiding genuine 500-class bugs and skewing monitoring. Domain invariants already raise `DomainValueError` (handled separately).
*Fix:* remove the blanket `ValueError` handler; let unexpected `ValueError`s fall through to the 500 handler.

### Unclear Responsibilities

**(FIXED) BA-U1 — `consume()` performs a hidden, side-effecting cascade revocation from a query-named method — Medium**
`backend/app/infrastructure/persistence/refresh_token_repository.py:28-56`
`consume()` reads as "mark used, return user_id," but on reuse it silently calls `revoke_all_for_user()` (verified, lines 46-48). This is the root cause of BA-S1: every caller must *know* that a `None` return may have mutated state and must therefore commit even on the error path. The security decision (revoke the family on reuse) is correct, but it is buried in the persistence layer where the transaction boundary is invisible.
*Fix:* lift the reuse→revoke decision into `AuthApplicationService` (the layer owning the UoW), or return a typed result so callers explicitly handle the reuse case.

**BA-U2 — WebSocket auth reimplemented in the router instead of a shared dependency — Low**
`backend/app/routers/replay.py:114-227`
`spectate_session` hand-rolls cookie parsing, origin checking, token auth, and DB-session lifecycle — the one place auth logic is duplicated. Currently correct, but cookie-name or origin-policy changes must be remembered here separately.
*Fix:* extract `authenticate_ws(websocket, db)` into `middleware/auth.py`.

**BA-U3 — CSV export charset safety is load-bearing but undocumented — Low**
`backend/app/routers/study.py:104-147`, `application/study_service.py:167-178`
CSV export writes `user_id`/`group` verbatim. Not exploitable today (UUID + enum), but `_STUDY_ID_PATTERN` permits a leading `-`, and `study_id` flows into a `Content-Disposition` filename. The moment any user-controlled string becomes a CSV cell, this is an injection vector.
*Fix:* defensively prefix non-numeric cells with `'`; document the charset constraint.

### Clean (verified, no findings)
JWT decoding (pins alg/iss/aud/`require`), SQL injection (all ORM/bound params), RBAC/IDOR (repo-scoped by `user_id`, ownership checks in app layer, admin cannot self-register), password hashing (bcrypt rounds=12 with 72-byte rejection), TOTP (replay window enforced), lockout races (atomic PG UPSERT + `SELECT FOR UPDATE`), CORS/cookies/secrets (explicit origin list, `HttpOnly`/`Secure`/`SameSite`, secret length-validated, fails closed).

---

## 2. Backend — Domain & Application Business Logic

Scope: `domain/` (session, leaderboard, achievement, talent, territory, scoring, season, challenge, assessment, study, class_, value_objects), `application/`, `infrastructure/persistence/`, game/domain `models/`, `db/`, `alembic/versions/`.

### Systemic Bugs

**(FIXED) BD-1 — Leaderboard ranks by the client-submitted `score`, not the replay-verified figure — Medium**
`backend/app/application/session_event_handlers.py:50-67`, `domain/leaderboard/aggregate.py:11-71`, `domain/session/aggregate.py:221-269`, `routers/leaderboard.py:52-65`
`LeaderboardInsertHandler` builds the entry from `event.score`. Tracing it back: `score` is the raw integer passed by the client to `end_session`, carried through `GameResult` into `GameSession.complete()`. The aggregate enforces only **coarse caps** — `score` must not decrease, must not jump more than `MAX_SCORE_DELTA` per update, and must not exceed `LEVEL_MAX_SCORES[level]`. It is *not* derived from the replay event log the way `waves_survived` is (`_derive_waves_from_events`), and it is *not* the server-recomputed `total_score` (which `_verify_score` produces and which is even attached to the `SessionCompleted` event at `session_service.py:323-327` — but `LeaderboardInsertHandler` ignores it; `LeaderboardEntry` has no `total_score` field). Net effect: a scripted client making in-range `update_session` calls can climb to the per-level maximum score and top the board.
*Note on intent:* ranking by `score` rather than `total_score` may be deliberate — `submit_score` and `get_user_history` treat `score` as the leaderboard metric, and `submit_score`'s comments call `session.score` "authoritative." So this is **not** "the leaderboard bypasses the anti-cheat pipeline" (the `total_score` pipeline drives territory occupation and the recommender, not the leaderboard). The genuine, verified weakness is narrower: the leaderboard's *only* forgery defense is the per-level ceiling, which any client can reach.
*Fix:* if `score` is the intended metric, tighten its verification (e.g. derive a plausibility bound from `kill_value`/replay length); if `total_score` is intended, add it to `LeaderboardEntry` and rank by it.

**BD-2 — `submit_score` omits `challenge_id`, leaking challenge runs onto the global board in a narrow window — Low**
`backend/app/application/leaderboard_service.py:97-161`
`end_session` already auto-creates a `LeaderboardEntry` via the post-commit `LeaderboardInsertHandler`. `submit_score` is a *separate* public use case (wired at `routers/leaderboard.py:102-115`) that also creates an entry for a completed session. It is **not** a blind re-insert — it has a `find_by_session_id` duplicate check that raises `DuplicateSubmissionError` (409), so for a normally-completed session it cleanly no-ops. The real residual issue: `submit_score` constructs the entry **without `session.challenge_id`** (verified, lines 136-144). So if the post-commit handler failed (its failure is logged and swallowed — see BD-5) and a client then calls `submit_score` for that challenge session, the challenge run lands on the **global** leaderboard. Narrow window, but the `challenge_id` omission is a genuine inconsistency between two code paths that create the same row.
*Fix:* have `submit_score` copy `session.challenge_id` (and `total_score`, per BD-1) like the handler does; or make it a read-through that returns the handler-created entry.

**BD-3 — Replay timing floor relies on an undocumented shared-origin assumption — Low**
`backend/app/application/session_service.py:473-507, 578-584`
`_derive_timing_from_events` returns `time_total_min = max(all_ts)` and `_verify_score` uses it to floor (and, for v2, effectively reject) a client `time_total` more than 0.5 s below it. The docstring states `ts` is "game-time," so `max(all_ts)` is a valid floor on elapsed duration **only if** the event clock and the client's `time_total` clock share a zero origin (game start) — which they do by construction today. This is not a confirmed bug, but the shared-origin assumption is load-bearing for the anti-cheat rejection and is not asserted or documented as an invariant; a future change to how `ts` is stamped (e.g. wall-clock, or a non-zero start event) would silently turn legitimate runs into `replay_mismatch` 422s.
*Fix:* document the shared-origin invariant at the `ts` write site, or store an explicit run-start event and derive duration as `max(all_ts) - start_ts`.

**BD-4 — Stale-cutoff knob read inconsistently (subclass vs base class) — Low**
`backend/app/domain/session/aggregate.py:174` vs `infrastructure/persistence/session_repository.py:68`
`GameSession.is_stale` reads `type(self)._stale_cutoff_hours`; `find_stale_sessions` reads `GameSession._stale_cutoff_hours` off the base class. A subclass override (or test rebind) makes the DB query and in-memory check disagree.
*Fix:* expose a single accessor (`GameSession.stale_cutoff_hours()`).

**BD-5 — `LeaderboardInsertHandler` failure has no retry/outbox — Low**
`backend/app/application/session_event_handlers.py:50-72, 197-222`
Post-commit handler failures are logged and swallowed (the documented best-effort design). The leaderboard handler catches only `ConstraintViolationError`; any other `DomainError` propagates to `dispatch`, is logged, and the leaderboard row is permanently missing with nothing to reconcile it. Combined with BD-1/BD-2, a durability gap in scoring. Code comments already note "a future outbox table would replace this."

*No IDOR or missing-ownership issues found* — session repo methods scope by `(session_id, user_id)`; territory/recommendation/challenge/study all re-check ownership.

### Unclear Responsibilities

**BD-6 — Anemic aggregate: `TerritorySlot` star-rating invariant lives only in the schema/DB — Low**
`backend/app/domain/territory/aggregate.py:40-72, 143-151`
`TerritorySlot.create` / `add_slot` accept `star_rating` with no validation — the 1..5 invariant lives only in the Pydantic schema and the DB CHECK. A non-HTTP caller can build an invalid slot. Inconsistent with the defence-in-depth argument the `GameSession` aggregate makes for itself.
*Fix:* validate `1 <= star_rating <= 5` in `TerritorySlot.create`.

**BD-7 — Dead code: `AssessmentApplicationService.record_events` — Low**
`backend/app/application/assessment_service.py:99-124`
Never called; duplicates the batch-apply logic of `apply_evidence_in_open_uow` with its own UoW. A future maintainer could wire it up and double-apply Beta evidence.
*Fix:* remove it, or unify on a single shared core.

### Migrations

**BD-8 — `territory_session_uses` has no FK to `game_sessions` — Low**
`backend/alembic/versions/k5f6a7b8c9d0_territory_session_uses.py:22-26`
`session_id` is a bare PK string with no FK. The table is intentionally durable (must survive occupation deletion), so `CASCADE` would be wrong — but no FK at all means orphan rows accumulate and typo'd ids can be inserted.
*Fix:* add a `RESTRICT`/no-action FK, or document why none exists.

**BD-9 — `58cbdc857a81_fix_dropped_tables` uses `if_not_exists=True`, masking schema drift — Low**
`backend/alembic/versions/58cbdc857a81_fix_dropped_tables.py:21-60`
Recreates three tables with `if_not_exists=True`; on a DB where they exist with a *different* schema, the migration silently no-ops instead of failing. Still carries the "auto generated — please adjust!" header. `downgrade` unconditionally drops them, so down-then-up is not faithful.

*Otherwise the migration chain is sound* — FK/CHECK/unique constraints are present and match the ORM models; no data-losing or irreversible migrations found.

---

## 3. Frontend — Game Engine & Simulation

Scope: `engine/`, `systems/`, `entities/`, `renderers/`, `domain/`, `math/`.

### Systemic Bugs

**FE-1 — Newly-applied slows lag one tick due to system registration order — Low**
`frontend/src/systems/CombatSystem.ts:33-60`, `engine/register-systems.ts:65-95`
`CombatSystem._tickDoT` computes `enemy.speedMultiplier` from `slowFactor`/`speedBoost`, then resets `speedBoost = 0`. Verified ordering: `combat` runs at index 2, but `magicTower` (8), `petCombat` (13), and `spell` (16) — the systems that *set* `slowFactor` — run later in the same frame. So a slow applied this frame is not reflected in `speedMultiplier` until the next frame's `_tickDoT` (~16 ms at 60 fps). There is **no accumulation bug** — `speedBoost` is reset unconditionally every tick, and `enemyAbility` (index 1) runs *before* combat so its `speedBoost` writes are consumed same-tick. The residual issue is purely the one-tick latency and the order-fragility of resolving derived state in a system that may early-return on a phase change.
*Fix (optional):* recompute `speedMultiplier` at the top of `MovementSystem` from the live fields, or resolve slow/boost in a dedicated pass after all debuff systems.

**FE-2 — `EconomySystem.update` writes `timeTotal` every tick in every phase — Low**
`frontend/src/systems/EconomySystem.ts:71-73`
`timeTotal = game.time` runs unconditionally, including BUILD/MONTY_HALL/CHAIN_RULE. Scoring relies on `timeExcludePrepare` (maintained by a separate composable handler) to subtract prep time back out — but nothing structurally ties the two together. A missed PHASE_CHANGED (e.g. via `forceTransition`) inflates active time.
*Fix:* only accumulate `timeTotal` while `phase === WAVE`.

**FE-3 — `MovementSystem` vertical-segment handling can skip the drop — Low**
`frontend/src/systems/MovementSystem.ts:79-109`, `domain/path/segmented-path.ts:78-85`
`_advanceSegmented` resolves the current segment via `findSegmentAt(enemy.x)`. For a vertical segment (`xRange = [x, x]`), an enemy mid-drop has `enemy.x` exactly on the shared boundary, so `findSegmentAt` returns the *next* segment before the vertical strategy finishes — the drop is silently skipped.
*Fix:* track the active segment id in `MovementState`; advance only when the strategy reports completion.





2026-05-15 fixed (above)






### Unclear Responsibilities

**FE-4 — `Game` still carries presentation/UI state — Low**
`frontend/src/engine/Game.ts:255-265`
Despite the "no longer a God Object" claim, `Game` still owns `hoveredSegmentId`, `keyboardCursor` (pure HUD/input state), and the `towerModifierProvider` callback slot — the cross-layer junction drawer.
*Fix:* move HUD/cursor state into a small engine-owned `HudState`/`InputState` object or a projection.

**FE-5 — Renderers reach into system internals via public-but-internal accessors — Low**
`frontend/src/renderers/MatrixLaserRenderer.ts:13-28`, `MagicZoneRenderer.ts:15-23`
`MatrixLaserRenderer.getLaserState(...)` and `MagicZoneRenderer.getTowerCurve(...)` expose simulation-internal structures directly to the render layer, bypassing the `engine/projections/` pattern that `EnemyRenderer` is built around — two inconsistent renderer conventions in one folder.
*Fix:* route Matrix/Magic visual data through `engine/projections/`.

### Correctness

**FE-6 — Limit tower `+inf` ("instantly destroys the target") fails against shielded enemies — Low**
`frontend/src/systems/LimitTowerSystem.ts:62-76`, `domain/combat/SplitPolicy.ts:154-164`
`+inf` computes `dmg = Math.max(tower.effectiveDamage, enemy.hp)` routed through `applyDamage`, which subtracts `enemy.shield` first. If `effDmg < hp` and `shield > 0`, the enemy survives with shield-worth of HP — contradicting the spec.
*Fix:* size `+inf` damage as `enemy.hp + enemy.shield`, or special-case the kill.

**FE-7 — `applyDamage` evasion applied before the Bulwark per-hit cap — Low**
`frontend/src/domain/combat/SplitPolicy.ts:117-138`
Pipeline is vulnerability → evasion → per-hit cap. An enemy with *both* evasion and a cap (independent fields, no current enemy has both) gets evasion-shrunk *and* clamped — order-fragile, and the `DAMAGE_RESOLVED` `kind` hides that evasion fired.
*Fix:* apply the cap to the pre-evasion amount, or assert the traits are mutually exclusive in `EnemyFactory`.

**FE-8 — `WaveSystem._endWave` ordering vs. boss split is load-bearing and undocumented — Low**
`frontend/src/systems/WaveSystem.ts:52-69`, `systems/EnemyAbilitySystem.ts:140-186`
`_handleChainRuleAnswer` (correct answer) sets the boss `alive = false`, emits `ENEMY_KILLED`, *then* calls `_splitBoss`. Wave-end safety depends purely on `enemyAbility` running before `wave` — correct today, but undocumented and fragile.
*Fix:* push split children *before* emitting `ENEMY_KILLED`, mirroring `SplitPolicy.killEnemy`.

### Clean (verified, no findings)
Memory leaks (all systems implement `destroy()`/unsubscribe; `EventRecorder`/`EventPlayer` clean up intervals & listeners), floating-point/NaN (log-domain guards, `score-calculator` clamps), economy overflow/underflow (`changeGold` clamps at 0, `changeHp` clamps to `[0, maxHp]`), EventBus (snapshots listeners before dispatch).

---

## 4. Frontend — Application Layer

Scope: `views/`, `components/`, `composables/`, `stores/`, `services/`, `router/`, `lib/`, `utils/`, `data/`, `main.ts`, `App.vue`.

### Security

**No critical or high-severity security issues found.** Tokens never touch `localStorage`/`sessionStorage` (cookie-based HTTP-only auth + CSRF double-submit), no `v-html`/`eval`/`innerHTML` in scope, the 401 interceptor clears state, `logout()` clears local state even on server failure, and `AuthView.getNextPath()` open-redirect is correctly hardened.

**FA-S1 — Role checks are client-side only (expected) — Low**
`frontend/src/router/index.ts:225-239`
`requiresRole` guards are trivially bypassable (role comes from `/auth/me`). Expected for UX — and the backend audit confirms every `/api/admin/*`, activity/challenge/class write endpoint independently enforces role server-side. Noted for completeness.

**FA-S2 — `authStore` role trusted for authz-shaped UI decisions — Low**
`frontend/src/stores/authStore.ts:55-57`, e.g. `TerritoryDetailView.vue:32-40`
The `role` field drives whether destructive actions are *offered*. Fine as long as the backend re-authorizes (it does). No client-side JWT decoding occurs (good).

### Systemic Bugs

**(FIXED) FA-B1 — AdminView loads data for the *previous* tab on tab switch — Medium**
`frontend/src/views/AdminView.vue:96-99, 116, 19-25`
Verified: the tab buttons do `@click="switchTab(tab); loadData()"`. `switchTab` calls `router.push(...)` (async, not awaited), then `loadData()` runs synchronously and branches on `activeTab` — a `computed` from `route.name`, which has *not* updated yet. Clicking "Classes" fetches teachers. (`onMounted(loadData)` handles the initial load correctly; only switching is broken.)
*Fix:* drive loading from `watch(activeTab, loadData, { immediate: true })` and drop the inline `loadData()`, or `await switchTab(tab)` first.

**FA-B2 — `useSessionSync` WAVE_END drain can drop a snapshot on generation change — Low**
`frontend/src/composables/useSessionSync.ts:140-150`
Inside the drain loop, `if (job.gen !== sessionGeneration) break` discards the job *and* exits the loop, leaving newer pending items unprocessed. Mostly benign (terminal `/end` payload still drains), but `break` should be `continue`.

**FA-B3 — `_showErrorFallback` ignores sticky/confirm modal state — Low**
`frontend/src/stores/uiStore.ts:267-272`
Sets `modalVisible = true` without clearing `modalConfirmMode`/`modalSticky`/`modalConfirmResolver` — a stale resolver could linger if a confirm-modal callback rejects.
*Fix:* reset all modal fields in the fallback.

**FA-B4 — Four stores register `appBus.on('auth:logout')` with no `off` — Low**
`frontend/src/stores/{talentStore:14, gameStore:358, uiStore:83, territoryStore:20}`
Fine in production (singleton stores), but under Vite HMR / test re-creation, duplicate listeners accumulate. `appBus` has no dedupe.

*No race conditions found in engine-binding paths* — `useGameLoop`, `useLeaderboard`, `sessionLifecycleService`, `EventRecorder` are all correctly guarded with disposal flags / abort controllers / generation tokens. Interval/listener/observer cleanup is thorough.

### Unclear Responsibilities

**FA-U1 — `EventRecorder._beaconFlush` bypasses the `api`/service layer with a raw `fetch` — Low**
`frontend/src/engine/replay/EventRecorder.ts:255-286`
Hand-rolls URL, CSRF header, `credentials: 'include'` instead of using `sessionService`. Legitimate reason (needs `keepalive: true` for `beforeunload`), but duplicates CSRF/credentials logic across three places.
*Fix:* expose a `keepalive` option on the `api` wrapper.

**FA-U2 — `TerritoryDetailView` does level generation + history-state serialization inline — Low**
`frontend/src/views/TerritoryDetailView.vue:102-150`
`handlePlay` calls `sessionService.getActive()` directly, runs `generateLevelForRun`, JSON-stringifies with a 64KB cap, and builds router state — substantial orchestration in a view, duplicated in `LevelSelectView`.
*Fix:* extract a `startRun(starRating, seed, territoryContext?)` helper.

**FA-U3 — `authStore` owns a polling interval + page-lifecycle listeners — Low**
`frontend/src/stores/authStore.ts:99-150`
The token-probe `setInterval` + `pagehide`/`pageshow` listeners make the store more than a state container. Correctly cleaned up, but stylistically belongs in a `useTokenProbe` composable.

*Clean:* services are uniformly thin; `gameStore` is a disciplined read-only mirror; `useGameLoop` decomposition is clean; error handling is consistent.

---

## 5. Infrastructure, Configuration & CI

Scope: `docker-compose*.yml`, Dockerfiles, `nginx*.conf`, env files, `.github/`, `shared/`, `wasm/`, Alembic config, dependency manifests, Vite/TS config.

### Security

**The project is unusually well-hardened** — non-root containers, `cap_drop: ALL`, `read_only` rootfs, `no-new-privileges`, scoped CORS allow-lists, full CSP + HSTS + BREACH mitigation, startup validators rejecting weak secrets / `DEBUG` in prod.

**`.env` is correctly gitignored and never committed — VERIFIED CLEAN.** `git ls-files` shows only `.env.example` tracked; `git log --all -- .env` is empty. `.dockerignore` also excludes it.

**IN-S2 — `/openapi.json` is exposed in production — Low**
`backend/app/main.py:114-121`
`docs_url`/`redoc_url` are gated behind `settings.debug`, but `openapi_url` keeps its default — the raw schema (every route, parameter, model) is still served in prod.
*Fix:* `openapi_url="/openapi.json" if settings.debug else None`.

**IN-S3 — Postgres port published to the host in dev compose — Low**
`docker-compose.yml:11-12` — bound to `127.0.0.1` only (not internet-exposed); prod compose correctly publishes nothing. Acceptable for dev; flagged so it's a conscious decision.

**IN-S4 — Self-signed TLS certs assumed; no automation, no presence check — Low**
`nginx-tls.conf:29-30`, `docker-compose.prod.yml:97` — nginx hard-requires mounted certs with no ACME automation and no guard if `./certs` is empty.
*Fix:* document cert provisioning, or add a certbot sidecar.

*CORS / security headers — VERIFIED CLEAN* (map-based origin allow-list, full CSP, `X-Frame-Options: DENY`, HSTS, `X-Forwarded-For` from `$remote_addr`).

### Config Drift & Bugs

**IN-C1 — `SEED_DEMO_USER` is consumed by the backend but missing from `.env.example` — Low**
On-disk `.env` sets `SEED_DEMO_USER=false`, and `backend/app/seed.py:29` reads it. It is not listed in `.env.example`. The default is **well-defined and safe** — `os.environ.get("SEED_DEMO_USER", "")` is falsy when unset, so a fresh developer who copies `.env.example` simply gets demo-seeding disabled (`seed.py:46` logs "SEED_DEMO_USER not set — skipping demo seed"). This is purely a documentation gap, not a behavioral bug.
*Fix:* add `SEED_DEMO_USER` to `.env.example` with a comment and its default, for discoverability.

**IN-C2 — CI Postgres password (`changeme`) coupling is undocumented — Low**
`.github/workflows/ci.yml:22,46` — CI uses `changeme`, which works only because `config.py:131` skips the rejection when `_is_test_env()` is true. Correct but fragile; split across two files with no comment.
*Fix:* add a one-line comment in `ci.yml` explaining the intentional placeholder.

**IN-C3 — `*.wasm` is gitignored, yet `math_engine.wasm` is force-committed — Low**
`.gitignore:62` ignores `*.wasm`, but `frontend/src/math/wasm/math_engine.wasm` is committed and *required* by both Docker builds. A `git rm --cached` + re-add could silently drop it.
*Fix:* add `!frontend/src/math/wasm/math_engine.wasm` and `!...math_engine.js` un-ignore lines.

**(FIXED) IN-C4 — CI runs a different check set than the `npm run ci` script — Low (worth acting on)**
`frontend/package.json:11,18`, `.github/workflows/ci.yml:63-77`
The CI workflow inlines its own steps and **does not** run `event-registry-check` or `lint-determinism` — despite both being part of the `ci` npm script. **Determinism is load-bearing for this project's replay-validation system**; a regression would not be caught.
*Fix:* make `ci.yml` call `npm run ci` (single source of truth), or add the two missing steps.

**IN-C5 — Shared-constants parity test only covers `player.*` — Low**
`shared/game-constants.json`, `backend/tests/test_shared_constants_parity.py`
The backend reads only `player.initialHp`/`initialGold` today and the test covers only those. The test name over-promises; if the backend later consumes `economy.*` etc., nothing guards it.
*Fix:* extend the parity test in lockstep when the backend consumes more keys.

*Dependency versions — VERIFIED CLEAN* (fastapi/starlette/psycopg pairings consistent, CI Python/Node match Dockerfiles, Alembic has one DB-URL source of truth).

### Unclear Responsibilities

**IN-U1 — Dev compose hands the backend a `POSTGRES_PASSWORD` it never uses — Low**
`docker-compose.yml:33` still injects `POSTGRES_PASSWORD` into the dev backend container; the prod compose already fixed this (the backend only needs `DATABASE_URL`, as `.env.example` itself documents). Inconsistent; the dev backend needlessly carries the DB password.
*Fix:* drop `POSTGRES_PASSWORD` from the `backend` service in `docker-compose.yml`.

**IN-U2 — CORS origins configured through two incompatible mechanisms — Low**
Backend `.env` uses comma-separated `CORS_ORIGINS`; `docker-compose.prod.yml:85-86` uses two numbered slots `CORS_ORIGIN_1`/`CORS_ORIGIN_2` for nginx. They can drift, and nginx is silently hard-capped at two origins.
*Fix:* document the relationship; longer term, generate the nginx `map` from the same list.

**IN-U3 — nginx security-header block duplicated four times — Low**
`nginx.conf` and `nginx-tls.conf` each repeat the full CSP/header set per server block. A header tweak must be made in up to four places.
*Fix:* factor into an `include`d `security-headers.conf` snippet.

---

## Verification Notes

All High/Medium findings were re-checked by reading the cited source. Five ratings were corrected downward; the original agent reports overstated them:

| Finding | Original | Corrected | Reason |
|---------|----------|-----------|--------|
| BD-1 | High | **Medium** | The leaderboard ranking by `score` is consistent across the codebase (`submit_score`, `get_user_history`) and plausibly intentional; `total_score` drives territory/recommender, not the leaderboard. The real, verified weakness — `score`'s only defense is the per-level cap — is genuine but Medium, not a pipeline bypass. |
| BD-2 | Medium | **Low** | The claim "re-inserts entries the handler already created" is false — `submit_score` has a `find_by_session_id` duplicate check that returns 409. The verified residual issue (omitted `challenge_id`) only triggers in a narrow window after a swallowed handler failure. |
| BD-3 | Medium | **Low** | Not a confirmed bug. The event `ts` is documented game-time and the floor logic is internally consistent by construction. The residual issue is an undocumented load-bearing assumption, not an active defect. |
| FE-1 | Medium | **Low** | Verified there is no state-accumulation bug — `speedBoost` is reset every tick and `enemyAbility` runs before `combat`. The impact is a ~16 ms one-tick lag on newly-applied slows. |
| IN-C1 | Medium | **Low** | The default is well-defined and safe (seeding disabled when unset), confirmed in `seed.py`. It is a documentation gap, not "undefined behavior." |

## Appendix — Methodology Notes

- Each area was reviewed by a dedicated agent reading source files directly; test results were explicitly **not** treated as proof of correctness.
- `node_modules/`, `.venv/`, `__pycache__/`, and `emsdk/` were excluded.
- Severity reflects exploitability/impact in this project's context (a classroom game), not a generic CVSS score.
- "Clean (verified)" notes are included deliberately so future audits know what was checked and found sound.
