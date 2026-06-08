# Security & Systemic-Bug Audit

**Date:** 2026-05-09
**Scope:** Full repository — backend (FastAPI + SQLAlchemy/PostgreSQL), frontend (Vue 3 + TS), infrastructure (docker-compose, nginx, Dockerfiles)
**Method:** Six parallel sub-agents read source directly (no reliance on tests). Each was scoped to a non-overlapping concern; this document merges and de-duplicates their findings.

---

## Executive Summary

The codebase is in unusually good shape for application-level security: bcrypt with explicit 72-byte truncation, JWT with `alg`/`iss`/`aud`/`require` pinning + `pv` (password-version) invalidation + persistent JTI denylist, refresh-token rotation with reuse-detection family revocation, atomic per-account lockout, CSRF double-submit, fail-closed prod validators on `cookie_secure`/`csrf_enabled`/`debug`, Origin-checked spectator WebSockets, owner-scoped repository lookups (no IDOR on session/replay/reflection reads), and `extra="forbid"` Pydantic schemas. All `text()` calls are parameterised; no SQL injection was found. The DDD layering is clean (`domain/` has zero infrastructure imports; routers never call the DB directly).

The most impactful problems are not in the AuthN/AuthZ surface — they are in the **score-submission pipeline** (the "anti-cheat" verifies forged inputs against the same forged inputs) and in the **production deployment** (rate-limiting silently collapses to a single global bucket; the TLS nginx config never gets its environment variables substituted).

### Severity tally

| Sev | Count | Top items |
|---|---|---|
| **Critical** | **3** | Score-input forgery (C1), prod rate-limit collapse (C2), TLS nginx CORS broken in prod (C3) |
| **High** | **11** | Talent-reset race, achievement+assessment partial commit, refresh-CSRF bypass, CSP blocks WASM, WebSocket re-auth gap, repo ORM leak, invariant gaps, cost_total=0 path, unbounded `mfa_token`, login email-throttle dict growth, ranking endpoints leak student UUIDs |
| **Medium** | **18** | Logout silent revocation failure, no JWT denylist on password change, talent points budget hole, replay event whitelist not enforced, talent path injection, `change-password` cookie not cleared, etc. |
| **Low** | **17** | zxcvbn timing, bcrypt cost note, MFA token unbounded, `Email` VO under-used, etc. |

### Top 5 fix priorities

1. **C1 — Anti-cheat trusts forged inputs.** Drive `kill_value`/`cost_total`/`time_total`/`health_*` from the persisted `replay_events` log, not from the client-submitted JSON. Without this, every other anti-cheat invariant in `_verify_score` is decorative.
2. **C2 — Prod rate-limit is one global bucket.** Set `PROXY_MODE=true` + `TRUSTED_PROXY_IPS` in `docker-compose.prod.yml` so the limiter sees real client IPs. Without this, 10 logins/min is enforced **across the whole internet**.
3. **C3 — `nginx-tls.conf` is mounted as final config.** `${CORS_ORIGIN_*}` is never substituted in TLS deployments → all preflights 403. Move to `/etc/nginx/templates/default.conf.template`.
4. **H1/H2 — Score formula edge cases.** Forge `cost_total=0` to keep 70 % of the inflated `s1`; combined with C1 this seizes any Territory slot.
5. **H3 — Achievement + assessment + IA-accuracy run as separate UoWs.** Wrap them in a single transaction or persist a domain-events outbox row inside the session-end commit (the comment promising the outbox already exists in code).

---

## Critical

### C1 — Score-submission anti-cheat verifies forged inputs against forged inputs
**Category:** Missing server-validation / economy exploit
**Files:** `backend/app/schemas/game_session.py:110`, `backend/app/domain/session/aggregate.py:286-289`, `backend/app/application/session_service.py:478-542`, `backend/app/application/territory_service.py:217`

```python
# schemas/game_session.py:110
kill_value: int | None = Field(default=None, ge=0, le=SCORE_MAX)   # SCORE_MAX = 9_999_999

# session_service._verify_score (L492-542) — recomputes total_score
recomputed = recompute_total_score(
    kill_value=session.kill_value, time_total=session.time_total, ...
)
# every input is client-attacker-controlled; the tolerance check is symmetric
```

