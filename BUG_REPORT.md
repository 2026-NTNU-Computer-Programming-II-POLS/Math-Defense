# Math Defense — Bug Analysis Report

**Date:** 2026-04-06  
**Analyzed by:** Claude Code  
**Scope:** Full-stack (FastAPI backend, Vue 3 + TypeScript frontend, C/WASM math engine)

---

## CRITICAL (4 bugs)

> **Note on W1+W6+W11:** These three bugs together mean **WASM is entirely dead code**. The system silently falls back to JS for all math operations. The WASM module has likely never executed in the browser.

### W1 — WASM build output path wrong
- **File:** `wasm/Makefile:7`
- **Category:** Integration
- **Description:** Makefile outputs compiled WASM to `../src/wasm/math_engine.js` (resolves to repo root `src/wasm/`), not to `frontend/public/wasm/` or `frontend/src/wasm/`. The frontend can never find the build artifact.
- **Fix:** Change `OUT_DIR` to `../frontend/public/wasm` (served as static asset via `<script>`) or `../frontend/src/wasm` with a proper `import` in `WasmBridge.ts`.

### W6 — WASM never loads at runtime
- **File:** `frontend/src/math/WasmBridge.ts:14-29`
- **Category:** Integration
- **Description:** `initWasm()` checks `globalThis.createMathEngine`, but nothing places it there. Emscripten with `MODULARIZE=1` does not auto-attach to `globalThis`. WASM initialization always fails silently; the app falls back to JS.
- **Fix:** Either dynamically import the glue: `const { default: createMathEngine } = await import('../wasm/math_engine.js')`, or add a `<script>` in `index.html` to load the glue and assign `globalThis.createMathEngine`.

### W11 — `_malloc` / `_free` not in EXPORTED_FUNCTIONS
- **File:** `wasm/Makefile:9`
- **Category:** Integration / Memory safety
- **Description:** `WasmBridge.ts` calls `_module._malloc()` and `_module._free()` (lines 45, 49) for heap management, but neither is listed in the Makefile's `EXPORTED_FUNCTIONS`. With Emscripten 3.x+, they are not exported by default. At runtime `_module._malloc` would be `undefined`, crashing every `withFloatBuffers` call.
- **Fix:** Add `"_malloc","_free"` to `EXPORTED_FUNCTIONS` in the Makefile.

### B1 — Hardcoded JWT secret key
- **File:** `backend/app/config.py:8`
- **Category:** Security
- **Description:** Default `secret_key` is `"CHANGE_THIS_IN_PRODUCTION_PLEASE"`. If no `.env` is provided, all JWTs are signed with this well-known string. Any attacker can forge valid tokens for any user.
- **Fix:** Remove the default value so the app fails to start without a proper secret: `secret_key: str` (no default). Also rotate the key in `docker-compose.yml`.

---

## HIGH (7 bugs)

### B2 — 7-day token expiry with no revocation
- **File:** `backend/app/config.py:10`
- **Category:** Security
- **Description:** `access_token_expire_minutes = 60 * 24 * 7`. No refresh token, no revocation, no blocklist. A stolen token grants a full week of access with no way to revoke it.
- **Fix:** Reduce to 15–60 minutes and implement a refresh token flow, or add a token revocation mechanism.

### B3 — No validation on `SessionUpdate` allows cheating
- **File:** `backend/app/schemas/game_session.py:16-20`, `backend/app/routers/game_session.py:37-44`
- **Category:** Security / Data integrity
- **Description:** `gold`, `hp`, `score`, `current_wave` accept any value. A client can PATCH `{"score": 999999999, "gold": 999999999}` without restriction.
- **Fix:** Add `Field(ge=0)` or `field_validator` constraints on all `SessionUpdate` fields. Consider server-side game logic validation.

### B11 — `python-jose` unmaintained with known CVEs
- **File:** `backend/requirements.txt:7`
- **Category:** Security
- **Description:** `python-jose` has CVE-2024-33663 and CVE-2024-33664 (algorithm confusion / ECDSA bypass). The library is effectively unmaintained.
- **Fix:** Replace with `PyJWT` (actively maintained). API is nearly identical: `import jwt` instead of `from jose import jwt`.

