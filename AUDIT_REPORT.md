# Math Defense — Full-Stack Audit Report

**Date:** 2026-04-12
**Scope:** `backend/` (FastAPI + SQLAlchemy, DDD) and `frontend/src/` (Vue 3 + TS + Vite + Pinia + ECS-style engine)
**Method:** Static analysis by domain/layer. Findings are cited with file path and approximate line numbers; some counts may shift after code edits — verify against current source before acting.

---

## Executive Summary

| Layer | Critical | High | Medium | Low / Nit |
|---|---|---|---|---|
| Backend | 2 | 5 | 5 | 5 |
| Frontend | 0 | 3 | 10 | 8 |

**Top three items to fix first**

1. **Leaderboard IDOR / race on submission** (`leaderboard_service.py:39-80`) — Score submission path is not atomic; duplicate check happens before the insert and relies on the DB unique constraint rather than a domain lock.
2. **Global-rank window function scans full table** (`leaderboard_repository.py:57-66`) — `DENSE_RANK()` runs without `PARTITION BY` when `level=None`, making `/api/leaderboard` O(total entries) per request.
3. **Session-create retry blindly abandons any active session on *any* `IntegrityError`** (`session_service.py:38-48`) — A FK-violation or unrelated constraint failure triggers an unintended state change.

---

## Backend

### Domain

**B-1 `is_stale` timezone normalization incomplete — High**
- `app/domain/session/aggregate.py:96-100`
- SQLite strips tzinfo; comparing naive `started_at` against `datetime.now(UTC)` works by accident today, but if the ORM column stays `DateTime()` (no `timezone=True`), DB-returned values are naive. Silent drift is possible under migration or DB swap.
- Fix: store with `DateTime(timezone=True)` and normalize at load time.

**B-2 Stale cutoff hardcoded — Low**
- `app/domain/session/aggregate.py:15`
- `STALE_CUTOFF = 2h` is a module constant, not a config knob.
- Fix: move to `config.py`.

### Application (Use Cases)

**B-3 Leaderboard submission is non-atomic — Critical (IDOR / race)**
- `app/application/leaderboard_service.py:39-80`
- The duplicate-submission check (`find_by_session_id`) runs before the aggregate is created and persisted. Two concurrent posts can both pass the check and only the DB unique constraint catches the second. If `submit_score` is callable outside `end_session`, a crafted `session_id` exercises logic that assumes domain-only entry.
- Fix: Use `SELECT ... FOR UPDATE` on a session row (or an advisory lock on `session_id`) before inserting, or make `end_session` the only valid path and remove/disable the public POST.

**B-4 Race-condition retry in `create_session` is too broad — High**
- `app/application/session_service.py:38-48`
- The retry catches `IntegrityError` and abandons `find_active_by_user(user_id)`. Any integrity error — FK violation, check constraint, unrelated uniques — triggers the abandon path.
- Fix: Inspect `e.orig` / pgcode / SQLite error string to confirm the offending constraint is the partial-unique active-session index; otherwise re-raise.

**B-5 `clear_events()` ordering loses events on post-commit exception — High**
- `app/application/session_service.py:114-115`
- Sequence is `save → _uow.commit() → clear_events()`. An exception between commit and clear (e.g., logger, telemetry) leaves events stuck on the aggregate in memory. If that aggregate is re-used before reload, re-emits are possible.
- Fix: Either (a) clear events inside the UoW’s commit hook, or (b) emit/publish events *after* commit using a captured snapshot, not the aggregate’s live list.

**B-6 Auto-created leaderboard entry uses redundant existence check — Low**
- `app/application/session_service.py:139-152`
- `find_by_session_id` is called before insert. The DB already has a unique constraint on `session_id`. Either trust the constraint and catch `IntegrityError`, or keep the check and document it as a fast-path.

### Infrastructure (Repositories / UoW)