`kill_value`, `cost_total`, `time_total`, `health_origin`, `health_final`, `time_exclude_prepare`, and `initial_answer` are all client-supplied and only schema-bounded. The aggregate stores `max(0, kill_value)` and never cross-checks it against `kills` or per-level caps. With `kills=1, kill_value=9_999_999, cost_total=1, time_total=0.001, health_origin=health_final=100, initial_answer=true`, `recompute_total_score` yields `total_score ≈ 83 666` regardless of how few enemies were actually killed. The "strict" WASM/Python parity check (`shared/score_parity_fixtures.json`) only proves the formula is computed correctly on the inputs — it does not bind the inputs to legitimate gameplay.

`territory_service._validate_session` ranks by `total_score`, so a Star-1 slot can be seized by a forged session no honest player will beat. Replay-event ingestion exists (`MAX_EVENTS_PER_SESSION = 50_000`) and `_derive_waves_from_events` proves the server *can* derive scoring inputs from the event log — but `_verify_score` does not use it for the score itself.

**Fix:** Derive `kill_value` from `enemyKilled` events in the persisted replay log, `cost_total` from `goldSpent`, `health_*` from `hpDamage`, prepare-phase boundaries from `wavePrepareStart`/`waveStart`. Reject the submission if the client-supplied numbers diverge by more than the formula tolerance. Also enforce `kill_value <= LEVEL_MAX_SCORES[level]`.

### C2 — Production rate-limiting collapses to a single global bucket
**Category:** Rate-limit bypass / DoS
**File:** `backend/app/limiter.py:12-46`; absence of config in `docker-compose.prod.yml` and `.env.example`

```python
_PROXY_MODE = os.getenv("PROXY_MODE", "").lower() in ("true", "1", "yes")
_TRUSTED_PROXY_IPS: frozenset[str] = frozenset(
    ip.strip() for ip in os.getenv("TRUSTED_PROXY_IPS", "").split(",") if ip.strip()
)
...
if _PROXY_MODE and _TRUSTED_PROXY_IPS:
    ...
if request.client:
    return request.client.host    # behind nginx, always the nginx container IP
```

Neither compose file nor `.env.example` sets `PROXY_MODE`/`TRUSTED_PROXY_IPS`. Behind the bundled nginx, `request.client.host` is always the nginx container's docker-network IP, so every external client shares one bucket: 10 logins/min total **across the whole internet**. SECURITY.md asserts "Per-IP rate limits are enforced via slowapi" — false in the shipped prod config. Worse, one attacker's traffic locks out every legitimate user.

**Fix:** Add `PROXY_MODE=true` and `TRUSTED_PROXY_IPS=<frontend container IP / 172.x range>` to the backend service in `docker-compose.prod.yml`, plus the same to `.env.example` with a comment.

### C3 — `nginx-tls.conf` mounted as final config; `${CORS_ORIGIN_*}` never expanded
**Category:** CORS misconfiguration / availability
**Files:** `docker-compose.prod.yml:61-63`, `nginx-tls.conf:10-14`

```yaml
volumes:
  - ./nginx-tls.conf:/etc/nginx/conf.d/default.conf:ro
```
```nginx
map $http_origin $cors_origin {
    default                         "";
    "${CORS_ORIGIN_1}"              $http_origin;
```

The `nginxinc/nginx-unprivileged` entrypoint only runs `envsubst` on files under `/etc/nginx/templates/*.template` (the non-TLS `frontend/Dockerfile:37` does this correctly). By mounting `nginx-tls.conf` directly at `/etc/nginx/conf.d/default.conf`, nginx parses the literal string `"${CORS_ORIGIN_1}"`. The map then matches no real `Origin` header → `$cors_origin = ""` → preflight 403. CORS is **fully broken in TLS deployments**, and an operator's natural "fix" (`*` or echoing `$http_origin`) opens credentialed CORS to any site.

**Fix:** Mount as `/etc/nginx/templates/default.conf.template` so envsubst expands the variables before nginx parses the config, matching the non-TLS pattern.


2026-05-09 (fixed above)

---

## High

### H1 — `cost_total=0` keeps 70 % of inflated `s1`
**Category:** Score formula edge
**File:** `backend/app/domain/scoring/score_calculator.py:85-89`