### B13 — No rate limiting on auth endpoints
- **File:** `backend/app/routers/auth.py`
- **Category:** Security
- **Description:** `/register` and `/login` have no rate limiting. Enables password brute-force, account flooding, and CPU exhaustion via repeated bcrypt hashing.
- **Fix:** Add `slowapi` or custom middleware. Limit login attempts per IP and per username.

### F1 — Memory leak: InputManager event listeners never removed
- **File:** `frontend/src/composables/useGameLoop.ts:78-80`, `frontend/src/engine/InputManager.ts`
- **Category:** Memory leak
- **Description:** `onUnmounted` calls `game.value?.stop()` (cancels animation frame only). The four event listeners on `canvas` and `window` (click, mousemove, keydown, keyup) registered by `InputManager` are never removed. Each navigation to `/game` and back accumulates new listeners.
- **Fix:** In `onUnmounted`, also call `game.value?.input.destroy()` and `game.value?.eventBus.clear()`.

### F2 — Memory leak: EventBus listeners in `bindEngine` never unregistered
- **File:** `frontend/src/stores/gameStore.ts:40-55`
- **Category:** Memory leak
- **Description:** `bindEngine()` registers 7 EventBus listeners and discards the unsubscribe handles. If `bindEngine` is ever called twice on the same engine (or listeners survive a re-navigation), they accumulate. Duplicate `ENEMY_KILLED` listeners would double-count kills.
- **Fix:** Store unsubscribe handles and call them in an `unbindEngine()` method, or call `eventBus.clear()` on teardown.

### F17 — Auth state broken on page refresh
- **File:** `frontend/src/stores/authStore.ts:13-14`
- **Category:** Auth / State management
- **Description:** `token` is loaded from `localStorage` but `user` is initialized to `null`. `isLoggedIn` returns `true` while `user` is `null`. The menu shows `undefined` as username; authenticated API calls may use an expired token.
- **Fix:** On startup, if a token exists, call `authService.me()` to validate and populate the user; clear the token on failure. Alternatively persist the user object in `localStorage`.

---

## MEDIUM (21 bugs)

### B4 — `SessionEnd` score fields have no validation
- **File:** `backend/app/schemas/game_session.py:23-26`, `backend/app/routers/game_session.py:50-76`
- **Category:** Security / Data integrity
- **Description:** `score`, `kills`, `waves_survived` in `SessionEnd` accept negative or arbitrarily large values. This path bypasses the `ge=0` validation on the separate `POST /api/leaderboard` endpoint, enabling leaderboard manipulation.
- **Fix:** Add `Field(ge=0)` to all `SessionEnd` numeric fields.

### B5 — Double score submission allows duplicate leaderboard entries
- **File:** `backend/app/routers/game_session.py:64-73`, `backend/app/routers/leaderboard.py:42-59`
- **Category:** Data integrity
- **Description:** Ending a session via `POST /sessions/{id}/end` auto-creates a `LeaderboardEntry`. A user can also call `POST /api/leaderboard` directly for the same session. The `session_id` column has no unique constraint, allowing duplicates.
- **Fix:** Add a unique constraint on `session_id` in `LeaderboardEntry`. Validate that a session hasn't already been submitted in the standalone endpoint.

### B6 — Leaderboard rank calculation incorrect for ties and across pages
- **File:** `backend/app/routers/leaderboard.py:26-37`
- **Category:** Logic error
- **Description:** Rank is `(page - 1) * per_page + i + 1`. Tied players get different ranks by arbitrary DB ordering. Entries inserted/deleted between page requests cause ranks to shift.
- **Fix:** Use SQL `RANK()` or `DENSE_RANK()` window function. Add a secondary sort column (e.g., `created_at`) for deterministic ordering.

### B8 — No username sanitization
- **File:** `backend/app/schemas/auth.py:8-13`
- **Category:** Security
- **Description:** Only length (3–50) is checked. Usernames can contain `<script>` tags (XSS risk if rendered unsanitized), null bytes, or Unicode homoglyphs for impersonation.
- **Fix:** Add regex: `if not re.match(r'^[a-zA-Z0-9_-]+$', v): raise ValueError(...)`.

