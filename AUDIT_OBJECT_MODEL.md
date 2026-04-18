# Math Defense — Audit Object Model

> **Generated:** 2026-04-18
> **Scope:** Whole project (`backend/`, `frontend/`, `wasm/`, `shared/`, `docker-compose*`, `nginx*`, CI).
> **Method:** 6 specialised audit agents ran in parallel against disjoint surfaces; this document folds their findings into one **Object Model** — every first-class object/component in the system is listed with (a) its declared responsibility, (b) collaborators, and (c) every defect found inside it.
> **Severity scale:** `CRITICAL` (data loss / RCE / auth bypass) · `HIGH` · `MEDIUM` · `LOW`.

---

## 0. Severity Roll-up

| # | Severity | Count | Surfaces |
|---|----------|-------|----------|
| 1 | CRITICAL | **6**  | Secrets in repo, division-by-zero, state corruption (×2), domain-event tx coupling, list-key collision |
| 2 | HIGH     | **13** | JWT iat/aud/iss, token denylist TOCTOU, login-guard race, wave-spawn race, missing strategy crash, prod/dev compose drift, Fourier aliasing, signed/unsigned UB, anemic aggregate, mapper drift, session sync race, etc. |
| 3 | MEDIUM   | **27** | Numerical edge cases, Pinia mutation patterns, CORS duplication, datetime tz drift, etc. |
| 4 | LOW      | **17** | Docs/positive findings/hardening hints |

Numbers are agent-reported; some overlap removed during synthesis.

---

## 1. System Context (Top-Level Object Map)

```
┌─────────────────────────────────────────────────────────────────────┐
│                          User (Browser)                              │
└───────────────┬─────────────────────────────────────────────────────┘
                │ HTTPS
┌───────────────▼─────────────────────────────────────────────────────┐
│  Nginx  (nginx.conf / nginx-tls.conf)                                │
│   - TLS terminator · CORS gate · SPA static host · /api proxy        │
└───────────────┬─────────────────────────────────────────────────────┘
                │
       ┌────────┴────────┐
       ▼                 ▼
┌────────────┐   ┌──────────────────────────────────────────────┐
│ Frontend   │   │ Backend  (FastAPI · DDD · PostgreSQL only)   │
│ Vue3 + TS  │   │  Routers → Application → Domain ← Infra      │
│ Pinia ECS  │   │                                              │
│ + WASM     │   └─────────┬────────────────────────────────────┘
└─────┬──────┘             │
      │                    ▼
      │            ┌────────────────┐
      │            │  PostgreSQL 16 │
      │            └────────────────┘
      ▼
┌──────────────────────────┐
│ wasm/math_engine.c       │  (path/integral/fourier/sector helpers)
└──────────────────────────┘
```

---

## 2. Backend Domain Layer

### 2.1 `domain.session.aggregate.GameSession` (Aggregate Root)
- **Responsibility:** State machine (CREATED → ACTIVE → COMPLETED|ABANDONED), invariant guard for `wave/gold/hp/score`, emits domain events.
- **Collaborators:** `value_objects` (Score/Level/SessionStatus/GameResult), `events.SessionCompleted/Created/...`, `repository.SessionRepository` (Protocol).
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | D-1 | MEDIUM | `domain/session/aggregate.py:107-137` | Validation logic *clamps silently* (defence-in-depth) but is **split across schema → service → aggregate**; future maintainer may strip aggregate clamps thinking schemas suffice. |
  | D-2 | MEDIUM | `domain/session/aggregate.py:70` + `infra/persistence/session_repository.py:110-118` | `_ensure_utc()` only called on **load**; save path doesn't normalise tz, mixed naive/aware rows possible despite `DateTime(timezone=True)`. |
  | D-3 | LOW | `aggregate.py:197-203` | Forbidden-transition matrix has no direct unit test — covered only indirectly by parametrised matrix in `test_coverage_gaps.py`. |

