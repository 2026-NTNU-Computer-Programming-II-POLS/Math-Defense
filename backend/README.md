# Backend — FastAPI (DDD)

REST API server for Math Defense: authentication, game-session lifecycle, leaderboard, classroom management, achievements/talents, grabbing-territory activities, generative challenges, deterministic replay + live spectate, Bayesian stealth assessment, adaptive recommendations, and the empirical-validity-probe study harness. The code is organised into **Domain / Application / Infrastructure** layers — routers are thin HTTP adapters, business rules live in aggregates, and SQLAlchemy is kept behind repository protocols.

## Tech Stack

| | |
|---|---|
| Framework | FastAPI 0.136 |
| Server | Uvicorn (ASGI) |
| ORM | SQLAlchemy 2.0 |
| Migrations | Alembic |
| Validation | Pydantic v2 + pydantic-settings |
| Auth | PyJWT (HS256) + bcrypt |
| Rate Limiting | slowapi |
| Database | PostgreSQL 16 (psycopg v3; Alembic-managed schema) |
| WASM host | wasmtime-py 44.0.0 (FU-A — recomputes v2 scores via the same `math_engine.wasm` the frontend ships) |
| Testing | pytest + pytest-asyncio |

---

## Directory Layout

```
backend/
├── app/
│   ├── main.py                    FastAPI factory, CORS, lifespan (Alembic upgrade), global DomainError/ValueError handlers
│   ├── config.py                  Settings (Pydantic): SECRET_KEY, DATABASE_URL, CORS_ORIGINS, ...
│   ├── factories.py               DI wiring — builds all application services
│   ├── limiter.py                 slowapi Limiter instance shared across routers
│   ├── shared_constants.py        Loads shared/game-constants.json so Python sees the same canvas / grid / player values as the frontend
│   ├── seed.py                    Demo user seeding — ensure_demo_user(); called from lifespan after migrations
│   │
│   ├── domain/                    ── DOMAIN LAYER ──
│   │   ├── value_objects.py       SessionStatus enum, Level, Score, GameResult
│   │   ├── constraints.py         Numeric bounds (STAR/SCORE/HP/GOLD/KILLS/WAVES ranges, MAX_SCORE_DELTA) — single source of truth
│   │   ├── errors.py              DomainError hierarchy; each subclass carries its own HTTP status_code
│   │   ├── session/
│   │   │   ├── aggregate.py       GameSession aggregate root (state machine + invariants + events)
│   │   │   ├── events.py          SessionCreated / Updated / Completed / Abandoned
│   │   │   └── repository.py      Repository Protocol (interface only)
│   │   ├── leaderboard/
│   │   │   ├── aggregate.py       LeaderboardEntry aggregate
│   │   │   ├── view.py            Read-model projection used by query_ranked / personal_timeline
│   │   │   └── repository.py      Repository Protocol
│   │   ├── user/
│   │   │   ├── aggregate.py       User aggregate root (email, player_name, role; password_hash only — plaintext never reaches domain)
│   │   │   └── repository.py      Repository Protocol
│   │   ├── achievement/           Achievement definitions + aggregate (incl. season-multiplier hooks)
│   │   ├── talent/                Talent tree aggregate (21 nodes, 7 tower types, prereq chains)
│   │   ├── class_/                Class aggregate + ClassMembership + join_code
│   │   ├── auth/                  Auth-specific domain helpers
│   │   ├── scoring/               score_calculator.py — server-side S1/S2/K/TotalScore formula
│   │   ├── territory/             Grabbing Territory aggregate + optimistic locking
│   │   ├── season/                Season aggregate — time-bounded achievement multipliers
│   │   ├── challenge/             Challenge aggregate + constraint DSL + tower-type enum (generative challenge mode)
│   │   ├── assessment/            Q-matrix, competencies, Beta-Bernoulli competency_estimator (Bayesian stealth assessment)
│   │   └── study/                 Empirical-validity-probe domain helpers (group_assignment, scoring)
│   │
│   ├── application/               ── APPLICATION LAYER ──
│   │   ├── auth_service.py        AuthApplicationService — register(email, player_name, password) / login / authenticate_token; also issues + rotates refresh tokens
│   │   ├── session_service.py     Session use cases; consumes SessionCompleted to auto-create leaderboard; calls achievement_svc post-commit; updates IA rolling accuracy + study dosage
│   │   ├── leaderboard_service.py Leaderboard query + manual score submission (idempotent) + per-user personal timeline
│   │   ├── achievement_service.py AchievementApplicationService — evaluate + unlock; awards talent points; applies active season multipliers
│   │   ├── season_service.py      SeasonApplicationService — list + upsert seasonal windows
│   │   ├── talent_service.py      TalentApplicationService — allocate + reset + runtime modifiers
│   │   ├── class_service.py       ClassApplicationService — CRUD + student join by code
│   │   ├── admin_service.py       AdminApplicationService — teacher/class/student management
│   │   ├── territory_service.py   TerritoryApplicationService — activity lifecycle + slot occupation
│   │   ├── assessment_service.py  AssessmentApplicationService — applies evidence to Beta posteriors via competency_estimator
│   │   ├── recommender_service.py RecommenderApplicationService — adaptive star-rating + talent-tree suggestions from posteriors
│   │   ├── challenge_service.py   ChallengeApplicationService — challenge CRUD; soft-delete via deleted_at
│   │   ├── replay_service.py      ReplayApplicationService — record event batches; serve seed + ordered event stream
│   │   ├── study_service.py       StudyApplicationService — enrollment, probe-form scoring, affect surveys, admin CSV export
│   │   └── mappers.py             Aggregate → Pydantic DTO mappers; keeps domain free of Pydantic imports
│   │
│   ├── infrastructure/            ── INFRASTRUCTURE LAYER ──
│   │   ├── unit_of_work.py        SqlAlchemyUnitOfWork — explicit commit; auto-rollback on exit
│   │   ├── login_guard.py         Per-account login-attempt tracker — DB-backed; 5 failures/5-min window triggers exponential-backoff lockout (5m → 15m → 1h → 24h)
│   │   ├── token_denylist.py      DB-backed JWT deny-list for server-side logout (jti → expiry); bounded by natural JWT TTL
│   │   ├── audit_logger.py        record_audit_event() — writes to its own SQLAlchemy session so audit rows commit independently of the surrounding business txn
│   │   ├── email_service.py       Thin SMTP wrapper for verification/2FA mail; no-op when SMTP env is unset
│   │   ├── scheduler.py           Background asyncio task runner (territory settlement loop)
│   │   ├── spectate_hub.py        In-process pub/sub for live-spectate WebSocket fan-out (bounded queue per subscriber)
│   │   ├── wasm_runtime.py        FU-A — singleton wasmtime-py runtime hosting the same math_engine.wasm the frontend ships; exposes power_f64 for v2 score recompute. Thread-safe; falls back to Python pow if WASM unavailable.
│   │   └── persistence/
│   │       ├── user_repository.py             SQLAlchemy impl of UserRepository (incl. ia_recent_accuracy)
│   │       ├── session_repository.py          SQLAlchemy impl of SessionRepository + get_cumulative_stats()
│   │       ├── leaderboard_repository.py      SQLAlchemy impl with per-level DENSE_RANK ranking + per-challenge query
│   │       ├── achievement_repository.py      SQLAlchemy impl of AchievementRepository
│   │       ├── talent_repository.py           SQLAlchemy impl of TalentRepository
│   │       ├── class_repository.py            SQLAlchemy impl of ClassRepository (members, join-code lookup)
│   │       ├── territory_repository.py        SQLAlchemy impl of TerritoryRepository (activity + slot + occupation)
│   │       ├── season_repository.py           SQLAlchemy impl of SeasonRepository
│   │       ├── challenge_repository.py        SQLAlchemy impl of ChallengeRepository (soft-delete aware)
│   │       ├── competency_state_repository.py SQLAlchemy impl backing the Beta-posterior store
│   │       ├── session_event_repository.py    Append-only event log (replay/spectate)
│   │       ├── study_repository.py            Enrollment + probe + affect persistence for the validity probe
│   │       ├── login_attempt_repository.py    Per-account failure-count + lockout-deadline store (backing login_guard)
│   │       ├── token_denylist_repository.py   Persist revoked JWT JTIs until natural expiry (backing token_denylist)
│   │       ├── refresh_token_repository.py    Rotating refresh-token store (SHA-256 hashed; used + revoked flags)
│   │       └── email_verification_repository.py  One-use email verification token store
│   │
│   ├── models/                    SQLAlchemy ORM models
│   │   ├── user.py                User (email, player_name, avatar_url, role, totp_*, ia_recent_accuracy)
│   │   ├── game_session.py        GameSession (CHECK star_rating 1–5, partial unique index on active, V2 scoring fields, reflection_text, practice_mode, rng_seed, challenge_id)
│   │   ├── leaderboard.py         LeaderboardEntry (unique session_id; user_id nullable via SET NULL; challenge_id nullable)
│   │   ├── login_attempt.py       LoginAttempt (per-username failure count + lockout deadline + lockout_count for backoff)
│   │   ├── denied_token.py        DeniedToken (revoked JWT JTIs until natural expiry)
│   │   ├── refresh_token.py       RefreshToken (hashed, used/revoked flags; rotation primitive)
│   │   ├── achievement.py         UserAchievement (user_id + achievement_id, unique)
│   │   ├── talent.py              TalentAllocation (user_id + node_id + level, unique)
│   │   ├── class_.py              Class (join_code, teacher_id)
│   │   ├── class_membership.py    ClassMembership (class_id + student_id)
│   │   ├── removed_class_membership.py  Re-join blocklist
│   │   ├── email_verification_token.py  One-use email tokens
│   │   ├── territory.py           GrabbingTerritoryActivity + TerritorySlot + TerritoryOccupation
│   │   ├── season.py              Season (windowed achievement multipliers; CHECK ends_at > starts_at)
│   │   ├── challenge.py           Challenge (constraints JSONB; soft-delete via deleted_at)
│   │   ├── competency_state.py    UserCompetencyState (composite PK user_id + competency; Beta α/β)
│   │   ├── session_event.py       SessionEvent (append-only event log for replay; UNIQUE(session_id, seq))
│   │   ├── study.py               StudyEnrollment + StudyProbeAttempt + StudyAffectResponse
│   │   └── audit_log.py           AuditLog (no FK on user_id — survives user deletion). See DATABASE_SCHEMA.md for the open schema-gap note.
│   │
│   ├── schemas/                   Pydantic request/response DTOs
│   │   ├── auth.py
│   │   ├── game_session.py
│   │   ├── leaderboard.py
│   │   ├── achievement.py
│   │   ├── admin.py
│   │   ├── class_.py
│   │   ├── talent.py
│   │   ├── challenge.py
│   │   ├── assessment.py
│   │   ├── recommendation.py
│   │   ├── replay.py
│   │   ├── season.py
│   │   └── study.py
│   │
│   ├── routers/                   HTTP adapters — thin controllers; error translation lives in main.py handlers
│   │   ├── auth.py                /api/auth
│   │   ├── game_session.py        /api/sessions
│   │   ├── leaderboard.py         /api/leaderboard
│   │   ├── achievement.py         /api/achievements + /api/seasons (seasons_router lives here)
│   │   ├── talent.py              /api/talents
│   │   ├── class_.py              /api/classes
│   │   ├── admin.py               /api/admin
│   │   ├── territory.py           /api/activities
│   │   ├── assessment.py          /api/assessment — class-scoped Beta posteriors for the teacher dashboard
│   │   ├── recommendation.py      /api/recommendation — adaptive star + talent suggestions
│   │   ├── challenge.py           /api/challenges — generative challenge CRUD
│   │   ├── replay.py              /api/sessions/{id}/events + /replay + WS /spectate
│   │   └── study.py               /api/study — empirical-validity-probe enrollment, probe forms, affect surveys, admin export
│   │
│   ├── db/database.py             Engine, Base, get_db() session factory
│   ├── middleware/
│   │   ├── auth.py                get_current_user() dependency (JWT → User aggregate); AUTH_COOKIE_NAME
│   │   └── csrf.py                CsrfMiddleware — double-submit cookie; on by default, opt-out only under pytest/CI
│   └── utils/
│       ├── security.py            hash_password, verify_password, create_access_token, decode_token
│       └── integrity.py           is_constraint_violation() — matches PG constraint name on IntegrityError.orig.diag
│
├── alembic/                       Alembic migration environment (versions/ + env.py)
├── alembic.ini                    Alembic config; DATABASE_URL injected at runtime
│
├── tests/
│   ├── conftest.py                Fixtures (PG `math_defense_test` DB, TRUNCATE-per-test isolation, test client)
│   ├── test_auth.py                       — register / login / me / logout
│   ├── test_auth_lockout.py               — per-account lockout window + exponential backoff
│   ├── test_token_denylist.py             — JWT JTI revocation after logout
│   ├── test_game_session.py
│   ├── test_session_repository.py         — repo-level invariants and cumulative stats
│   ├── test_leaderboard.py
│   ├── test_session_aggregate.py          — pure aggregate unit tests
│   ├── test_value_objects.py              — VO invariants
│   ├── test_coverage_gaps.py              — audit-driven edge cases
│   ├── test_domain_invariants.py          — cross-aggregate invariant tests
│   ├── test_shared_constants_parity.py    — Python ↔ shared/game-constants.json parity
│   ├── test_score_verify.py               — server-side score recomputation vs client claim
│   ├── test_score_calculator_parity.py    — backend ↔ frontend S1/S2/K score formula parity
│   ├── test_achievement.py                — achievement unlock / summary / isolation / seasonal multiplier
│   ├── test_talent.py                     — talent tree allocate / reset / modifiers
│   ├── test_class.py                      — class CRUD, join, rename, student management
│   ├── test_territory.py                  — activity lifecycle, seize/counter-seize, cap, settlement
│   ├── test_avatar_parity.py              — backend ↔ frontend avatar whitelist parity
│   ├── test_q_matrix.py                   — Q-matrix lookup + competency mapping
│   ├── test_competency_estimator.py       — Beta posterior update (Bayesian stealth assessment)
│   ├── test_assessment_router.py          — /api/assessment posteriors endpoint + RBAC
│   ├── test_challenge.py                  — challenge CRUD + soft-delete + role guards
│   ├── test_study.py                      — enrollment, probe + affect submission, admin CSV export
│   ├── test_recommender.py                — adaptive recommendation against synthetic posteriors
│   └── test_wasm_runtime.py               — wasmtime-py singleton load + fallback + thread-safety (FU-A); v2 strict-rejection lives in test_score_verify.py
│   # 25 test files / ~325 tests total
│
├── requirements.txt
└── Dockerfile
```