### B10 — No max password length — bcrypt DoS
- **File:** `backend/app/utils/security.py:11`, `backend/app/schemas/auth.py:15-18`
- **Category:** Security / Performance
- **Description:** No maximum password length. Sending multi-megabyte passwords to `/register` or `/login` can exhaust CPU and memory.
- **Fix:** Add `if len(v) > 128: raise ValueError("密碼過長")` in the password validator.

### B12 — `passlib` unmaintained
- **File:** `backend/requirements.txt:8`
- **Category:** Security
- **Description:** `passlib 1.7.4` has not been updated since 2020. Generates deprecation warnings with newer Python/bcrypt versions.
- **Fix:** Use the `bcrypt` package directly, or switch to `passlib-plus` if available.

### B14 — No database indexes on frequently queried columns
- **File:** `backend/app/models/leaderboard.py:13-14`, `backend/app/models/game_session.py:12`
- **Category:** Performance
- **Description:** `LeaderboardEntry.user_id`, `.level`, `.score` and `GameSession.user_id` have no indexes. Leaderboard queries filter by `level` and sort by `score desc` without indexes. Degrades significantly at scale.
- **Fix:** Add `index=True` to `user_id`, `level`, and `score` on `LeaderboardEntry`, and `user_id` on `GameSession`.

### B16 — SQLite in Docker with no volume mount
- **File:** `backend/app/config.py:7`, `backend/app/db/database.py:5-8`
- **Category:** Data integrity / Reliability
- **Description:** Default database is `sqlite:///./math_defense.db` inside the container. Data is lost on every container restart. SQLite also handles concurrent writes poorly.
- **Fix:** Add a Docker volume for the DB file. Document that a proper DB URL should be provided for production.

### B17 — `create_all()` used instead of Alembic migrations
- **File:** `backend/app/db/database.py:25-27`, `backend/app/main.py:11`
- **Category:** Data integrity
- **Description:** `Base.metadata.create_all()` runs on every startup. It only creates missing tables — never applies schema changes. `alembic` is in `requirements.txt` but unused. Model changes silently fail to apply.
- **Fix:** Set up and use Alembic migrations. Remove `create_all()` from lifespan (keep for dev/test only).

### B20 — `session_id` not validated in leaderboard submission
- **File:** `backend/app/routers/leaderboard.py:42-59`
- **Category:** Data integrity
- **Description:** The `POST /api/leaderboard` endpoint accepts a `session_id` without checking it exists, belongs to the current user, or is completed. FK violations produce unhandled 500 errors instead of proper 400/404.
- **Fix:** Validate session existence, ownership, and status before accepting submission. Catch `IntegrityError` and return a proper error response.

### B23 — Zero logging in the entire backend
- **File:** All backend files
- **Category:** Security / Operational
- **Description:** Failed logins, registrations, score submissions, and errors are all silent. Impossible to detect attacks, debug production issues, or audit suspicious activity.
- **Fix:** Add structured logging (`logging` module) for auth events, errors, and important state changes.

### F4 — Phase state machine bypassed in `startLevel`
- **File:** `frontend/src/engine/Game.ts:147-159`
- **Category:** Logic error / State management
- **Description:** `startLevel()` calls `this.phase.forceTransition(GamePhase.BUILD)`, bypassing the state machine's `MENU -> LEVEL_SELECT -> BUILD` path. The state machine's validation is entirely circumvented.
- **Fix:** Add `BUILD` as a valid transition from `MENU` in the state machine, or route through `LEVEL_SELECT` first.

### F5 — Modal callback ordering fragile
- **File:** `frontend/src/stores/uiStore.ts:40-44`
- **Category:** Logic error
- **Description:** `closeModal()` sets `modalVisible = false`, then calls `modalCallback.value?.()`, then nulls it. If the callback opens a new modal, `modalCallback.value = null` immediately clears the new callback.
- **Fix:** Capture the callback locally, null it first, set visible to false, then call the captured callback.

### F6 — Gold can go negative
- **File:** `frontend/src/engine/Game.ts:123`
- **Category:** Logic error
- **Description:** `changeGold(amount)` does `this.state.gold += amount` without clamping. Under concurrent events (check-then-deduct race), gold can go negative.
- **Fix:** Use `this.state.gold = Math.max(0, this.state.gold + amount)`.