### 2.2 `domain.leaderboard.aggregate.LeaderboardEntry`
- **Responsibility:** Immutable record of a finished session ranked by score.
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | D-4 | MEDIUM | `domain/leaderboard/aggregate.py:10-58` | **Anemic aggregate.** Declares invariants in docstring (kills≥0, waves≥0) but enforces *none*. Construction with negative `kills` succeeds. Score guard lives in `Score` VO only. |

### 2.3 `domain.value_objects` (Score / Level / SessionStatus / GameResult)
- **Responsibility:** Self-validating primitives.
- **Findings:** Clean; only `Score` enforces non-negative.

### 2.4 `domain.session.events` + Domain-Event Dispatch
- **Responsibility:** Notify other contexts when session lifecycle changes.
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | D-5 | **CRITICAL** | `application/session_service.py:137-141` | `SessionCompleted` handler runs **inline inside the same transaction**. If the leaderboard insert raises, the session-completion commit is rolled back → orphan/duplicate handling depending on order. No outbox / post-commit dispatcher. |
  | D-6 | MEDIUM | `application/session_service.py:138` | `aggregate.clear_events()` is called **before** the handler completes; on handler failure the events are lost even if the user retries. |

### 2.5 Repository Protocols (`session/repository.py`, `leaderboard/repository.py`, `user/repository.py`)
- **Responsibility:** Structural interfaces; abstract persistence away from domain.
- **Findings:**
  | ID | Sev | File | Issue |
  |----|-----|------|-------|
  | D-7 | LOW | All repo protocols | Use `typing.Protocol` (structural). A mock omitting `save_all()` still type-checks. No conformance test. Convert to ABC or add a runtime check. |

---

## 3. Backend Application Layer

### 3.1 `application.session_service.SessionService`
- **Responsibility:** Use cases: create / update_progress / end / abandon. Wraps UoW.
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | A-1 | MEDIUM | `application/session_service.py:117, 160, 205-210` | **Stale-check logic duplicated across 3 methods** (`_get_session`, `end_session`, `get_active_for_user`). Drift inevitable. Extract `_ensure_not_stale_or_abandon()`. |

### 3.2 `application.leaderboard_service.LeaderboardService`
- **Responsibility:** submit_score / query_ranked use cases.
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | A-2 | MEDIUM | `application/leaderboard_service.py:45` + `infra/persistence/leaderboard_repository.py:92-103` | **`query_ranked()` returns raw `dict`s** — bypasses aggregate, leaks ORM shape into router. Should reconstruct `LeaderboardEntry` or define explicit DTO. |
  | A-3 | MEDIUM | `infra/persistence/leaderboard_repository.py:62-66` | Global vs per-level dense_rank decided by an `if level is not None` branch inside the same function — fragile. Split into `query_ranked_global()` / `query_ranked_by_level()`. |

### 3.3 `application.auth_service.AuthService`
- **Responsibility:** Register/login/logout/refresh; password hashing; token issuance.
- **Findings:** Strong (timing-attack neutral, dummy hash on missing user, bcrypt-12). See §4 for JWT defects in `utils/security.py`.

### 3.4 `application.mappers`
- **Responsibility:** ORM ↔ Aggregate translation.
- **Findings:** Bypassed by A-2 (raw dict path). Otherwise OK.

---

## 4. Backend Security Surface

### 4.1 `utils/security.create_access_token` / `decode_token`
- **Responsibility:** JWT issuance + verification.
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | S-1 | HIGH | `utils/security.py:17-21` | Missing `iat` claim. RFC 7519 §4.1.6 — impairs replay detection & forensics. |
  | S-2 | HIGH | `utils/security.py:24-28` + `auth_service.py:97-111` | Missing `aud`/`iss` validation → cross-service token reuse if secret ever shared. |
  | S-3 | MEDIUM | `utils/security.py:26` | `algorithms=[settings.algorithm]` is correct today, but no assertion on header `alg`; future broadening of the list re-opens alg-confusion. |