---

## DDD Layers

### Domain

Pure Python — no SQLAlchemy, no FastAPI.

- **Value objects** (`value_objects.py`): `SessionStatus` enum, `Level` (1–5), `Score` (0 – 9,999,999), `GameResult`. Immutable dataclasses that validate on construction.
- **Constraints** (`constraints.py`): numeric bounds (level / score / hp / gold / kills / waves ranges, `MAX_SCORE_DELTA`) — imported by both Pydantic schemas and value-object/aggregate invariants so each limit is encoded exactly once.
- **`GameSession` aggregate** (`session/aggregate.py`): the root. Owns its state transitions via `_ALLOWED_TRANSITIONS`; `update_progress()` / `complete()` / `abandon()` raise if called in an illegal status. Score is monotonic; per-update deltas are capped to reject obvious abuse. Emits domain events into an internal buffer collected by the application layer.
- **`LeaderboardEntry` aggregate** — created from a `GameSession` result. Holds `score` as a `Score` VO.
- **`User` aggregate** (`user/aggregate.py`) — stable `id`, immutable `password_hash`. Plaintext passwords never reach the domain — hashing happens in `AuthApplicationService` before construction.
- **Errors** (`errors.py`): `DomainError` hierarchy. Each subclass owns its `status_code`; the global exception handler in `main.py` reads the attribute so routers never see try/except walls.
- **Repository protocols** — interface-only (`typing.Protocol`) so the domain never imports from `infrastructure/`.