### F7 — Buff revert accumulates float precision errors
- **File:** `frontend/src/systems/BuffSystem.ts:21-32`
- **Category:** Logic error / Math error
- **Description:** Buff apply/revert uses multiply/divide pairs (e.g., `*= 1.5` then `/= 1.5`). Due to IEEE 754, `x * 1.5 / 1.5 !== x` in many cases. After several buff cycles, `effectiveDamage` drifts from intended value.
- **Fix:** Track base value and total multiplier separately; recalculate `effectiveDamage = baseDamage * totalMultiplier` on each change.

### F9 — BuffCardPanel reads non-reactive engine data
- **File:** `frontend/src/components/game/BuffCardPanel.vue:9-14`
- **Category:** State management / Reactivity
- **Description:** The component accesses `gameStore.getEngine()?.getSystem('buff')` and reads `currentCards` — a plain array on `BuffSystem`, not a Vue ref. Vue won't track mutations. Cards may not update in the UI when drawn.
- **Fix:** Have `BuffSystem` emit events that update a reactive store property, or use `shallowRef` with manual triggers.

### F14 — `WAVE_START` emitted before phase transition
- **File:** `frontend/src/engine/Game.ts:161-167`
- **Category:** Logic error / Race condition
- **Description:** `startWave()` emits `WAVE_START` before calling `setPhase(WAVE)`. BuffSystem (and other listeners) tick during `WAVE_START` while the phase is still `BUILD`. Any system that checks `game.state.phase` on this event will see stale state.
- **Fix:** Document this ordering explicitly, or transition the phase first and then emit.

### F21 — Upgraded function cannon has no UI or preview support
- **File:** `frontend/src/systems/TowerPlacementSystem.ts:88-91`, `frontend/src/data/ui-defs.ts:52-56`
- **Category:** Logic error / Missing feature
- **Description:** At level 2, `CombatSystem` uses the quadratic formula (`ax²+bx+c`), but the BUILD phase preview and `BuildPanel` always render/expose the linear formula (`mx+b`). The player cannot set quadratic parameters, and the preview doesn't match actual attack trajectory.
- **Fix:** Check `tower.level >= 2` in the preview renderer and `BuildPanel` field selection; use `FUNCTION_CANNON_UPGRADED_FIELDS` accordingly.

### F24 — Split slime has no split logic
- **File:** `frontend/src/data/enemy-defs.ts:47`, `frontend/src/systems/MovementSystem.ts`
- **Category:** Missing feature
- **Description:** `SPLIT_SLIME` is defined and used in level waves but no system handles splitting it into smaller copies when killed. It behaves as a normal slime.
- **Fix:** Implement split logic in `CombatSystem._dealDamage` or mark as TODO with a comment.

### F25 — Boss dragon BOSS_SHIELD phase not implemented
- **File:** `frontend/src/data/level-defs.ts:88`, `frontend/src/engine/PhaseStateMachine.ts`
- **Category:** Missing feature
- **Description:** Level 4's last wave spawns `BOSS_DRAGON`. `PhaseStateMachine` defines a `BOSS_SHIELD` phase and `GameEvents` defines `BOSS_SHIELD_START/ATTEMPT/END`, but no system triggers them or implements the Fourier shield-breaking mechanic. The boss is a high-HP normal enemy.
- **Fix:** Implement a `BossSystem` or add boss logic to `WaveSystem`/`CombatSystem`.

### W10 — Docker frontend `npm install` runs on every container start
- **File:** `docker-compose.yml:24`
- **Category:** Configuration / Performance
- **Description:** `command: sh -c "npm install && npm run dev -- --host 0.0.0.0"` reinstalls all packages on every start. On Windows hosts, Linux `node_modules` are written back to the bind-mounted volume, causing platform conflicts.
- **Fix:** Use a named volume for `node_modules` to isolate from the host: add `frontend_node_modules:/app/node_modules` to volumes. Or use a multi-stage Dockerfile.

---

## LOW (17 bugs)