### 4.2 `infrastructure.token_denylist.TokenDenylist`
- **Responsibility:** Track revoked JWTs until natural expiry.
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | S-4 | HIGH | `infrastructure/token_denylist.py:32-48` | **TOCTOU + race.** `deny()` does `INSERT` then `DELETE WHERE expired`. `is_denied()` is an unlocked `SELECT`. A token mid-revocation can be observed as both denied and not-denied. |
  | S-5 | MEDIUM | same:34 | Cleanup piggy-backs on every write → DoS amplifier under logout spam. Move to scheduled job. |

### 4.3 `infrastructure.login_guard.LoginGuard`
- **Responsibility:** Lock account after N failed logins.
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | S-6 | HIGH | `infrastructure/login_guard.py:51-69` | **Lost-update race.** Read-modify-write of `failures` without `SELECT … FOR UPDATE`. Concurrent failed logins coalesce → MAX_ATTEMPTS × concurrency tries possible. Use atomic `UPDATE … failures = failures + 1`. |

### 4.4 `middleware/auth.py`, `routers/auth.py`, `limiter.py`, CORS in `main.py`
- **Findings (positive):** `_get_real_client_ip` ignores `X-Forwarded-For` (good); CORS `allow_origins` non-wildcard with credentials (good); password policy strong (`schemas/auth.py:19-50`); IDOR protection enforced on all session endpoints.

---

## 5. Backend Infrastructure / Persistence

### 5.1 SQLAlchemy Repositories (`infrastructure/persistence/*.py`)
- **Findings:** See A-2/A-3/D-2 above.

### 5.2 `infrastructure.unit_of_work.UnitOfWork`
- **Findings:** See D-5/D-6 (event clearing before commit).

### 5.3 `seed.ensure_demo_user`
- **Findings:**
  | ID | Sev | Issue |
  |----|-----|-------|
  | I-1 | LOW | `seed.py:28-46` runs *after* the migration advisory lock is released → race on multi-worker startup. Use `INSERT … ON CONFLICT DO NOTHING`. |

### 5.4 Pydantic Schemas
- **Findings:**
  | ID | Sev | Issue |
  |----|-----|-------|
  | I-2 | LOW | All `schemas/*.py` rely on Pydantic v2 default (`extra='ignore'`). Silent dropping of unknown fields hides client misuse. Set `model_config = ConfigDict(extra='forbid')` or `'allow'` explicitly. |

### 5.5 Alembic
- **Findings:** Chain intact (`aec17830bec5` → `b1f4e7a2c0d9`); both up/down implemented. No data migrations (correct, seed is in lifespan).

---

## 6. Frontend Engine (Game Core)

### 6.1 `engine.Game` (orchestrator)
- **Responsibility:** Instantiate Renderer/InputManager, register Systems, drive `update(dt)`, expose `startLevel()`.
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | E-1 | MEDIUM | `engine/Game.ts:162-174` | `startLevel()` re-creates state but **does not undo lingering buff effects** carried over from previous level (see E-2). |

### 6.2 `engine.GameState`
- **Responsibility:** Plain mutable record of `phase / hp / gold / wave / multipliers / disabledTowerType / shieldActive`.
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | E-2 | **CRITICAL** | `engine/GameState.ts:59` + `systems/MovementSystem.ts:32` | `enemySpeedMultiplier` not reset between levels if previous level ended before the curse-revert ran → next level inherits sped-up enemies. |
  | E-3 | LOW | `engine/GameState.ts:9-34` | All fields declared non-optional, but several systems use `?? fallback` patterns — type vs. runtime mismatch. |

### 6.3 `engine.EventBus`
- **Responsibility:** Typed pub/sub for `GameEvents`.
- **Findings:** Tests cover `once`/`off` re-entrancy. No defect found here.

### 6.4 `engine.PhaseStateMachine`
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | E-4 | MEDIUM | `engine/PhaseStateMachine.ts:19` | `LEVEL_END → BUILD` is permitted to allow retry, but any listener can short-circuit `LEVEL_SELECT` UX. Add an assertion in `Game.startLevel()` about caller's current phase. |