**B-7 `query_ranked` leaks full-table window for global queries — Critical (performance)**
- `app/infrastructure/persistence/leaderboard_repository.py:57-66`
- `partition_by=level` is only applied when `level is not None`. For `/leaderboard` with no filter, `DENSE_RANK()` computes across the entire table on every request. At scale this becomes the dominant query cost.
- Fix: Either require `level` on the ranked endpoint, or precompute/cache a global materialized rank, or split into two distinct code paths.

**B-8 Redundant `User` join across count + ranked query — High (N+1 / latency)**
- `app/infrastructure/persistence/leaderboard_repository.py:45-70`
- Both the count query and the ranked query join `User`. If `User` has lazy relationships, iterating results can trigger additional loads.
- Fix: Consolidate into a single CTE; assert only the columns needed (`username`).

**B-9 Repository `save()` silently ignores `started_at` mutation — Medium**
- `app/infrastructure/persistence/session_repository.py:41-66`
- The update branch omits `started_at` (correct today) but there is no explicit invariant test. A future setter on the aggregate would silently fail to persist.
- Fix: add a domain test that `started_at` is truly frozen; optionally assert in the repo.

### Routers (HTTP Boundary)

**B-10 `GET /sessions/active` bypasses the service layer — High**
- `app/routers/game_session.py:62-75`
- Router instantiates `SqlAlchemySessionRepository` directly. Auth is still enforced via `get_current_user`, but any future service-level rule (filter abandoned, hide expired, tenant scoping) will not apply here.
- Fix: add `SessionService.get_active_for_user(user_id)`.

**B-11 `POST /sessions/{id}/end` is not idempotent — Medium**
- `app/routers/game_session.py:124-155`
- Repeated calls return 409 after the first success. Clients retrying due to timeouts must special-case it.
- Fix: On second call, return 200 with the same completed DTO (or a stored response envelope).

### Schemas (Pydantic)

**B-12 Weak password policy — Medium (security)**
- `app/schemas/auth.py:19-30`
- Only checks length ≥ 8, one letter, one digit. Accepts `password1`, `aaaaaaaa1`, `qwerty12`.
- Fix: add a common-password blacklist or `zxcvbn`-style entropy check; reject runs of the same char > 4.

**B-13 `kills` / `waves_survived` unbounded — Medium**
- `app/schemas/game_session.py:32-35`
- Integer with no upper bound → submittable as 9 999 999 999 and ends up on the leaderboard.
- Fix: `Field(ge=0, le=9999)` and `Field(ge=0, le=999)`.

### Middleware / Services / Config

**B-14 Per-request DB hit for user lookup — Medium (perf)**
- `app/middleware/auth.py:11-27`
- `get_current_user` hits the DB on every authenticated request. If the JWT payload already carries the needed claims, the DB read is redundant unless account deletion must propagate immediately.
- Fix: request-scoped cache, or trust claims for most endpoints.

**B-15 Empty `CORS_ORIGINS` silently disables CORS — Low**
- `app/config.py:20-25`
- Missing env var produces an empty list → browser requests fail silently with vague CORS errors.
- Fix: require non-empty in production mode (guard on `auto_create_tables=False`) or supply a sensible default.

### Tests

**B-16 Missing coverage: score submit for non-COMPLETED session — Low**
- No direct test asserts the 4xx path in `leaderboard_service.py:55` (status != COMPLETED). A refactor can silently break it.
- Fix: add `test_submit_score_for_active_session_rejected`.

---

## Frontend

### Engine / Composables

**F-1 RAF cleanup race in `useGameLoop` — High**
- `composables/useGameLoop.ts:~86`
- RAF is cancelled on `onUnmounted`, but navigating away while a WAVE_END network call is in flight can leave one more frame queued after Game destruction.
- Fix: cancel RAF *before* flipping `_running` in `Game.stop()`, and guard the RAF callback with the same flag.

**F-2 Stale `pendingLevel` in `useSessionSync` — Medium**
- `composables/useSessionSync.ts:74-80`
- Set on `LEVEL_START`, never cleared if the player leaves the game view before any `WAVE_END`. A subsequent session-create with a failing network reuses the stale level.
- Fix: clear `pendingLevel` on both `endSession` success and composable teardown.