```python
s2 = kill_value / cost_total if cost_total > 0 else 0.0
if s1 >= s2:
    k = 0.7 * s1 + 0.3 * s2          # cost_total=0 → k = 0.7*s1
```

Submitting `cost_total=0` should economically penalise (no towers built), but the formula collapses to `0.7·s1`. With abusive `kill_value` this is the fast path for C1.

**Fix:** Require `cost_total >= MIN_COST_PER_KILL × kills`; reject `cost_total = 0` when `kills > 0`.

### H2 — `talent_service.reset_tree` skips the user lock that `allocate_point` relies on
**Category:** TOCTOU / economy
**Files:** `backend/app/application/talent_service.py:98-103`, `backend/app/infrastructure/persistence/talent_repository.py:31-41`

```python
def reset_tree(self, user_id: str) -> dict:
    with self._uow:
        self._talent_repo.delete_by_user(user_id)   # no acquire_user_lock
        self._uow.commit()
```

`allocate_point` acquires `users.id FOR UPDATE`; `reset_tree` does not. Concurrent allocate + reset can interleave: allocate reads pre-reset allocations, reset deletes them, allocate inserts a fresh allocation row — the user keeps the points (`points_earned` is achievement-derived and never decremented) **and** the freshly allocated node, gaining a free point.

**Fix:** Call `self._talent_repo.acquire_user_lock(user_id)` at the top of the `reset_tree` UoW.

### H3 — Achievement-unlock side-effects run in separate UoWs; partial commits possible
**Category:** Atomicity / event-handler reliability
**File:** `backend/app/application/session_event_handlers.py:190-222`

```python
try: self.leaderboard(event)        # UoW #1
try: unlocked = self.achievement(event)   # UoW #2 (commits unlock rows)
try: self.assessment(event.user_id, unlocked)   # UoW #3
try: self.ia_accuracy(event)        # UoW #4
```

If `achievement` commits but `assessment` raises, the unlock is persisted but its competency Beta-evidence is lost. The COMPLETED-status retry path explicitly skips re-evaluating achievements, so a retry never heals it. Same hazard for `ia_accuracy`. Comments already plan an outbox table; it doesn't exist yet.

**Fix:** Persist `pending_events` to a `domain_events` outbox row inside the same UoW as the session save (TODO already at `session_service.py:347-353`), and dispatch from a worker.

### H4 — CSRF middleware skips when access cookie is absent — `/api/auth/refresh` unprotected
**Category:** CSRF
**File:** `backend/app/middleware/csrf.py:50-56`

```python
if (settings.csrf_enabled
    and request.method.upper() in _UNSAFE_METHODS
    and request.url.path not in _EXEMPT_PATHS
    and request.cookies.get(AUTH_COOKIE_NAME) is not None):
```

The CSRF gate only fires when the access cookie is present. After it expires (15 min) but the refresh cookie has not (longer TTL), `/api/auth/refresh` is unprotected. A cross-site form-submit POST consumes the victim's refresh token; the attacker can't read the response, but the rotation invalidates the previous token, forcing the legitimate user out — a forced-logout vector.

**Fix:** Enforce CSRF when *either* cookie is present, or set `SameSite=Strict` on the refresh cookie.

### H5 — CSP header blocks WebAssembly in production
**Category:** CSP / availability
**File:** `nginx.conf:61` (and HTML meta in `frontend/index.html:9`)

```
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ... worker-src 'self' blob:; ..." always;
```

The HTML meta CSP grants `script-src 'self' 'wasm-unsafe-eval'` and `connect-src 'self' ws: wss:`. The nginx CSP omits both. Browsers enforce the **intersection**: in production (a) `WebAssembly.instantiate()` in `WasmBridge.ts` is blocked → the JS-fallback path runs every request (engine-determinism / replay-drift risk), and (b) the SpectatorClient WebSocket may be blocked depending on browser CSP3 strictness. With a separate API origin (the documented use-case at `frontend/src/services/api.ts:26`), every fetch is also blocked.

**Fix:** Add `'wasm-unsafe-eval'` to `script-src` and parametrise `connect-src` via envsubst to include the API origin.

### H6 — Spectator WebSocket re-auth only fires on event arrival
**Category:** Long-lived auth / revocation timing
**File:** `backend/app/routers/replay.py:128-220`