---

## 7. Frontend ECS Systems

### 7.1 `systems.CombatSystem`
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | E-5 | **CRITICAL** | `systems/CombatSystem.ts:185-186` | `len = sqrt(dx²+dy²)` may be 0 when an intersection coincides with the tower (post-rounding). The `if (len===0) continue` *can be reached by every intersection* → tower silently fires nothing. Filter intersections at distance > ε before velocity computation. |
  | E-6 | LOW | `systems/CombatSystem.ts:125-155` | Projectile has no max-age; an out-of-grid projectile lives forever. |

### 7.2 `systems.WaveSystem`
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | E-7 | HIGH | `systems/WaveSystem.ts:47-64` | Spawn-then-check ordering allows the *final* enemy to spawn after the wave-end condition has effectively held; combined with `SplitSlimePolicy` children spawned in the same tick this can leak combat into BUFF_SELECT. Split into spawn-phase / end-phase steps. |

### 7.3 `systems.BuffSystem`
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | E-8 | **CRITICAL** | `systems/BuffSystem.ts:56-69` | `RANDOM_TOWER_RANGE_DIVIDE_1_3` revert silently no-ops if `_targetTowerId` was deleted → **state divergence**. A future tower reusing that id-slot inherits a phantom range bonus. Hook into tower-removal to force-revert. |
  | E-9 | HIGH | `systems/BuffSystem.ts:134-138` | `applyEffect` returns silently when `effectStrategies[effectId]` is missing — typos in defs lead to permanent broken state. Throw in `import.meta.env.DEV`. |

### 7.4 `systems.MovementSystem` / `EconomySystem` / `TowerPlacementSystem`
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | E-10 | MEDIUM | `systems/EconomySystem.ts:18-20` | Multiple bosses reaching origin in one frame: only the first triggers GAME_OVER; subsequent damage is idempotent. Document or guard. |
  | E-11 | MEDIUM | `systems/TowerPlacementSystem.ts:26, 86-91` | `_hoveredTower` never cleared on phase exit → ghost preview after WAVE→BUILD. |

### 7.5 `domain/combat/SplitSlimePolicy`
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | E-12 | MEDIUM | `domain/combat/SplitSlimePolicy.ts:14-16` | No `splitDepth` invariant; a future code change spawning SPLIT_SLIME children would explode exponentially. Add depth field + cap. |

### 7.6 `entities.EnemyFactory` / `TowerFactory`
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | E-13 | MEDIUM | `entities/EnemyFactory.ts:44` | `stealthRanges` assigned by reference from shared `ENEMY_DEFS`. Copy with `[...arr]` to prevent latent shared-mutable-state bug. |

---

## 8. Frontend View / State Layer

### 8.1 Pinia Stores (`gameStore`, `uiStore`, `authStore`)
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | V-1 | MEDIUM | `stores/uiStore.ts:87`, `stores/gameStore.ts:79-80` | Components mutate store state directly (`uiStore.selectedTowerType = null`) instead of via actions. Pinia devtools tracking & future invariants suffer. |
  | V-2 | MEDIUM | `stores/authStore.ts:30-44` | No client-side token-expiry probe — UI thinks user is logged in until first 401. |

### 8.2 `composables.useSessionSync`
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | V-3 | HIGH | `composables/useSessionSync.ts:107-130` | **Cross-level race.** `WAVE_END` handler captures snapshot but has no `sessionGeneration` guard; rapid level-switch can cause an `update()` against a stale `sessionId`, silently dropping final-wave score. |

### 8.3 `composables.useLeaderboard`
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | V-4 | MEDIUM | `composables/useLeaderboard.ts:32-37` | `loading.value = false` lives inside an early-return path; an aborted then non-aborted error sequence leaves `loading` stuck `true`. Move to `finally`. |