### Application

Use-case orchestration. One method per user intent.

- **`AuthApplicationService`**
  - `register(email, player_name, password, role)` — hashes the password with bcrypt, persists a `User`, returns `(user, access_token)`. `EmailTakenError` on unique-violation.
  - `login(email, password)` — `InvalidCredentialsError` on mismatch.
  - `authenticate_token(token)` — decodes the JWT and loads the `User`; raises `InvalidTokenError` / `UserNotFoundError`. Used by the `get_current_user` dependency.
- **`SessionApplicationService`**
  - `create_session(user_id, level)` — abandons stale sessions (>2h) and any existing active session, then creates a new one. Retries once on `IntegrityError` to handle the race against the partial-unique index.
  - `get_active_for_user(user_id)` — returns the caller's active session or `None`.
  - `update_session(session_id, user_id, **patch)` — delegates to aggregate; auto-abandons if stale before raising `SessionStaleError` (committed first so the abandon persists).
  - `end_session(session_id, user_id, score, kills, waves_survived)` — transitions to COMPLETED, then **consumes the `SessionCompleted` event within the same UoW** to create a `LeaderboardEntry` (idempotent via `find_by_session_id`).
  - `abandon_session(session_id, user_id)` — idempotent.
- **`LeaderboardApplicationService`**
  - `get_leaderboard(level, page, per_page)` — per-level `DENSE_RANK` when `level` is provided, global rank otherwise.
  - `submit_score(...)` — manual fallback if the auto-submit path fails.