`authenticate_token` re-runs every 30 events. A quiet session never re-validates; an admin-disabled or password-rotated user can keep streaming spectator events arbitrarily long.

**Fix:** Add a wall-clock timer (`asyncio.wait_for`) so re-auth runs at most every N seconds even when the queue is idle, and bail when the underlying access JWT decodes as expired.

### H7 — Repository returns ORM rows; application service consumes them
**Category:** Leaky abstraction (DDD)
**File:** `backend/app/infrastructure/persistence/study_repository.py:67-74, 79-84, 109-118, 144-154`

```python
def find_enrollment(...) -> StudyEnrollment | None:    # SQLAlchemy model, not domain
    return self._db.query(StudyEnrollment).filter(...).first()
```

`application/study_service.py:62` reads `existing.group` directly off the ORM row. Compare to `class_repository.py:_membership_to_domain` which maps correctly. Couples the application layer to ORM lifecycle (lazy loads, detached-instance bugs after commit).

**Fix:** Add `domain/study/aggregate.py` value objects + `_to_domain` mapper.

### H8 — `User.__init__` enforces no invariants; only mutators validate
**Category:** Invariant gap
**File:** `backend/app/domain/user/aggregate.py:22-60`

```python
def __init__(self, id, email, player_name, role, password_hash, ...):
    self.id = id; self.email = email; self.player_name = player_name
```

Empty email, blank `player_name`, oversize `password_hash`, non-`Role` enum — all accepted. Repo reconstitution and direct callers bypass the validators that `rename`/`update_avatar` enforce.

**Fix:** Run `_validate_email` / `_validate_name` in `__init__` (or an `_validate` helper). Same fix needed for `TalentAllocation.__init__` (`backend/app/domain/talent/aggregate.py:9-21`, accepts negative `current_level`) and `Challenge.__init__` (`backend/app/domain/challenge/aggregate.py:42-56`, crashes on `description=None`).

### H9 — `mfa_token` accepts unbounded input pre-decode
**Category:** Resource exhaustion
**File:** `backend/app/schemas/auth.py:191-202`

```python
class MFAChallengeRequest(BaseModel):
    mfa_token: str            # no max_length
    code: str
```

Other token-bearing fields are length-capped. A 100 MB body reaches `decode_token()` after FastAPI buffers it in full. Rate-limited per-IP only (10/min), and per C2, the per-IP limiter collapses in prod.

**Fix:** `mfa_token: str = Field(min_length=20, max_length=2048)`.

### H10 — Login email-throttle dict can be inflated to ≥ 10 000 sticky entries
**Category:** In-process resource exhaustion
**File:** `backend/app/limiter.py:61-81`

```python
_login_email_history: dict[str, deque[float]] = defaultdict(deque)
...
if len(_login_email_history) > 10_000:
    for k in [k for k, v in _login_email_history.items() if not v]:
        del _login_email_history[k]
```

`defaultdict.__getitem__` materialises an entry on every probe. Cleanup runs only when the dict is already > 10 000. Spraying ~10 000 unique emails inflates and pins the floor.

**Fix:** Replace `defaultdict` with explicit `setdefault` on insert, run the empty-bucket sweep on every call, or LRU-cap with a fixed-size `OrderedDict`.

### H11 — Ranking endpoints leak `student_id` (internal UUID) of every classmate
**Category:** Information disclosure
**Files:** `backend/app/schemas/territory.py:136-170`, `backend/app/application/territory_service.py:299-355`

`OccupationOut` correctly masks `student_id` unless `is_own` or teacher/admin (`routers/territory.py:189-200`). The parallel `RankingEntryOut` / `RankingEntryWithMetaOut` returned by `GET /api/activities/{id}/rankings` and `…/rankings/with-meta` always include `student_id`. A student can scrape every peer's UUID.

**Fix:** Mirror the `_occupation_out` masking pattern; emit `None` to non-owners.


2026-05-11 (fixed above)

---

## Medium

### M1 — Logout silently swallows revocation failure
`backend/app/routers/auth.py:171-193`. If the denylist write fails, cookies are still cleared and the route returns 204. The access JWT remains valid for the rest of its TTL. Return 5xx on revocation failure (or use an outbox).

### M2 — `change-password` does not deny the current access JWT or clear the cookie
`backend/app/application/auth_service.py:289-307`. Defence relies entirely on `pv` + per-request DB read. Also clear the auth cookie in the response so the client-side window closes.