### 8.4 `views.LeaderboardView`
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | V-5 | **CRITICAL** | `views/LeaderboardView.vue:78` | `v-for :key` is `${username}-${level}-${score}-${waves}` — **not unique** when a player resubmits an identical result. Vue keeps stale DOM. Use server `id`. |

### 8.5 `services.api`
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | V-6 | MEDIUM | `services/api.ts:54-58` + `services/authService.ts:26-29` | Cookie-credentialed requests have **no CSRF token**. Add `X-CSRF-Token` header from a backend-set cookie. |
  | V-7 | LOW | `services/api.ts:28-92` | No retry/backoff for transient errors (only `useSessionSync` has retry). |

### 8.6 Components (Modal / AuthView / BuffCardPanel / BuildPanel)
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | V-8 | MEDIUM | `stores/authStore.ts:61-70` ↔ `useSessionSync.ts:153-156` | Re-entrant logout during in-flight WAVE_END can clear modal state before fallback can render. |
  | V-9 | LOW | `views/AuthView.vue:74-90` | `error.value` not cleared on subsequent `onPasswordInput`; stale validation message persists. |
  | V-10 | LOW | `components/common/Modal.vue:45-47` | Focus restore may target the wrong element when an error modal replaces the original. |
  | V-11 | LOW | `components/game/BuffCardPanel.vue:16-24` | 2-second wall-clock guard on selection rejects valid clicks if engine drops a `BUFF_RESULT`. |

### 8.7 Architectural / SoC observations
- **Findings:**
  | ID | Sev | File | Issue |
  |----|-----|------|-------|
  | V-12 | MEDIUM | `views/GameView.vue:31-45`, `components/game/BuildPanel.vue:77-88` | Score formatting (`toLocaleString` etc.) inlined in components — extract into `frontend/src/domain/formatters.ts`. |
  | V-13 | LOW | `composables/useAuth.ts`, `useLeaderboard.ts` | Composables call services directly; no command/query layer to add cross-cutting concerns later. |
  | V-14 | LOW | `engine/Game.ts:38-68` | EventBus listeners scattered across composables/stores/services with no central registry — implicit contract. |

---

## 9. Math / WASM / C Engine

### 9.1 `math/WasmBridge`
- **Responsibility:** RAII memory mgmt across JS↔WASM, JS-fallback parity.
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | W-1 | MEDIUM | `math/WasmBridge.ts:24-46` | `initWasm()` is async with no ready-gate; callers can invoke math fns before module loads → throws inside `withFloatBuffers`. Queue or synchronous error. |
  | W-2 | MEDIUM | `math/WasmBridge.ts:94-100` | Uses `getValue/setValue` (safe) but Makefile enables `ALLOW_MEMORY_GROWTH`; future inline `HEAPF32[ptr/4]` will dangle. Document invariant + add growth-test. |
  | W-3 | LOW | `math/WasmBridge.wasm.test.ts:105-106` | Parity epsilon `precision: 3` (0.5 %) too loose for integration; tighten to `5`. |

### 9.2 `wasm/math_engine.c`
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | W-4 | HIGH | `math_engine.c:199` | `fourier_match` uses fixed `dt = 2π/samples` with no Nyquist check → aliasing if `samples < 2·max(freq)`. Boss shield mini-game becomes unwinnable. |
  | W-5 | HIGH | `math_engine.c:63-66` | `floorf((x_end-x_start)*dir/step)` cast to `int` is implementation-defined when negative; mitigated today by clamp on next line — fragile. Extract helper + add reverse-range test. |
  | W-6 | MEDIUM | `math_engine.c:146` | If caller bypasses default and passes `n=0` directly, `h = inf`; downstream `sum * h / 2` becomes ±Inf silently. Validate at entry. |
  | W-7 | MEDIUM | `math_engine.c:114-127` | `point_in_sector` does not clamp `angle_width` to `[0, 2π]`; widths > 2π wrap once instead of multi-wrap; negative widths untested. |
  | W-8 | LOW | `math_engine.c:245-248` | Tangent-case epsilon `1e-6f` undocumented and untested at large radii. |