**F-3 Type narrowing via loose assertion — Medium**
- `composables/useGameLoop.ts:64-65`
- Guard `typeof tower === 'object' && 'id' in tower` then `as Tower`. An object with numeric `id` passes and propagates into the store.
- Fix: also check `typeof tower.id === 'string'` (or pull a strict type guard).

**F-4 Event listener discipline across Systems — High**
- e.g., `systems/CombatSystem.ts:27-70`
- `init()` re-subscribes to EventBus; it must call `destroy()` first. Do the same audit for `MovementSystem`, `WaveSystem`, `TowerPlacementSystem`, `BuffSystem`, `EconomySystem`. Any System that omits the leading `destroy()` leaks handlers on HMR / remount.
- Fix: unify via a base class or a `reinit()` helper that guarantees clear-then-subscribe.

### Systems / Domain Logic

**F-5 `SplitSlimePolicy` silently no-ops when `pathFunction` is null — Medium**
- `domain/combat/SplitSlimePolicy.ts:29`; caller `systems/CombatSystem.ts:~277`
- Returning `[]` produces a visually “dead” slime with no children. The caller doesn’t log/handle it.
- Fix: log a warning, or treat null pathFunction as an invariant violation and ensure it's always set before enemies can split.

**F-6 Tower `params` cast to `Record<string, number>` without validation — Low**
- Many call sites (e.g., `CombatSystem.ts:160,189,210,228`, `BuffSystem.ts:69`)
- If `TowerFactory` ever forgets a param the cast silently yields `undefined` and arithmetic downstream becomes `NaN`.
- Fix: add `getParam(tower, key, fallback)` helper with a runtime check.

### Stores / UI State

**F-7 Modal callback exceptions can strand the overlay — Medium**
- `stores/uiStore.ts:44-56`
- If the modal callback throws (e.g., `router.push` rejected), the modal is re-opened on top of itself.
- Fix: catch callback errors, clear modal state first, then show error modal.

**F-8 `authStore.logout()` + route transition race — Medium**
- Symptom of F-7: 401-triggered logout during a modal leaves the user unable to dismiss either.
- Fix: serialize modal close → navigate → toast, in a single awaited chain.

### Services / API

**F-9 401 handling races with existing modal — Medium**
- `services/api.ts:45-52`
- Dynamically imports `authStore` and calls `logout()`. If a modal is already up, the new one may be hidden behind it (z-index / stacking).
- Fix: queue logout until `uiStore.modalVisible` goes false, or force-close before opening the new modal.

**F-10 Missing token refresh on session-create retry — High**
- `composables/useSessionSync.ts:72-80`
- If create fails and we retry after `authStore.init()`, an expired token is still used (no `/refresh` endpoint exists backend-side).
- Fix: either surface the failure immediately as a logout, or add a refresh endpoint and call it before retry.

### Components (Game UI)

**F-11 `BuildPanel` stale state on rapid tower swap — Medium**
- `components/game/BuildPanel.vue:50-66`
- `watch(tower, ..., { immediate: true })` assigns `localParams`, but interim slider edits persist when the selection changes without a submit. New tower inherits previous params briefly.
- Fix: reset `localParams` on selection change before binding; derive initial values from a `computed` over `tower.value`.

**F-12 Buff card double-click → double gold deduction — Medium**
- `components/game/BuffCardPanel.vue`
- No guard between click and `BUFF_RESULT`; a fast double-click dispatches two `BUFF_CARD_SELECTED` events.
- Fix: `selectingCardId` ref blocks further selections until result fires (or 2s timeout).

**F-13 `BuildPanel` null-deref on computed tower — High**
- `components/game/BuildPanel.vue:~63`
- `tower.value` can be null; the watch body uses `t.type` without an early return after destructuring.
- Fix: `if (!t) return;` at the top of the watch callback.

### Views

**F-14 Leaderboard `:key` uses index — Medium**
- `views/LeaderboardView.vue:~78`
- `:key="${e.rank}-${idx}"` collides on ties — Vue reuses DOM in the wrong slot.
- Fix: `:key` from `${e.username}-${e.level}-${e.score}` (or a stable backend id).