### M3 — Refresh-token reuse detection has a TOCTOU window
`backend/app/infrastructure/persistence/refresh_token_repository.py:34-51`. Two simultaneous refreshes with the same raw token can both pass the `used=False` check at READ COMMITTED. Add `SELECT … FOR UPDATE` or a partial unique index.

### M4 — `LeaderboardInsertHandler` race surfaces as a logged exception
`backend/app/application/session_event_handlers.py:46-62`. `find_by_session_id` is None → both retry + post-commit handler attempt insert; `uq_leaderboard_session_id` saves data integrity, but the handler that was supposed to be idempotent throws.

### M5 — `_abandon_and_commit` commits inside an outer UoW that may roll back
`backend/app/application/session_service.py:464-476`. Calling `self._uow.commit()` from within `with self._uow:` and then raising leaves the outer `__exit__` to call `rollback()` regardless of the local `_committed` flag.

### M6 — `_verify_score` discards client `total_score` only when V2 fields are absent
Same root cause as C1. `backend/app/application/session_service.py:492-542`.

### M7 — `ReplayEventIn.event_type` whitelist not enforced
`backend/app/schemas/replay.py:27`. Spectators consume arbitrary event-type strings. Constrain to `frozenset` of known types.

### M8 — Talent path parameter unbounded; user input echoed into error message
`backend/app/routers/talent.py:35-43`. Add `Path(..., max_length=64, regex=r"^[A-Za-z0-9_]+$")` and stop interpolating the raw value into errors / logs (CR/LF log injection via URL-decoded `%0A`).

### M9 — `get_user_history` returns unbounded list
`backend/app/routers/leaderboard.py:68-95`. No `page`/`per_page`. Add pagination matching the global leaderboard.

### M10 — `SessionCreate.challenge_id` accepts unbounded string
`backend/app/schemas/game_session.py:49`. Bound to `max_length=64`.

### M11 — `RegisterRequest`/`AddStudentRequest` re-implement email validation looser than the `Email` VO
`backend/app/schemas/class_.py:60-68`. Reuse `Email(v).value` for a single source of truth.

### M12 — `:src="auth.user.avatar_url"` accepts arbitrary strings client-side
`frontend/src/views/ProfileView.vue:161`. Backend whitelists today; client should mirror to defend against regression. Allowlist mirroring `_ALLOWED_AVATAR_URLS`, or require `startsWith('/avatars/')`.

### M13 — `GameView` parses `history.state.level` without the size cap `InitialAnswerView` enforces
`frontend/src/views/GameView.vue:47-58`. Same hole exists for `_rawIa` and `_rawTerritoryCtx`. Extract the validator into a shared util and call it in both views and the router guard.

### M14 — `authService.logout` clears local state on transient 5xx, leaves server cookie live
`frontend/src/stores/authStore.ts:182-194`. Retry POST `/auth/logout` once on network/5xx before giving up.