### 9.3 `math/MathUtils` / `math/PathEvaluator`
- **Findings:**
  | ID | Sev | File:line | Issue |
  |----|-----|-----------|-------|
  | W-9 | LOW | `math/MathUtils.ts:88-127` | Bisection iteration count hard-coded at 20; if `step` shrinks in future, error budget no longer satisfied. |
  | W-10 | LOW | `math/PathEvaluator.ts:76-92` | Piecewise continuity achieved by rounding `b2` to 1 dp → potential 0.1-unit visual jump; rounding only for display. |

---

## 10. Infrastructure / DevOps / Config

### 10.1 Secrets / `.env`
- **Findings:**
  | ID | Sev | File | Issue |
  |----|-----|------|-------|
  | I-3 | **CRITICAL** | `.env` (committed) | Real `SECRET_KEY` and `POSTGRES_PASSWORD` in repo despite `.gitignore` listing it. **Rotate every secret immediately, scrub git history.** |

### 10.2 Compose files
- **Findings:**
  | ID | Sev | File | Issue |
  |----|-----|------|-------|
  | I-4 | HIGH | `docker-compose.yml:50` vs `docker-compose.prod.yml:55-56` | Dev/prod diverge: dev exposes backend on `:8000`, prod hides behind nginx (correct), but **prod frontend has no healthcheck** → traffic to half-started nginx. |
  | I-5 | MEDIUM | `docker-compose.yml:12` | Postgres bound to `127.0.0.1:5432` (good for dev). Document intent; small change to `0.0.0.0` would be catastrophic. |

### 10.3 Nginx (`nginx.conf`, `nginx-tls.conf`)
- **Findings:**
  | ID | Sev | File | Issue |
  |----|-----|------|-------|
  | I-6 | MEDIUM | both | **No `gzip`, no `Cache-Control`** on hashed assets, no `expires -1` on `index.html`. |
  | I-7 | LOW | `nginx-tls.conf:30-31` | Cipher list `HIGH:!aNULL:!MD5` lacks `!eNULL:!EXPORT:!DES:!RC4:!PSK:!SRP`. HSTS/CSP/X-Frame-Options are correctly set. |
  | I-8 | LOW | both | **CORS implemented in nginx AND likely in FastAPI** → drift risk. Pick one source of truth. |

### 10.4 Frontend `Dockerfile` / `vite.config.ts`
- **Findings:**
  | ID | Sev | File | Issue |
  |----|-----|------|-------|
  | I-9 | MEDIUM | `frontend/Dockerfile:37-38` + `compose.prod.yml:58-60` | `envsubst` runs at container start; if `CORS_ORIGIN_*` envs missing, nginx config keeps literal `${VAR}` placeholders. Make substitution explicit at build *or* validate at start. |
  | I-10 | LOW | `vite.config.ts:14-19` | API proxy hard-codes `localhost:8000`; expose `VITE_API_TARGET`. |
  | I-11 | LOW | `vite.config.ts` | `build.sourcemap` not explicitly `false` — rely on default; pin it. |

### 10.5 Alembic / Requirements / CI
- **Findings:**
  | ID | Sev | File | Issue |
  |----|-----|------|-------|
  | I-12 | LOW | `backend/requirements.txt` | Versions pinned (good); consider `--require-hashes` for supply-chain hardening. CI already runs `pip-audit`. |
  | I-13 | LOW | `.github/workflows/ci.yml:22,46` | Hardcoded `changeme` Postgres password — acceptable for ephemeral CI but pulls into logs; promote to `${{ secrets.CI_DB_PASSWORD || 'changeme' }}`. |

### 10.6 `shared/game-constants.json`
- **Findings:**
  | ID | Sev | File | Issue |
  |----|-----|------|-------|
  | I-14 | MEDIUM | `shared/game-constants.json` | Single source of truth read by both Python (`json.load`) and TS, **no schema validation either side**. Drop a `.schema.json` + validate in both stacks (CI gate). |