**F-15 Canvas has no accessible name — Low (a11y)**
- `views/GameView.vue:~58`
- `role="img"` + `aria-label="..."` would at least announce it.

**F-16 Modal persists across route changes — Medium**
- `components/common/Modal.vue` + `uiStore`
- Browser back / manual `router.push` doesn’t close the modal; overlay can stick on the next view.
- Fix: global `router.beforeEach` that closes any modal.

### Math / WASM

**F-17 `fourierComposite` JS fallback can `NaN` — Low**
- `math/WasmBridge.ts:150-152`
- Only sums the first 3 hardcoded terms; out-of-range `amps[i]/freqs[i]` produce NaN.
- Fix: bounds-check `amps[i] && freqs[i]` before each term; iterate `min(amps.length, freqs.length)`.

**F-18 `PathEvaluator.validatePath` doesn’t try/catch — Low**
- `math/PathEvaluator.ts:~129`
- Checks `isFinite(y)` and y bounds but does not wrap the function call. A future user-supplied expression (e.g., `1/x`) can throw during iteration.
- Fix: wrap in try/catch and treat exceptions as invalid.

### Tests

**F-19 `useSessionSync.test.ts` missing error scenarios — Medium**
- Transient-failure retry is covered, but not: (a) `MAX_CREATE_RETRIES` exhaustion; (b) 401 during `WAVE_END` sync (should stop, not retry); (c) `endSession` network failure carried to next end.
- Fix: add these cases; they directly protect bug 3.2’s original regression.

**F-20 `BuffSystem` curse branch untested — Low**
- `systems/__tests__/BuffSystem.test.ts`
- Curse path on insufficient gold silently returns and is not asserted.

### UI / UX Observations (Nits)

- **Hardcoded Chinese copy** across views — acceptable today, but blocks i18n later.
- **Disabled states** — verify menu / build buttons visually distinguish “insufficient gold” vs “wrong phase” (different cursors and tooltips).
- **Mobile / small viewport** — the game canvas uses fixed coordinates; the HUD may clip below 1024 px width.
- **Focus management** — modals don’t trap focus; Tab escapes the dialog.

---

## Cross-Cutting Observations

1. **Idempotency contract** — Both `POST /sessions/{id}/end` (B-11) and the frontend’s retry logic (F-10, F-19) diverge on what “already ended” means. Decide one: 200 with the cached result, or 409 and let the client treat it as success. Align both sides.
2. **Authorization layering** — Backend enforces ownership in services but the `get_active_session` router skips the service (B-10); frontend assumes auto-logout on any 401 (F-9, F-10). A quick review pass to ensure every mutating endpoint goes through a service method would remove the class.
3. **Timezone discipline** — B-1 (naive vs aware) will matter the moment SQLite is swapped for Postgres. Fix before deploy.
4. **Event plumbing** — On the backend, domain events are stored on the aggregate and cleared *after* commit (B-5). On the frontend, system listeners rely on disciplined `destroy()` calls before re-`init()` (F-4). Both are the same shape of bug: out-of-band state tied to object lifetimes. Consider dedicated dispatchers.

---

## Priority Fix List

1. Make leaderboard submission atomic and gate the public entry point (B-3).
2. Split the `query_ranked` path so global rank doesn’t scan the table (B-7).
3. Narrow the `IntegrityError` retry in `create_session` (B-4).
4. Move domain-event emission past commit cleanly (B-5).
5. Fix RAF / System listener lifecycle (F-1, F-4).
6. Clear `pendingLevel` + define the retry contract end-to-end (F-2, F-10, F-19, B-11).
7. Tighten schemas (kills/waves bounds B-13; password policy B-12).
8. Leaderboard key collision + BuildPanel null-deref (F-13, F-14).
9. Modal lifecycle across routes + 401 path (F-7, F-8, F-9, F-16).
10. A11y + i18n readiness pass.