All domain errors (`SessionNotFoundError`, `SessionStaleError`, `InvalidStatusTransitionError`, `SessionNotActiveError`, `PermissionDeniedError`, `DuplicateSubmissionError`, `EmailTakenError`, `InvalidCredentialsError`, `AccountLockedError`, `InvalidTokenError`, `UserNotFoundError`, `SessionValidationError`, `DomainValueError`, `InsufficientTalentPoints`, `PrerequisiteNotMet`, `MaxLevelReached`, `TalentNodeNotFound`) inherit from `DomainError` and carry their own `status_code`. The global handler in `main.py` surfaces them — routers never translate manually. `DomainValueError` dual-inherits from `ValueError` so existing `except ValueError` clauses keep working; aggregate invariants that raise plain `ValueError` are mapped to `422` by a second handler. `mappers.py` converts aggregates to Pydantic DTOs so routers stay one-liners.

### Infrastructure

- **`SqlAlchemyUnitOfWork`** — context manager. Auto-rollback on exit unless `.commit()` is called explicitly. Prevents accidental partial writes.
- **`SqlAlchemySessionRepository`** — maps `GameSessionModel` ↔ `GameSession` aggregate. Uses `with_for_update()` for the active-session query to serialise under concurrent requests. Finds stale sessions by `started_at < now - STALE_CUTOFF`.
- **`SqlAlchemyLeaderboardRepository`** — implements `query_ranked()` with `func.dense_rank().over(partition_by=level when filtered)` so `/leaderboard?level=2` reports per-level ranks, not global ones.

---

## Domain Event Flow

```
Router           Application Service             Aggregate
──────           ───────────────────             ─────────
POST /end  ───>  end_session()
                   │
                   ├─> session.complete(result)  ──>  emits SessionCompleted
                   │
                   ├─> session.collect_events()  <──
                   │
                   ├─> for event in events:
                   │     _handle_session_completed()
                   │        └─> leaderboard_repo.save(entry)  (idempotent)
                   │
                   └─> uow.commit()   ← single transaction
```

The four events emitted by `GameSession`:

| Event | Trigger | Consumer |
|---|---|---|
| `SessionCreated` | `.create()` factory | — |
| `SessionUpdated` | `.update_progress()` | — |
| `SessionCompleted` | `.complete(result)` | `SessionApplicationService` → leaderboard auto-create |
| `SessionAbandoned` | `.abandon()` | — |

---

## API Reference