---

## 11. Cross-cutting "Unclear Responsibility" Hotspots

| Hotspot | Symptoms | Recommendation |
|---------|----------|----------------|
| **Validation triple-layer** (`schema → service → aggregate.clamp`) | D-1 — bounds enforced in three places | Choose aggregate as authoritative; schemas only convert types; document. |
| **CORS** (nginx + FastAPI both) | I-8 | Make nginx the gate in prod; remove `CORSMiddleware` for `/api/*` in prod. |
| **Score formatting** in views | V-12 | Move to `domain/formatters.ts`. |
| **EventBus listeners** scattered | V-14 | One `event-handlers/` dir or registry table. |
| **Dict vs aggregate** in leaderboard read path | A-2 | Define `LeaderboardRow` DTO. |
| **Buff state ownership** between `BuffSystem` and `GameState` | E-2, E-8 | Centralise revert hooks; tower removal must notify BuffSystem. |
| **Domain events handled inline in transaction** | D-5, D-6 | Implement post-commit dispatcher / outbox. |

---

## 12. Top-12 Action List (Priority Ordered)

1. **`I-3` Rotate `.env` secrets, scrub git history.**  *(CRITICAL)*
2. **`E-5` Filter zero-distance intersections in `CombatSystem`.**  *(CRITICAL)*
3. **`E-2` Reset `enemySpeedMultiplier` on level start.**  *(CRITICAL)*
4. **`E-8` Force-revert tower-targeted buffs on tower delete.**  *(CRITICAL)*
5. **`D-5/D-6` Move domain-event dispatch to post-commit; stop clearing events pre-success.**  *(CRITICAL)*
6. **`V-5` Use server `id` as `v-for` key in `LeaderboardView`.**  *(CRITICAL)*
7. **`S-4 / S-6` Lock denylist + login-guard rows (or atomic `UPDATE`).** *(HIGH)*
8. **`S-1 / S-2` Add `iat`, `aud`, `iss` to JWT and validate.** *(HIGH)*
9. **`E-7` Reorder Wave spawn vs end check.** *(HIGH)*
10. **`V-3` Add `sessionGeneration` guard in `useSessionSync`.** *(HIGH)*
11. **`W-4` Validate Fourier sample count vs max frequency.** *(HIGH)*
12. **`I-4 / I-6 / I-9` Add frontend healthcheck, gzip + cache headers, fix `envsubst` timing.** *(HIGH)*

---

## 13. Audit Methodology Note

Six Explore agents ran in parallel, each scoped to a disjoint surface:

| Agent | Surface |
|-------|---------|
| Backend Security | `routers/`, `middleware/`, `utils/security.py`, `utils/integrity.py`, `limiter.py`, `infrastructure/login_guard.py`, `infrastructure/token_denylist.py`, `main.py` (CORS/wiring), `config.py`, security-relevant models/schemas |
| Backend DDD/Bugs | `domain/**`, `application/**`, `infrastructure/persistence/**`, `unit_of_work`, `models/**`, `schemas/**`, `db/`, `seed.py`, `alembic/**`, `tests/**` |
| Frontend Engine + ECS | `engine/**`, `systems/**`, `entities/**`, `domain/combat/**`, `data/**`, `renderers/**` |
| Frontend Vue / Pinia / Services | `App.vue`, `main.ts`, `views/**`, `components/**`, `stores/**`, `composables/**`, `services/**`, `router/**` |
| Math / WASM / C | `math/**`, `wasm/math_engine.c`, `wasm/Makefile` |
| Infra / DevOps / Config | `docker-compose*.yml`, both `Dockerfile`s, both nginx confs, `alembic.ini`/`env.py`, `requirements*.txt`, `frontend/package.json`, `vite.config.ts`, `tsconfig*.json`, `shared/game-constants.json`, `.env*`, `.gitignore`, `.github/**` |

All findings cite `file:line`; verify against current code before remediation (memory snapshots for this project are 4–13 days old).