### B7 — Leaderboard GET exposes all usernames (no auth)
- **File:** `backend/app/routers/leaderboard.py:12-39`
- **Category:** Security (minor)
- **Description:** `GET /api/leaderboard` is unauthenticated, exposing all usernames publicly. Likely intentional for a public leaderboard, but worth noting if PII is present.
- **Fix:** Add `Depends(get_current_user)` if the leaderboard should be private.

### B9 — No password strength requirements beyond minimum length
- **File:** `backend/app/schemas/auth.py:15-18`
- **Category:** Security
- **Description:** Only a minimum length of 6 is enforced. `"aaaaaa"` and `"123456"` are accepted.
- **Fix:** Add complexity requirements or at minimum increase minimum length to 8.

### B15 — CORS allows all methods and headers
- **File:** `backend/app/main.py:27-28`
- **Category:** Security
- **Description:** `allow_methods=["*"]` and `allow_headers=["*"]` are overly permissive. While origins are restricted, this maximizes attack surface if any origin is carelessly added.
- **Fix:** Restrict to `["GET", "POST", "PATCH", "OPTIONS"]` and `["Authorization", "Content-Type"]`.

### B21 — Abandoned sessions never cleaned up
- **File:** `backend/app/models/game_session.py`, `backend/app/routers/game_session.py`
- **Category:** Logic error / Data integrity
- **Description:** No mechanism transitions sessions to "abandoned" status. Browser-closed sessions remain "active" forever. No limit on concurrent active sessions per user.
- **Fix:** Add a background task to mark stale sessions (e.g., active for >2 hours) as abandoned. Limit one active session per user.

### B22 — Internal user ID exposed in token response
- **File:** `backend/app/routers/auth.py:22-23, 32-33`
- **Category:** Security (minor)
- **Description:** `TokenResponse` includes the UUID `user_id`. While UUIDs are non-sequential, exposing internal IDs is unnecessary.
- **Fix:** Omit `user_id` from the response if the frontend doesn't need it.

### F3 — Memory leak: useGameLoop EventBus listeners never removed
- **File:** `frontend/src/composables/useGameLoop.ts:47-71`
- **Category:** Memory leak
- **Description:** Three `eventBus.on()` calls in `onMounted` (LEVEL_START, TOWER_SELECTED, TOWER_PLACED) don't store unsubscribe handles. They persist on the EventBus until the engine is garbage collected.
- **Fix:** Store handles and call them in `onUnmounted`.

### F8 — Variable shadowing in BuffSystem revert
- **File:** `frontend/src/systems/BuffSystem.ts:40-46`
- **Category:** Code quality
- **Description:** `const t = g.towers.find((t) => t.id === buff._targetTowerId)` — inner `t` in arrow function shadows outer `t`. Linters would flag this.
- **Fix:** Rename inner parameter: `(tower) => tower.id === buff._targetTowerId`.

### F11 — Integral cannon ignores negative curve regions
- **File:** `frontend/src/systems/CombatSystem.ts:141-154`
- **Category:** Logic error
- **Description:** `if (enemy.y >= 0 && enemy.y <= curveY)` skips enemies when `curveY < 0` (parabola dips below x-axis). Tower becomes useless in those zones, inconsistent with what the integral area renderer shows.
- **Fix:** Use `Math.abs` bounds or document this as intentional game design.

### F12 — Projectile bounds check uses magic numbers
- **File:** `frontend/src/systems/CombatSystem.ts:57`
- **Category:** Maintenance
- **Description:** `if (proj.x < -5 || proj.x > 30 || proj.y < -5 || proj.y > 20)` hardcodes bounds instead of deriving from `GRID_MIN_X` etc. The y-max of 20 is much larger than the grid's 14, wasting frames.
- **Fix:** Use `GRID_MIN_X - 2`, `GRID_MAX_X + 5`, etc.

### F13 — First enemy spawns immediately with zero delay
- **File:** `frontend/src/systems/WaveSystem.ts:33`
- **Category:** Logic error
- **Description:** `_spawnTimer` starts at 0, so the first enemy spawns on the first `update()` tick with no preparation time for the player.
- **Fix:** Initialize `_spawnTimer = this._spawnInterval`.

### F15 — Auth error not cleared when toggling login/register
- **File:** `frontend/src/views/AuthView.vue:51`
- **Category:** UX bug
- **Description:** `error` ref retains stale message when switching between login and register modes.
- **Fix:** Clear `error.value = ''` in the toggle handler.