Base path: `/api`. Authenticated endpoints accept the JWT via either an HTTP-only cookie (`access_token`, preferred) or a `Authorization: Bearer <token>` header (backward compat). On successful register/login the backend sets the cookie with `HttpOnly`, `Secure` (see `COOKIE_SECURE`), `SameSite=Lax`, `path=/api`.

### Authentication — `/api/auth`

| Method | Path | Rate | Description |
|---|---|---|---|
| POST | `/api/auth/register` | 5/min | Create account, set auth cookie, return token |
| POST | `/api/auth/login` | 10/min | Authenticate, set auth cookie, return token |
| POST | `/api/auth/logout` | 30/min | Revoke current token — adds JTI to deny-list until natural expiry; clears cookie |
| GET | `/api/auth/me` | 30/min | Current user |

Token: HS256 JWT, 15-minute expiry (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`); claims include `sub`, `jti`, `pv`, `exp`, `iat`, `iss`, `aud`. Passwords: bcrypt, ≥8 chars with letter + digit. Logout is server-side: the JTI is denied even if the token has not yet expired. Login failures are tracked per-account (`login_guard`): 5 consecutive failures within 5 minutes trigger a 5-minute lockout (`AccountLockedError` → `429`).

### Game Sessions — `/api/sessions`

| Method | Path | Rate | Description |
|---|---|---|---|
| POST | `/api/sessions` | 30/min | Create session for `star_rating` (1–5); abandons existing active session first |
| GET | `/api/sessions/active` | 60/min | Fetch caller's active session (null if none) |
| PATCH | `/api/sessions/{id}` | 120/min | Update `current_wave`, `gold`, `hp`, `score` (any subset; ≥1 field) |
| POST | `/api/sessions/{id}/abandon` | 30/min | Idempotent abandon |
| POST | `/api/sessions/{id}/end` | 30/min | Complete with `score` / `kills` / `waves_survived` / V2 scoring fields → auto-creates leaderboard entry |

**Validation bounds** (enforced at schema + aggregate + DB layers):

| Field | Range |
|---|---|
| `star_rating` | 1 – 5 |
| `current_wave` | 0 – 999 |
| `gold` | 0 – 99,999 |
| `hp` | 0 – 100 |
| `score` | 0 – 9,999,999; monotonically non-decreasing; per-PATCH delta capped at 50,000 |
| `kills` | 0 – 9,999 |
| `waves_survived` | 0 – 999 |

**Error codes**

| Code | Domain error(s) | Meaning |
|---|---|---|
| `401` | `InvalidCredentialsError`, `InvalidTokenError`, `UserNotFoundError` | Login mismatch / bad or expired JWT |
| `403` | `PermissionDeniedError` | Session not owned by caller |
| `404` | `SessionNotFoundError` | Session id does not exist |
| `409` | `EmailTakenError`, `InvalidStatusTransitionError`, `SessionNotActiveError`, `DuplicateSubmissionError` | Conflict: unique violation, illegal state transition, already-scored session |
| `410` | `SessionStaleError` | Session > 2h active — auto-abandoned before raise |
| `422` | `DomainValueError` / plain `ValueError` from aggregate invariants | Bounds violation, score going backwards, delta > 50 000 |
| `429` | `AccountLockedError`, slowapi `RateLimitExceeded` | Per-account login lockout or IP rate limit |
| `422` | `ReplayMismatchError` (`{"detail":"replay_mismatch"}`) | FU-A — server-side recompute disagrees with submitted `total_score` for a `replay_version=2` session beyond the 1e-4 strict tolerance. v1 sessions log a warning and overwrite the client value with the server value instead of rejecting. |

### Leaderboard — `/api/leaderboard`

| Method | Path | Rate | Description |
|---|---|---|---|
| GET | `/api/leaderboard?star_rating=&page=&per_page=` | 30/min | Ranked entries. `star_rating` gives per-difficulty dense rank; omitting gives global rank |
| POST | `/api/leaderboard` | 10/min | Manual score submission (fallback if auto-create failed) |

Query params: `star_rating` 1–5 optional, `page` default 1, `per_page` default 20 (max 100).

### Achievements — `/api/achievements`

| Method | Path | Rate | Description |
|---|---|---|---|
| GET | `/api/achievements` | 60/min | All achievement definitions with caller's unlock status |
| GET | `/api/achievements/summary` | 60/min | Unlock count, total talent points earned |

### Talents — `/api/talents`

| Method | Path | Rate | Description |
|---|---|---|---|
| GET | `/api/talents` | 60/min | Full talent tree with caller's allocation levels |
| GET | `/api/talents/modifiers` | 60/min | Aggregated per-tower-type modifiers (damage/range/speed/pet) |
| POST | `/api/talents/{node_id}/allocate` | 30/min | Allocate one point to a node; raises if prereqs unmet or max level reached |
| POST | `/api/talents/reset` | 10/min | Reset all allocations; refunds all points |

### Classes — `/api/classes`

| Method | Path | Rate | Description |
|---|---|---|---|
| POST | `/api/classes` | 10/min | Create a class (teacher only) |
| GET | `/api/classes` | 30/min | List caller's classes (admin sees all) |
| GET | `/api/classes/{id}` | 30/min | Class details (teacher: full view; student: safe view without join_code) |
| PUT | `/api/classes/{id}` | 10/min | Rename class (teacher, must own) |
| DELETE | `/api/classes/{id}` | 10/min | Delete class (teacher/admin, must own) |
| POST | `/api/classes/join` | 10/min | Student joins by `join_code` |
| POST | `/api/classes/{id}/regenerate-code` | 5/min | Regenerate join code; old code immediately invalid (teacher) |
| POST | `/api/classes/{id}/students` | 30/min | Add a student by email directly (teacher, must own) |
| GET | `/api/classes/{id}/students` | 30/min | List enrolled students (teacher/admin) |
| DELETE | `/api/classes/{id}/students/{student_id}` | 30/min | Remove student; cascades territory occupations (teacher) |

### Admin — `/api/admin`

| Method | Path | Rate | Description |
|---|---|---|---|
| GET | `/api/admin/teachers` | 30/min | List all teacher accounts (admin only) |
| GET | `/api/admin/classes` | 30/min | List all classes (admin only) |
| GET | `/api/admin/students` | 30/min | List all student accounts (admin only) |

### Seasons — `/api/seasons`

Mounted from `routers/achievement.py` as a sibling `seasons_router`.

| Method | Path | Rate | Description |
|---|---|---|---|
| GET | `/api/seasons` | 60/min | List defined achievement seasons (windows + multiplier metadata) |
| POST | `/api/seasons` | 10/min | Upsert a season window (admin only) |

### Assessment — `/api/assessment`

| Method | Path | Rate | Description |
|---|---|---|---|
| GET | `/api/assessment/class/{class_id}/posteriors` | 30/min | Per-student Beta posteriors + recommended next-step competency. Teacher dashboard payload; teacher must own the class |

### Recommendation — `/api/recommendation`

| Method | Path | Rate | Description |
|---|---|---|---|
| GET | `/api/recommendation/me` | 60/min | Adaptive star-rating + talent-node suggestion derived from the caller's competency posteriors |

### Challenges — `/api/challenges`

| Method | Path | Rate | Description |
|---|---|---|---|
| POST | `/api/challenges` | 10/min | Create a constrained challenge (teacher/admin) |
| GET | `/api/challenges` | 60/min | List challenges. `?mine=true` filters to ones authored by the caller |
| GET | `/api/challenges/{id}` | 60/min | Fetch a single challenge |
| PATCH | `/api/challenges/{id}` | 20/min | Rename / update title or description |
| PUT | `/api/challenges/{id}/constraints` | 10/min | Replace the challenge's constraint payload |
| DELETE | `/api/challenges/{id}` | 10/min | Soft-delete (sets `deleted_at`); historical sessions/leaderboard rows still resolve `challenge_id` |

### Replay & Spectate — `/api/sessions`

| Method | Path | Rate | Description |
|---|---|---|---|
| POST | `/api/sessions/{session_id}/events` | 60/min | Recorder flushes a batch of session events (returns 202; idempotent via `(session_id, seq)`); fans out to live spectators via the in-process spectate hub |
| GET | `/api/sessions/{session_id}/replay` | 30/min | Returns `rng_seed` + ordered event stream so `EventPlayer` can reconstruct the run |
| WS | `/api/sessions/{session_id}/spectate` | — | WebSocket: streams events live; owner-scoped in v1 |

### Study — `/api/study` (Empirical Validity Probe)

| Method | Path | Rate | Description |
|---|---|---|---|
| POST | `/api/study/enroll` | 10/min | Idempotent enrollment; returns deterministic A/B group from `assign_group()` |
| POST | `/api/study/probe` | 10/min | Submit a probe form (`form` ∈ `pre`/`post`/`delay`); returns the score |
| POST | `/api/study/affect` | 10/min | Submit a Likert affect survey (`phase` ∈ `pre`/`post`); returns subscale means |
| GET | `/api/study/export` | 10/min | Admin-only CSV export — one row per participant, dosage + scores + subscale means |

### Territory — `/api/activities`

| Method | Path | Rate | Description |
|---|---|---|---|
| POST | `/api/activities` | 10/min | Create Grabbing Territory activity (teacher; optional `class_id` to scope) |
| GET | `/api/activities` | 30/min | List activities visible to caller (optional `?class_id=` filter; 404 if not a member) |
| GET | `/api/activities/{id}` | 30/min | Activity + slots + current occupations |
| POST | `/api/activities/{id}/slots/{slot_id}/play` | 30/min | Seize or counter-seize a slot using a completed session (student; cap enforced) |
| GET | `/api/activities/{id}/rankings` | 30/min | Territory rankings ordered by weighted occupation star-value |
| GET | `/api/activities/{id}/external-rankings` | 30/min | Rankings for display outside the class (student IDs redacted) |
| POST | `/api/activities/{id}/settle` | 5/min | Settle activity and lock it from further play (teacher, must own) |

---

## Database Models

> See [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md) for the full ERD, every column with constraints, all indexes, and the migration history. The summary below is the most-touched subset.

### User

| Column | Type | Notes |
|---|---|---|
| `id` | String | UUID primary key |
| `username` | String(50) | Nullable, unique (legacy; primary identity is `email`) |
| `email` | String(255) | Unique, not null — primary login identifier |
| `player_name` | String(50) | Display name shown on leaderboard |
| `avatar_url` | String(500) | Nullable; path to one of the 6 preset SVG avatars |
| `role` | Enum | `admin` / `teacher` / `student`; default `student` |
| `password_hash` | String(255) | bcrypt hash |
| `password_version` | Integer | Bumped on password change to invalidate older JWTs |
| `is_email_verified`, `mfa_enabled`, `totp_secret` | — | Verification + TOTP MFA |
| `totp_last_used_at` | DateTime | TOTP step-replay guard |
| `ia_recent_accuracy` | Float | Rolling fraction of last 10 IA-correct sessions; drives Star-1 concrete-fading |
| `created_at`, `updated_at` | DateTime | Auto-managed |

### GameSession

| Column | Type | Notes |
|---|---|---|
| `id` | String | UUID primary key |
| `user_id` | String | FK → User (ON DELETE CASCADE) |
| `star_rating` | Integer | CHECK 1–5 (difficulty level) |
| `path_config` | JSON | Serialised generated curve path (nullable) |
| `initial_answer` | Boolean | Whether player answered the initial-answer screen correctly |
| `status` | Enum | `active` / `completed` / `abandoned` |
| `current_wave`, `gold`, `hp`, `score` | Integer | Progress metrics |
| `kills`, `waves_survived` | Integer | End-of-session counters |
| `kill_value` | Integer | Cumulative weighted kill value (V2 scoring) |
| `cost_total` | Integer | Total gold spent (V2 scoring) |
| `time_total` | Float | Total active time in seconds |
| `time_exclude_prepare` | JSON | Array of prepare-phase durations excluded from scoring time |
| `health_origin`, `health_final` | Integer | HP at level start and end (scoring formula inputs) |
| `total_score` | Float | Server-recomputed final score (K^(1/exp) formula) |
| `reflection_text` | String(2000) | Free-text reflection captured after a winning wave |
| `practice_mode` | Boolean | When true, the global leaderboard query filters this row out — but achievement/talent awards still fire |
| `rng_seed` | BigInteger | Per-session deterministic RNG seed forwarded by the client; replayed by `EventPlayer` |
| `replay_version` | SmallInteger | `1` = legacy (mulberry32 + JS Math, ε=5e-4) / `2` = bit-exact (PCG + WASM, ε=1e-4 strict). Tagged at session creation by the client when WASM is available; backend `_verify_score` raises `ReplayMismatchError → 422 replay_mismatch` on v2 mismatch (FU-A) |
| `challenge_id` | String (FK) | Non-NULL when launched from a challenge deep-link; FK to `challenges` (SET NULL on soft delete) |
| `started_at`, `ended_at` | DateTime | `ended_at` nullable |

Indexes: `ix_game_session_user_id`; partial unique `uq_one_active_per_user WHERE status='active'` — enforces at most one active session per user.

### LeaderboardEntry

| Column | Type | Notes |
|---|---|---|
| `id` | String | UUID primary key |
| `user_id` | String | FK → User (ON DELETE SET NULL), nullable |
| `session_id` | String | FK → GameSession (ON DELETE SET NULL), unique |
| `level` | Integer | CHECK 1–5 (stores star_rating of the completed session) |
| `score`, `kills`, `waves_survived` | Integer | |
| `created_at` | DateTime | |

Unique on `session_id` — guarantees one leaderboard entry per completed session, which is what makes the event-driven auto-create idempotent.

---

## Setup & Running

### Local

```bash
cd backend
pip install -r requirements.txt
cp ../.env.example ../.env       # then fill in SECRET_KEY
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The schema is applied on first boot via `alembic upgrade head` (invoked from the FastAPI `lifespan`, serialised across workers with a Postgres advisory lock). Interactive API docs: http://localhost:8000/docs.

The lifespan also seeds the demo user and starts two background asyncio tasks:

| Task | Purpose |
|---|---|
| `_auth_store_janitor` (10-min interval) | Purges expired JWT deny-list rows + stale `login_attempts` rows so the auth path never has to clean up inline (removes a TOCTOU window and a DoS amplifier under logout spam) |
| `territory_settlement_task` (5-s interval) | Settles `grabbing_territory_activities` whose `deadline` has passed |

### Docker

```bash
docker-compose up backend        # from project root
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | Yes | JWT signing secret — minimum 32 characters; generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `DATABASE_URL` | Yes | SQLAlchemy URL, e.g. `postgresql+psycopg://mathdefense:changeme@postgres:5432/math_defense`. Scheme must be `postgresql+psycopg` (psycopg v3); the bare `postgresql://` alias resolves to unmaintained psycopg2. |
| `POSTGRES_PASSWORD` | Yes (Docker) | Password for the `postgres` service. Must match the password embedded in `DATABASE_URL`. |
| `CORS_ORIGINS` | Yes | Comma-separated browser origins. No default — an absent value raises at startup rather than silently defaulting to localhost in prod. |
| `ALGORITHM` | No | JWT algorithm (default `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Default `15` |
| `SESSION_STALE_CUTOFF_HOURS` | No | Default `2.0`; active sessions older than this are auto-abandoned |
| `COOKIE_SECURE` | No | Default `true`. Sets `Secure` flag on the auth cookie. Only `false` is honoured under CI/pytest — outside tests, startup aborts so plain-HTTP deployments cannot silently leak cookies. |
| `CSRF_ENABLED` | No | Default `true` outside the pytest/CI harness. `CsrfMiddleware` enforces a double-submit cookie (`csrf_token` cookie + `X-CSRF-Token` header) on unsafe methods whenever the auth cookie is present. Only `false` is honoured under CI/pytest; deployed environments that set it to `false` abort at startup. |

> Schema is managed exclusively by Alembic — `lifespan` runs `alembic upgrade head` on boot. There is no `AUTO_CREATE_TABLES` toggle (removed during the PostgreSQL-only migration).

---

## Testing

```bash
pytest                                      # ~325 tests across 25 files
pytest tests/test_session_aggregate.py -v   # pure aggregate unit tests
pytest tests/test_coverage_gaps.py -v       # audit-driven edge cases
pytest tests/test_territory.py -v           # territory integration tests
pytest tests/test_competency_estimator.py -v  # Beta posterior update rule
pytest tests/test_assessment_router.py -v   # /api/assessment posteriors + RBAC
pytest tests/test_challenge.py -v           # challenge CRUD + soft-delete
pytest tests/test_study.py -v               # validity probe enrollment + export
pytest tests/test_recommender.py -v         # adaptive star/talent recommendation
```

The test suite targets a dedicated PostgreSQL database (the dev DB name with a `_test` suffix; auto-created on first run). Each test truncates all tables before it starts so the suite shares one connection pool without cross-test pollution. Notable coverage includes:

- Aggregate state-transition matrix (`SessionStatus × {update, complete, abandon}` — 12 cases)
- Stale-session auto-abandon side-effect ordering (must commit *before* raising)
- Per-level vs global `dense_rank` partitioning
- Real rate-limiter enablement (session create → 429 at 30/min)
- Abuse cases: negative hp, `score` going backwards, score delta > 50 000
- FK cascade behaviour (PG enforces `ON DELETE CASCADE` / `SET NULL` natively — no fixture gymnastics)

---

## Rate Limiting

Implemented via `slowapi` (Starlette port of Flask-Limiter).

| Endpoint | Limit |
|---|---|
| `POST /auth/register` | 5/min per IP |
| `POST /auth/login` | 10/min per IP |
| `POST /auth/logout` | 30/min |
| `GET /auth/me` | 30/min |
| `POST /sessions` | 30/min |
| `GET /sessions/active` | 60/min |
| `PATCH /sessions/{id}` | 120/min |
| `POST /sessions/{id}/end` | 30/min |
| `POST /sessions/{id}/abandon` | 30/min |
| `GET /leaderboard` | 30/min |
| `POST /leaderboard` | 10/min |
| `GET /achievements` | 60/min |
| `GET /achievements/summary` | 60/min |
| `GET /talents` | 60/min |
| `GET /talents/modifiers` | 60/min |
| `POST /talents/{node_id}/allocate` | 30/min |
| `POST /talents/reset` | 10/min |
| `POST /classes` | 10/min |
| `GET /classes` | 30/min |
| `GET /classes/{id}` | 30/min |
| `PUT /classes/{id}` | 10/min |
| `DELETE /classes/{id}` | 10/min |
| `POST /classes/join` | 10/min |
| `POST /classes/{id}/regenerate-code` | 5/min |
| `POST /classes/{id}/students` | 30/min |
| `GET /classes/{id}/students` | 30/min |
| `DELETE /classes/{id}/students/{student_id}` | 30/min |
| `GET /admin/teachers` | 30/min |
| `GET /admin/classes` | 30/min |
| `GET /admin/students` | 30/min |
| `POST /activities` | 10/min |
| `GET /activities` | 30/min |
| `GET /activities/{id}` | 30/min |
| `POST /activities/{id}/slots/{slot_id}/play` | 30/min |
| `GET /activities/{id}/rankings` | 30/min |
| `GET /activities/{id}/external-rankings` | 30/min |
| `POST /activities/{id}/settle` | 5/min |
| `GET /seasons` | 60/min |
| `POST /seasons` | 10/min |
| `GET /assessment/class/{class_id}/posteriors` | 30/min |
| `GET /recommendation/me` | 60/min |
| `POST /challenges` | 10/min |
| `GET /challenges`, `GET /challenges/{id}` | 60/min |
| `PATCH /challenges/{id}` | 20/min |
| `PUT /challenges/{id}/constraints`, `DELETE /challenges/{id}` | 10/min |
| `POST /sessions/{id}/events` | 60/min |
| `GET /sessions/{id}/replay` | 30/min |
| `POST /study/enroll`, `/study/probe`, `/study/affect`, `GET /study/export` | 10/min |

Exceeding the limit returns `HTTP 429 Too Many Requests`. WebSocket spectate (`/api/sessions/{id}/spectate`) is not rate-limited at the slowapi layer.