### M15 — `nginx.conf` (HTTP-only) lacks HSTS; both nginx confs lack COOP/CORP
`nginx.conf:1-66`, `nginx-tls.conf:62-65`. Add `Strict-Transport-Security`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`.

### M16 — gzip on `application/json` enables BREACH side-channel
`nginx.conf:38`, `nginx-tls.conf:48`. CSRF tokens reflected in JSON bodies are vulnerable. Set `gzip off;` inside `location /api/`.

### M17 — `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` trusts client XFF
`nginx.conf:105`, `nginx-tls.conf:91`. Combined with C2, an operator who later turns on `PROXY_MODE` will have the limiter pick a client-controlled IP. Replace with `proxy_set_header X-Forwarded-For $remote_addr;`.

### M18 — Backend `.env` mounted into prod container exposes `POSTGRES_PASSWORD` and `SECRET_KEY` together
`docker-compose.prod.yml:33-34`. Any `os.environ` dump or library log leaks DB creds + JWT signing key. Split into per-service env files; the backend only needs `DATABASE_URL` (already constructed).

### M19 — No backend healthcheck or migration-on-start
`docker-compose.prod.yml:28-46`, `backend/Dockerfile:28`. A deploy that ships new SQLAlchemy models without `alembic upgrade head` silently breaks queries.

### M20 — No container hardening flags
`docker-compose.prod.yml:28-78`. Add `read_only: true` (with `tmpfs: ["/tmp"]`), `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]` to backend / frontend / postgres.

### M21 — `SessionEventBus.dispatch` swallows all errors and returns partial results
`backend/app/application/session_event_handlers.py:190-222`. At-most-once delivery presented as at-least-once. Same outbox fix as H3.

### M22 — Cached UoW reuse blurs transaction boundaries
`backend/app/factories.py:84-92`. Same UoW instance shared across services in a request; reentry semantics depend on a single `_committed` boolean. Make UoW non-reentrant or use savepoints (`db.begin_nested()`).

### M23 — `compute_ia_recent_accuracy` runs unbounded query on every session end
`backend/app/infrastructure/persistence/session_repository.py:175-197`. Acceptable today; flag for incremental projection.

### M24 — `User.update_ia_accuracy` accepts NaN
`backend/app/domain/user/aggregate.py:123-133`. Add `if math.isnan(value) or math.isinf(value): value = 0.0`.

### M25 — `Talent_service.points_spent` raises on unknown node ID, breaking every player
`backend/app/domain/talent/tree.py:51-63`. Treat unknown nodes as 0-cost and surface telemetry.

### M26 — `attempt_occupation` rejects equal-score self-update with `ScoreNotHighEnoughError`
`backend/app/domain/territory/aggregate.py:181-185`. Resubmitting an equal-score session returns a 4xx instead of a no-op success.

### M27 — Stale-session `_derive_waves_from_events` swallows ALL exceptions
`backend/app/application/session_service.py:437-445`. Defence-in-depth becomes none-in-depth on transient DB errors. Re-raise on `OperationalError`.


2026-05-11 (fixed above)

---

## Low

L1 — zxcvbn runs before email-existence check, giving a registration timing oracle (`backend/app/application/auth_service.py:124-135`).
L2 — `secret_key` minimum 16 chars is too short for HS256; raise floor to 32 and recommend `secrets.token_urlsafe(48)` (`backend/app/config.py:10`).
L3 — Audit-logger writes one row per failed login with no rate-limit, even after `login_email_throttle_exceeded` (`backend/app/infrastructure/audit_logger.py:33-40`, `routers/auth.py:122-127`).
L4 — `Email` VO never used by `User` aggregate, so mixed-case/whitespace can leak through (`backend/app/domain/user/aggregate.py:39`).
L5 — `find_active_by_user` always uses `with_for_update()`, even on read paths (`backend/app/infrastructure/persistence/session_repository.py:38-43`).
L6 — `_to_domain` static methods use `getattr(row, "field", default)`, hiding schema-migration drift (e.g. `session_repository.py:252`).
L7 — `Season.__init__` accepts whitespace-only `name` (`backend/app/domain/season/aggregate.py:21-32`).
L8 — `LeaderboardEntry.__init__` does not isinstance-check `level: Level` (`backend/app/domain/leaderboard/aggregate.py:21-46`).
L9 — `attempt_occupation` keeps the old `id` for self-improvement, but the repo `save_occupation` upserts by `slot_id` not `id` — id-keeping is decorative.
L10 — `time_exclude_prepare` element cap (7200 s × 50) far exceeds `time_total ≤ 7200`; only the sum-check rejects abuse (`backend/app/schemas/game_session.py:115`).
L11 — `practice_mode + challenge_id` mutual exclusion not enforced in schema (`backend/app/schemas/game_session.py:39-59`).
L12 — Score formula Python fallback uses Python `pow`; v1 sessions with v2 fields take this path with 5e-4 ε (`backend/app/domain/scoring/score_calculator.py:101`).
L13 — `appBus.on('auth:logout', …)` listeners in `talentStore` / `territoryStore` / `uiStore` never unsubscribe; benign in prod, accumulates across tests.
L14 — `gameStore` not subscribed to `auth:logout` — leftover HUD state for the next user on a shared device.
L15 — Vite dev server `fs.allow` includes the entire repo parent (`frontend/vite.config.ts:20`); tighten to `[__dirname, ../shared]`.
L16 — `SeasonCreateRequest.season_id` lacks charset constraint compared to `study.py` (`backend/app/schemas/season.py:9`).
L17 — `ChallengeConstraintsIn.forbidden_mechanics` items have no per-string length cap (`backend/app/schemas/challenge.py:52-65`).

---

## Items checked & found clean

- No `v-html`, `innerHTML`, `dangerouslySetInnerHTML`, `eval`, `new Function`, or `document.write` in `frontend/src`.
- JWT/token storage: HTTP-only cookies + double-submit CSRF. No tokens in `localStorage` / `sessionStorage` / URLs.
- Open-redirect on `?next=`: `AuthView.vue:74-92` resolves via `URL` and rejects backslash-encoded variants.
- WebSocket origin built from `window.location.host`; auth-class closes (4401/4403) terminate retry to avoid loops.
- `sourcemap: false` pinned in `vite.config.ts:36`.
- Vue text interpolation auto-escaped; player names/emails rendered safely.
- Router guards present for `requiresAuth` / `requiresRole`; all sensitive endpoints also enforced server-side.
- CSRF: refresh-and-retry once on `403 csrf`, no infinite loop.
- All raw SQL via `text()` uses named bind parameters — no SQL injection found.
- All ORM `filter`/`where` use ORM column attributes — no f-string composition.
- `decode_token` validates header `alg` against `settings.algorithm` before `jwt.decode`, closing alg-confusion (`utils/security.py:62`).
- MFA challenge JTI denied atomically with TOTP success.
- Refresh-token reuse triggers family revocation (B-SEC-1).
- Repository `find_by_id` methods are owner-scoped (`session_id, user_id`) — no IDOR on session/replay/reflection reads.
- `set_user_active` blocks self-disable and last-admin disable.
- Spectate WebSocket Origin-checked against `cors_origins` (CSWSH defence).
- `cookie_secure=False` and `csrf_enabled=False` rejected outside test env.
- `_DUMMY_PASSWORD_HASH` for unknown emails → constant-time path against user-enumeration timing.
- bcrypt input encoded and length-checked at exactly 72 bytes; silent truncation closed.
- DDD layering: `domain/**` has zero `from app.infrastructure` / `from app.models` / `import sqlalchemy` matches.
- All routers receive `db: Session = Depends(get_db)` only as input to factory builders — none call `db.query/add/commit` directly.
- `seed.py` correctly gated by env flag + dev-host check + password strength + idempotency.
- Error handlers return fixed 500 body; validation handler strips `ctx.error`.
- CSV export `study_id` regex-validated; `user_id` is UUID and `group` is enum, so CSV formula injection unreachable.
- No tracked secrets / `.pem` / SSH keys in the repository; `.dockerignore` excludes `.env` and `certs` from build context.

---

## Notes & non-findings

- **No shop / currency / buff / purchase code exists server-side.** The "shop panel" in recent commits is frontend-only. If the economy is intended to be server-authoritative, the absence of any enforcement is itself a finding.
- `score_parity_fixtures.json` is exercised by `backend/tests/test_score_calculator_parity.py` for parity only — it is **not** a runtime anti-cheat. It does not bind submitted inputs to legitimacy.
- Territory `play_territory` correctly uses `is_session_used` (durable) + row locks for replay protection. The exploit lives upstream in C1.
- Concurrent `create_session` race is well-handled (advisory lock + retry).
- Audit log table has no migration (acknowledged in `SECURITY.md:169`); audit events are silently dropped on a fresh deploy.

---

## Files most cited

- `backend/app/application/session_service.py` (C1, M5, M6, M27)
- `backend/app/domain/scoring/score_calculator.py` (H1, L12)
- `backend/app/limiter.py` (C2, H10)
- `nginx-tls.conf` / `nginx.conf` (C3, H5, M15, M16, M17)
- `backend/app/middleware/csrf.py` (H4)
- `backend/app/application/session_event_handlers.py` (H3, M4, M21)
- `backend/app/application/talent_service.py` (H2, M25)
- `backend/app/domain/user/aggregate.py` (H8, L4, M24)
- `backend/app/infrastructure/persistence/study_repository.py` (H7)
- `backend/app/infrastructure/persistence/refresh_token_repository.py` (M3)
- `backend/app/routers/auth.py` (M1)
- `backend/app/application/auth_service.py` (M2, L1)
- `docker-compose.prod.yml` (C2, M18, M19, M20)
- `frontend/src/views/GameView.vue` (M13)