### F16 — Leaderboard pagination not exposed in UI
- **File:** `frontend/src/views/LeaderboardView.vue`, `frontend/src/composables/useLeaderboard.ts`
- **Category:** Missing feature
- **Description:** `useLeaderboard.fetch()` and the API both support pagination, but the UI has no pagination controls. The `total` ref is populated but never rendered. Only the first 20 entries are ever shown.
- **Fix:** Add pagination UI controls or increase `perPage` to cover all entries.

### F19 — Renderer does not restore `globalAlpha` on exception
- **File:** `frontend/src/engine/Renderer.ts:156-179`
- **Category:** Rendering bug
- **Description:** `drawIntegralArea` and `drawSector` set `ctx.globalAlpha = 0.3` and reset to 1.0 at the end, but not inside a `try/finally`. An exception mid-render would leave `globalAlpha` at 0.3 for all subsequent rendering.
- **Fix:** Wrap `globalAlpha` changes in `try/finally`.

### F22 — HUD CSS `margin-left: auto` conflict
- **File:** `frontend/src/components/game/HUD.vue:104-105`
- **Category:** CSS / Rendering
- **Description:** Both `.score-item` and `.path-item` have `margin-left: auto` in a flex row. Only the first one gets pushed right; the score won't be right-aligned as intended when `pathExpression` is non-empty.
- **Fix:** Apply `margin-left: auto` only to `.score-item`, or wrap both in a right-aligned container.

### F27 — Game loop creates new closure every frame
- **File:** `frontend/src/engine/Game.ts:202`
- **Category:** Performance
- **Description:** `requestAnimationFrame(() => this._loop())` creates a new arrow function 60 times per second, generating unnecessary garbage.
- **Fix:** Bind once in constructor: `this._boundLoop = this._loop.bind(this)`, then use `requestAnimationFrame(this._boundLoop)`.

### W5 — `numerical_integrate` silently clamps negative values instead of using `|f(x)|`
- **File:** `wasm/math_engine.c:137`
- **Category:** Logic error / Math error
- **Description:** `if (y < 0) y = 0` clamps before integration, then `fabsf()` is applied again. This does not compute a correct area between curve and x-axis (correct would be `y = fabsf(y)`) nor a true definite integral (would remove both). The JS fallback in `WasmBridge.ts:122` replicates the same error.
- **Fix:** If computing area: use `y = fabsf(y)`. If computing definite integral: remove both the clamp and `fabsf`. Document the intent.

### W8 — `point_in_sector` angle comparison not epsilon-safe
- **File:** `wasm/math_engine.c:100-112`
- **Category:** Numerical instability
- **Description:** `atan2f` result compared with exact `>=`/`<=` against computed boundaries. A point exactly on the sector edge may be misclassified due to float rounding. The JS fallback in `WasmBridge.ts:99-105` has the same issue.
- **Fix:** Add small epsilon: `angle >= start - eps && angle <= end + eps`.

---

## Summary Table

| Severity | Count | Key areas |
|----------|-------|-----------|
| Critical | 4 | WASM dead (3), hardcoded JWT secret |
| High | 7 | No rate limit, client-side cheating, memory leaks, broken auth on refresh, vulnerable libs |
| Medium | 21 | Missing validation, float drift, reactivity gaps, unimplemented features |
| Low | 17 | UX, CSS, minor security, maintenance |
| **Total** | **49** | |

---

## Recommended Fix Order

1. **W1, W6, W11** — Fix WASM integration (output path, globalThis loading, malloc/free export)
2. **B1** — Replace hardcoded secret key
3. **F1, F2, F3** — Fix memory leaks (event listener cleanup)
4. **F17** — Fix auth state on page refresh
5. **B3, B4, B5** — Add server-side game state validation to prevent cheating
6. **B11, B12** — Replace unmaintained auth libraries (`python-jose` → `PyJWT`, review `passlib`)
7. **B13** — Add rate limiting to auth endpoints
8. **F7** — Fix buff float precision drift
9. **F9** — Make BuffCardPanel reactive
10. **F21** — Add quadratic mode UI/preview for upgraded function cannon
