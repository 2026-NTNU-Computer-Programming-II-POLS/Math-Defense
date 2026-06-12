# Backend — FastAPI (DDD)

REST API server for Math Defense: authentication (incl. refresh-token rotation, TOTP MFA), game-session lifecycle, leaderboard, classroom management, achievements/talents, grabbing-territory activities, generative challenges, deterministic replay + live spectate, Bayesian stealth assessment, adaptive recommendations, and the empirical-validity-probe study harness. The code is organised into **Domain / Application / Infrastructure** layers — routers are thin HTTP adapters, business rules live in aggregates, and SQLAlchemy is kept behind repository protocols. Domain code is HTTP-free; a dedicated `http_status_map.py` is the single translation point between a `DomainError` subclass and an HTTP status code.

## Tech Stack

| | |
|---|---|
| Framework | FastAPI 0.136 |
| Server | Uvicorn (ASGI) |
| ORM | SQLAlchemy 2.0 |
| Migrations | Alembic |
| Validation | Pydantic v2 + pydantic-settings |
| Auth | PyJWT (HS256) + bcrypt + pyotp (TOTP) |
| Rate Limiting | slowapi (per-IP) + per-account login throttle |
| Database | PostgreSQL 16 (psycopg v3; Alembic-managed schema) |
| WASM host | wasmtime-py 45.0.0 (recomputes v2 scores via the same `math_engine.wasm` the frontend ships) |
| Testing | pytest 9 + pytest-asyncio (33 test files) |

---

## Directory Layout

```
backend/
├── app/
│   ├── main.py                    FastAPI factory, CORS, CSRF, SecurityHeadersMiddleware, lifespan (Alembic upgrade + seed + janitors), DomainError/ValueError handlers
│   ├── config.py                  Settings (Pydantic): SECRET_KEY, DATABASE_URL, CORS_ORIGINS, …
│   ├── factories.py               DI wiring — builds all application services (one UoW per request)
│   ├── http_status_map.py         DomainError → HTTP status table; the *only* HTTP-aware module the domain knows about
│   ├── limiter.py                 slowapi Limiter + per-email login throttle helper
│   ├── shared_constants.py        Loads shared/game-constants.json so Python sees the same canvas / grid / player values as the frontend
│   ├── seed.py                    Dev account seeding — ensure_dev_accounts() creates the teacher + student + admin credentials shown in AuthView's dev hint; called from lifespan after migrations, no-op unless SEED_DEMO_USER=true
│   │
│   ├── domain/                    ── DOMAIN LAYER ──
│   │   ├── value_objects.py       SessionStatus enum, Level, Score, GameResult
│   │   ├── constraints.py         Numeric bounds (STAR/SCORE/HP/GOLD/KILLS/WAVES ranges, MAX_SCORE_DELTA) — single source of truth
│   │   ├── errors.py              DomainError hierarchy (HTTP-free); class → status code lives in http_status_map.py
│   │   ├── session/
│   │   │   ├── aggregate.py       GameSession aggregate root (state machine + invariants + events)
│   │   │   ├── events.py          SessionCreated / Updated / Completed / Abandoned
│   │   │   ├── events_log.py      ReplayEvent dataclass — append-only spectate/replay envelope
│   │   │   └── repository.py      Repository Protocol (interface only)
│   │   ├── leaderboard/
│   │   │   ├── aggregate.py       LeaderboardEntry aggregate
│   │   │   ├── view.py            Read-model projections: LeaderboardView (query_ranked) + SessionHistoryEntry (self-history timeline)
│   │   │   └── repository.py      Repository Protocol
│   │   ├── user/
│   │   │   ├── aggregate.py       User aggregate (email, player_name, role; password_hash only — plaintext never reaches domain)
│   │   │   ├── value_objects.py   Role enum + email/player_name value objects
│   │   │   ├── constraints.py     Per-field length / regex bounds
│   │   │   └── repository.py      Repository Protocol
│   │   ├── achievement/           Achievement definitions + aggregate + policy (season-multiplier hooks)
│   │   ├── talent/                Talent tree aggregate + definitions + tree-builder (26 nodes: 19 base + 7 tier-2, 7 tower types, prereq chains including `prerequisite_max_levels` for tier-2)
│   │   ├── class_/                Class aggregate + ClassMembership + join_code + class-scoped errors
│   │   ├── auth/                  Auth-specific domain helpers (refresh-token repository protocol)
│   │   ├── scoring/               score_calculator.py — server-side V3 score formula (killValue-based core × difficulty multiplier; S1/S2/K speed-efficiency blend)
│   │   ├── territory/             Grabbing Territory aggregate + recommendation policy + optimistic locking
│   │   ├── season/                Season aggregate — time-bounded achievement multipliers
│   │   ├── challenge/             Challenge aggregate + constraint DSL + tower-type enum (generative challenge mode)
│   │   ├── assessment/            Q-matrix (defs + lookup), competencies enum, Beta-Bernoulli competency_estimator, suggestion ranker
│   │   └── study/                 Empirical-validity-probe helpers (group_assignment, probe_keys for scoring)
│   │
│   ├── application/               ── APPLICATION LAYER ──
│   │   ├── ports.py                       UnitOfWork Protocol so services do not import infrastructure
│   │   ├── auth_service.py                AuthApplicationService — register / login / MFA / refresh + rotate + revoke
│   │   ├── session_service.py             Session use cases; emits SessionCompleted to SessionEventBus; attaches reflection text post-end
│   │   ├── session_event_handlers.py      Post-commit handlers (leaderboard insert / achievement check + assessment evidence / IA rolling accuracy) + SessionEventBus dispatcher — each handler runs in its own UoW
│   │   ├── leaderboard_service.py         Per-level / class-scoped / challenge-scoped queries + manual submission + personal timeline (sourced from the caller's own game_sessions, incl. practice/preview)
│   │   ├── achievement_service.py         Evaluate + unlock; awards talent points; applies active season multipliers
│   │   ├── season_service.py              List + upsert seasonal windows
│   │   ├── talent_service.py              Allocate + reset + runtime modifiers
│   │   ├── class_service.py               CRUD, student join, reflections feed
│   │   ├── admin_service.py               Teacher/class/student paginated views + set_user_active + create_teacher
│   │   ├── territory_service.py           Activity lifecycle + slot occupation + rankings (+ with-meta + external)
│   │   ├── territory_recommendation_service.py  Per-activity slot recommendation
│   │   ├── assessment_service.py          Applies evidence to Beta posteriors; apply_evidence_in_open_uow for atomic chaining
│   │   ├── recommender_service.py         Adaptive star-rating + talent-tree suggestions from posteriors
│   │   ├── challenge_service.py           Challenge CRUD; soft-delete via deleted_at; immutability once played
│   │   ├── replay_service.py              Record event batches; serve seed + ordered event stream; owner gate for spectate
│   │   ├── study_service.py               Enrollment, probe scoring, affect surveys, admin CSV export rows
│   │   └── mappers.py                     Aggregate → Pydantic DTO mappers; keeps domain free of Pydantic imports
│   │
│   ├── infrastructure/            ── INFRASTRUCTURE LAYER ──
│   │   ├── unit_of_work.py        SqlAlchemyUnitOfWork — explicit commit; auto-rollback on exit; raises ConstraintViolationError with constraint_name on unique/FK violations
│   │   ├── login_guard.py         Per-account login-attempt tracker — DB-backed; 5 failures/5-min window triggers exponential-backoff lockout (5m → 15m → 60m cap; tracked via `login_attempts.lockout_count`); `purge_stale()` used by the janitor
│   │   ├── token_denylist.py      DB-backed JWT deny-list for server-side logout (jti → expiry); `purge_expired()` used by the janitor
│   │   ├── audit_logger.py        record_audit_event() — writes to its own SQLAlchemy session so audit rows commit independently of the surrounding business txn
│   │   ├── email_service.py       Thin SMTP wrapper for welcome / account-exists mail; no-op when SMTP env is unset
│   │   ├── scheduler.py           Background asyncio task runner (territory settlement loop)
│   │   ├── spectate_hub.py        In-process pub/sub for live-spectate WebSocket fan-out (bounded queue per subscriber)
│   │   ├── wasm_runtime.py        Singleton wasmtime-py runtime hosting the same math_engine.wasm the frontend ships; exposes power_f64 for v2 score recompute. Thread-safe; raises ReplayUnavailableError when WASM cannot load so v2 fails closed.
│   │   └── persistence/
│   │       ├── user_repository.py             SQLAlchemy impl of UserRepository (incl. ia_recent_accuracy)
│   │       ├── session_repository.py          SQLAlchemy impl + get_cumulative_stats() + compute_ia_recent_accuracy() + get_user_session_history()
│   │       ├── leaderboard_repository.py      Per-level DENSE_RANK + per-class + per-challenge queries
│   │       ├── achievement_repository.py      Achievement persistence
│   │       ├── talent_repository.py           Talent allocations
│   │       ├── class_repository.py            Members, join-code lookup, removed-membership blocklist
│   │       ├── territory_repository.py        Activity + slot + occupation + ranking snapshots
│   │       ├── season_repository.py           Season windows
│   │       ├── challenge_repository.py        Soft-delete aware reads/writes
│   │       ├── competency_state_repository.py Beta-posterior store (composite PK user_id + competency)
│   │       ├── session_event_repository.py    Append-only event log (replay/spectate)
│   │       ├── study_repository.py            Enrollment + probe + affect persistence + export aggregation
│   │       ├── login_attempt_repository.py    Per-account failure-count + lockout-deadline (backs login_guard)
│   │       ├── token_denylist_repository.py   Persist revoked JWT JTIs until natural expiry (backs token_denylist)
│   │       └── refresh_token_repository.py    Rotating refresh-token store (SHA-256 hashed; used + revoked flags)
│   │
│   ├── models/                    SQLAlchemy ORM models
│   │   ├── user.py                User (email, player_name, role, is_active, totp_*, ia_recent_accuracy, password_version, endpoint_marker_style/custom_dataurl/hit_fx, profile_initials_letters/color)
│   │   ├── game_session.py        GameSession (CHECK star_rating 1–5, partial unique index on active, V2 scoring fields, reflection_text, practice_mode, is_preview, rng_seed, replay_version, challenge_id)
│   │   ├── leaderboard.py         LeaderboardEntry (unique session_id; user_id nullable via SET NULL; challenge_id nullable)
│   │   ├── login_attempt.py       LoginAttempt (per-username failure count + lockout deadline + lockout_count for backoff)
│   │   ├── denied_token.py        DeniedToken (revoked JWT JTIs until natural expiry)
│   │   ├── refresh_token.py       RefreshToken (hashed, used/revoked flags; rotation primitive)
│   │   ├── achievement.py         UserAchievement (user_id + achievement_id, unique)
│   │   ├── talent.py              TalentAllocation (user_id + node_id + level, unique)
│   │   ├── class_.py              Class (join_code, teacher_id)
│   │   ├── class_membership.py    ClassMembership (class_id + student_id)
│   │   ├── class_co_teacher.py    Co-teacher grants on a class
│   │   ├── class_group.py         Named student sub-groups within a class
│   │   ├── class_pending_invite.py  Pending email invites awaiting acceptance
│   │   ├── removed_class_membership.py  Re-join blocklist
│   │   ├── email_verification_token.py  One-use email tokens — unused legacy table; no email-verification flow exists
│   │   ├── territory.py           GrabbingTerritoryActivity (incl. teacher-configurable `student_slot_cap` 1–50, default 5) + TerritorySlot (CHECK slot_index 0..49) + TerritoryOccupation
│   │   ├── season.py              Season (windowed achievement multipliers; CHECK ends_at > starts_at)
│   │   ├── challenge.py           Challenge (constraints JSONB; soft-delete via deleted_at)
│   │   ├── competency_state.py    UserCompetencyState (composite PK user_id + competency; Beta α/β)
│   │   ├── session_event.py       SessionEvent (append-only event log; UNIQUE(session_id, seq))
│   │   ├── study.py               StudyEnrollment + StudyProbeAttempt + StudyAffectResponse
│   │   └── audit_log.py           AuditLog (no FK on user_id — survives user deletion)
│   │
│   ├── schemas/                   Pydantic request/response DTOs
│   │   ├── auth.py · game_session.py · leaderboard.py · achievement.py · admin.py
│   │   ├── class_.py · talent.py · challenge.py · assessment.py · recommendation.py
│   │   ├── replay.py · season.py · study.py · territory.py
│   │
│   ├── routers/                   HTTP adapters — thin controllers; error translation lives in main.py
│   │   ├── auth.py                /api/auth (register / login / logout / refresh / change-password / me / profile/{name,endpoint-marker,initials} / mfa/*)
│   │   ├── game_session.py        /api/sessions (CRUD + /reflection)
│   │   ├── leaderboard.py         /api/leaderboard (+ /me for personal timeline)
│   │   ├── achievement.py         /api/achievements + GET /api/seasons (sibling seasons_router)
│   │   ├── talent.py              /api/talents
│   │   ├── class_.py              /api/classes (CRUD + archive/transfer + join/claim-invites/QR + students incl. bulk/move + co-teachers + invites + groups + reflections + leaderboard + report{,.csv})
│   │   ├── admin.py               /api/admin (teachers / provision teacher / students / classes / set-active / seasons CRUD)
│   │   ├── territory.py           /api/activities (+ /rankings, /rankings/with-meta, /external-rankings)
│   │   ├── assessment.py          /api/assessment — class-scoped Beta posteriors for the teacher dashboard
│   │   ├── recommendation.py      /api/recommendation/me + /api/recommendation/territory/{id}
│   │   ├── challenge.py           /api/challenges — generative challenge CRUD
│   │   ├── replay.py              /api/sessions/{id}/events + /replay + WS /spectate
│   │   └── study.py               /api/study — enrollment, probe forms, affect surveys, admin CSV export
│   │
│   ├── db/database.py             Engine, Base, get_db() session factory
│   ├── middleware/
│   │   ├── auth.py                get_current_user(), get_current_user_optional(), authenticate_ws(); AUTH_COOKIE_NAME; require_role()
│   │   └── csrf.py                CsrfMiddleware — double-submit cookie; on by default, opt-out only under pytest/CI
│   └── utils/
│       ├── security.py            hash_password, verify_password, create_access_token, decode_token
│       ├── totp.py                TOTP secret generation + provisioning-URI / verify helpers
│       ├── encryption.py          Fernet encrypt/decrypt for TOTP secrets at rest; verify_key_configured() fail-fast startup check
│       ├── integrity.py           is_constraint_violation() — matches PG constraint name on IntegrityError.orig.diag
│       └── csv_export.py          csv_safe() formula-injection guard + UTF8_BOM — shared by the class report CSV and the study export
│
├── alembic/                       Alembic migration environment (versions/ + env.py) — 49 revisions through f3d4e5a6b7c8_null_legacy_total_score_for_v3 (current head)
├── alembic.ini                    Alembic config; DATABASE_URL injected at runtime
│
├── tests/                         33 files
│   ├── conftest.py                Fixtures (PG `math_defense_test` DB, TRUNCATE-per-test isolation, test client)
│   ├── test_auth.py                       — register / login / me / logout
│   ├── test_auth_lockout.py               — per-account lockout window + exponential backoff
│   ├── test_token_denylist.py             — JWT JTI revocation after logout
│   ├── test_refresh_token.py              — refresh-token rotation + reuse detection
│   ├── test_csrf_cookie.py                — CSRF double-submit cookie enforcement on unsafe methods
│   ├── test_admin_create_teacher.py       — Admin teacher-provisioning endpoint + RBAC
│   ├── test_admin_season.py               — Admin season upsert (POST /api/admin/seasons)
│   ├── test_admin_user_active.py          — Admin enable/disable account invariants + hard-logout semantics
│   ├── test_game_session.py
│   ├── test_session_repository.py         — repo-level invariants and cumulative stats
│   ├── test_leaderboard.py
│   ├── test_session_aggregate.py          — pure aggregate unit tests
│   ├── test_value_objects.py              — VO invariants
│   ├── test_coverage_gaps.py              — cross-cutting edge cases
│   ├── test_domain_invariants.py          — cross-aggregate invariant tests
│   ├── test_shared_constants_parity.py    — Python ↔ shared/game-constants.json parity
│   ├── test_score_verify.py               — server-side score recomputation vs client claim
│   ├── test_score_calculator_parity.py    — backend ↔ frontend S1/S2/K score formula parity
│   ├── test_achievement.py                — achievement unlock / summary / isolation / seasonal multiplier
│   ├── test_achievement_parity.py         — backend ↔ frontend achievement registry parity
│   ├── test_talent.py                     — talent tree allocate / reset / modifiers
│   ├── test_class.py                      — class CRUD, join, rename, student management
│   ├── test_class_extensions.py           — co-teachers, groups, pending invites
│   ├── test_territory.py                  — activity lifecycle, seize/counter-seize, cap, settlement
│   ├── test_endpoint_marker.py            — endpoint-marker prefs: schema + aggregate (magic-byte / PNG-dimension checks) + route round-trip + FE/BE parity
│   ├── test_profile_initials.py           — profile-initials avatar (letters + colour): schema + aggregate pairing invariant + route round-trip
│   ├── test_q_matrix.py                   — Q-matrix lookup + competency mapping
│   ├── test_competency_estimator.py       — Beta posterior update (Bayesian stealth assessment)
│   ├── test_assessment_router.py          — /api/assessment posteriors endpoint + RBAC
│   ├── test_challenge.py                  — challenge CRUD + soft-delete + role guards + immutability
│   ├── test_study.py                      — enrollment, probe + affect submission, admin CSV export
│   ├── test_recommender.py                — adaptive recommendation against synthetic posteriors
│   └── test_wasm_runtime.py               — wasmtime-py singleton load + ReplayUnavailableError + thread-safety; v2 strict-rejection lives in test_score_verify.py
│
├── requirements.txt               Runtime dependencies (FastAPI 0.136, SQLAlchemy 2.0, psycopg v3, Alembic 1.18, PyJWT, slowapi, bcrypt, pyotp, zxcvbn, wasmtime 45, etc.)
├── requirements-dev.txt           Includes runtime + pytest 9 / pytest-asyncio 1.4
├── data/                          Bundled math_engine.wasm (copied to /app/data in the Docker image; wasm_runtime falls back to the frontend checkout path in dev)
└── Dockerfile                     Two-stage build (emsdk wasm-builder → python:3.13-slim runtime)
```

---

## DDD Layers

### Domain

Pure Python — no SQLAlchemy, no FastAPI, no Pydantic.

- **Value objects** (`value_objects.py`): `SessionStatus` enum, `Level` (1–5), `Score` (0 – 9,999,999), `GameResult`. Immutable dataclasses that validate on construction.
- **Constraints** (`constraints.py`): numeric bounds (level / score / hp / gold / kills / waves ranges, `MAX_SCORE_DELTA`) — imported by Pydantic schemas, value objects, and aggregate invariants so each limit is encoded exactly once.
- **`GameSession` aggregate** (`session/aggregate.py`): the root. Owns its state transitions via `_ALLOWED_TRANSITIONS`; `update_progress()` / `complete()` / `abandon()` raise if called in an illegal status. Score is monotonic; per-update deltas are capped to reject obvious abuse. Emits domain events into an internal buffer collected by the application layer.
- **`LeaderboardEntry` aggregate** — created from a `GameSession` result. Holds `score` as a `Score` VO.
- **`User` aggregate** (`user/aggregate.py`) — stable `id`, immutable `password_hash`, `is_active` flag, `password_version` (bumped to invalidate older JWTs). Plaintext passwords never reach the domain — hashing happens in `AuthApplicationService` before construction.
- **Errors** (`errors.py`): `DomainError` hierarchy. **HTTP-free** — the class → status code mapping lives in `app/http_status_map.py` so the domain layer has no transport concerns.
- **Repository protocols** — interface-only (`typing.Protocol`) so the domain never imports from `infrastructure/`.

### Application

Use-case orchestration. One method per user intent. Services depend on the `UnitOfWork` protocol declared in `application/ports.py`, never directly on SQLAlchemy.

- **`AuthApplicationService`** — `register / login / logout_token / refresh_access_token / change_password / authenticate_token / setup_mfa / confirm_mfa / disable_mfa / verify_mfa_challenge / update_player_name / update_endpoint_marker / update_profile_initials`.
- **`SessionApplicationService`** — `create_session` (abandons stale sessions >2h and any existing active one, with one IntegrityError retry against the partial-unique index), `get_active_for_user`, `update_session`, `abandon_session`, `end_session` (transitions to COMPLETED and dispatches `SessionCompleted` through the event bus), `attach_reflection`, `has_correct_ia_session`.
- **`SessionEventBus`** (in `session_event_handlers.py`) — dispatches `SessionCompleted` to three independent handlers, each in its own UoW so a downstream failure cannot roll back the durable session row:
  1. `LeaderboardInsertHandler` — idempotent insert (skipped when `practice_mode` or `is_preview` is true); `ConstraintViolationError` on the unique session-id constraint is the expected duplicate-delivery outcome.
  2. `AchievementCheckHandler` — evaluates the achievement registry; when an `AssessmentApplicationService` is wired, Beta-evidence rows for the unlocked achievements are written inside the same UoW via `apply_evidence_in_open_uow()`, so the unlock and its assessment evidence commit atomically.
  3. `IaAccuracyRefreshHandler` — recomputes the rolling Initial-Answer accuracy on the user aggregate.
- **`LeaderboardApplicationService`** — per-level / class-scoped / challenge-scoped queries, manual `submit_score` fallback, and the personal timeline (`get_user_history`) — sourced from `GameSessionRepository.get_user_session_history()` (the caller's own completed `game_sessions`, **including** practice and teacher-preview runs) rather than the leaderboard table, with `is_personal_best` computed in the service. Public ranking boards remain leaderboard-table-backed.
- **Other services** — `AchievementApplicationService`, `SeasonApplicationService`, `TalentApplicationService`, `ClassApplicationService`, `AdminApplicationService`, `TerritoryApplicationService`, `TerritoryRecommendationApplicationService`, `AssessmentApplicationService`, `RecommenderApplicationService`, `ChallengeApplicationService`, `ReplayApplicationService`, `StudyApplicationService`. All share one `SqlAlchemyUnitOfWork` per request (see `factories._get_uow`).

Domain errors all inherit from `DomainError`; their HTTP status comes from the `_STATUS_BY_CLASS` table in `http_status_map.py` (MRO-walked, so subclassing keeps you on the most specific mapping). `DomainValueError` dual-inherits from `ValueError` so existing `except ValueError` clauses keep working. `mappers.py` converts aggregates to Pydantic DTOs so routers stay one-liners.

### Infrastructure

- **`SqlAlchemyUnitOfWork`** — context manager. Auto-rollback on exit unless `.commit()` is called explicitly. Translates `IntegrityError` into `ConstraintViolationError(constraint_name=…)` so application code can decide which domain error to re-raise.
- **`SqlAlchemySessionRepository`** — maps `GameSessionModel` ↔ `GameSession` aggregate. Uses `with_for_update()` for the active-session query to serialise under concurrent requests. Finds stale sessions by `started_at < now - STALE_CUTOFF`.
- **`SqlAlchemyLeaderboardRepository`** — implements `query_ranked()` with `func.dense_rank().over(partition_by=level when filtered)` and accepts optional `class_id` / `challenge_id` filters so `/leaderboard?level=2&class_id=…` reports per-level ranks scoped to a class.
- **`wasm_runtime`** — singleton wasmtime-py runtime, lazily initialised. v2 sessions require the runtime; if it cannot load, `ReplayUnavailableError` (503) is raised rather than silently falling back to Python `pow()` and weakening the bit-exact contract.

---

## Domain Event Flow

`SessionApplicationService.end_session` transitions the aggregate and then hands `SessionCompleted` to the bus. Each handler opens its own UoW; failures are caught and logged so a single bad subscriber cannot suppress the others. Leaderboard + achievement-evidence commit atomically; IA-accuracy refresh commits separately.

```
Router            Application Service           SessionEventBus           Aggregate
──────            ───────────────────           ───────────────           ─────────
POST /end  ───>   end_session()
                    │
                    ├─> session.complete(result)            ──>  emits SessionCompleted
                    │
                    ├─> session_repo.save(...)
                    │   uow.commit()   ← session row durable
                    │
                    └─> bus.dispatch([SessionCompleted])
                              │
                              ├─> LeaderboardInsertHandler   (own UoW; skip if practice_mode or is_preview)
                              ├─> AchievementCheckHandler    (own UoW; assessment evidence committed atomically)
                              └─> IaAccuracyRefreshHandler   (own UoW; updates user.ia_recent_accuracy)
```

Events emitted by `GameSession`:

| Event | Trigger | Consumer |
|---|---|---|
| `SessionCreated` | `.create()` factory | — |
| `SessionUpdated` | `.update_progress()` | — |
| `SessionCompleted` | `.complete(result)` | `SessionEventBus` → leaderboard + achievements + IA accuracy |
| `SessionAbandoned` | `.abandon()` | — |

---

## API Reference

Base path: `/api`. Authenticated endpoints accept the JWT via either an HTTP-only cookie (`access_token`, preferred) or a `Authorization: Bearer <token>` header (backward compat). On register / login / refresh the backend sets `access_token` (path `/api`) and a rotating opaque `refresh_token` (path `/api/auth/refresh`, only its SHA-256 hash is stored). CSRF protection: a `csrf_token` cookie is minted alongside the auth cookie; unsafe methods must echo it back via the `X-CSRF-Token` header (enforced by `CsrfMiddleware`; disabled only under the test harness).

### Authentication — `/api/auth`

| Method | Path | Rate | Description |
|---|---|---|---|
| POST | `/api/auth/register` | 5/min | Submit registration. Enumeration-safe: always returns a fixed 202 with NO cookies and no user payload. New accounts get a welcome email, existing ones an account-exists notice; the user then signs in via `/login` (no email-verification gate) |
| POST | `/api/auth/login` | 10/min | Authenticate; on success set cookies; if MFA required, return `mfa_required=true` + `mfa_token` |
| POST | `/api/auth/logout` | 30/min | Revoke access JTI (deny-list) + revoke refresh token; clear cookies |
| POST | `/api/auth/refresh` | 30/min | Rotate refresh token, mint new access cookie |
| POST | `/api/auth/change-password` | 5/min | Verify current password, set new one, bump `password_version`, clear cookies |
| GET | `/api/auth/me` | 30/min | Current user + IA unlock state + rolling IA accuracy |
| PUT | `/api/auth/profile/name` | 10/min | Update `player_name` |
| PUT | `/api/auth/profile/endpoint-marker` | 10/min | Update endpoint-marker prefs (`style` ∈ star/gorilla/custom, optional `custom_dataurl` PNG/JPEG, `hit_fx` ∈ random/fragments/crying/angry); aggregate re-validates magic bytes + PNG dimensions |
| PUT | `/api/auth/profile/initials` | 10/min | Update the profile-initials avatar (1–2 letters + `#RRGGBB` colour; both-or-neither — the aggregate enforces the pairing invariant) |
| POST | `/api/auth/mfa/setup` | 5/min | Generate TOTP secret + provisioning URI |
| POST | `/api/auth/mfa/confirm` | 5/min | Verify first TOTP code, flip `mfa_enabled=true` |
| POST | `/api/auth/mfa/disable` | 5/min | Require current password + TOTP code, then disable |
| POST | `/api/auth/mfa/challenge` | 10/min | Complete the MFA-required login leg using the short-lived `mfa_token` |

Token: HS256 JWT, 15-minute expiry (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`); claims include `sub`, `jti`, `pv` (password version), `exp`, `iat`, `iss`, `aud`. Passwords: bcrypt, ≥8 chars with letter + digit, zxcvbn strength gate. Login defence-in-depth: per-IP slowapi rate limit + per-email throttle (`login_email_throttle_exceeded`) + per-account `login_guard` (5 failures/5 min → 5 m lockout, then 15 m, then 60 m cap on subsequent lockouts; surfaces `AccountLockedError` → `429` with `Retry-After`).

### Game Sessions — `/api/sessions`

| Method | Path | Rate | Description |
|---|---|---|---|
| POST | `/api/sessions` | 30/min | Create session: `star_rating` (1–5), optional `path_config`, `initial_answer`, `practice_mode`, `challenge_id`, `rng_seed`, `replay_version` (1 or 2). Abandons stale + existing active sessions first. |
| GET | `/api/sessions/active` | 60/min | Fetch caller's active session (null if none) |
| PATCH | `/api/sessions/{id}` | 120/min | Update any subset of `current_wave`, `score`, `kill_value`, `cost_total`. `gold` and `hp` are **not** accepted from the client — both must derive from the authoritative replay event log. |
| POST | `/api/sessions/{id}/abandon` | 30/min | Idempotent abandon |
| POST | `/api/sessions/{id}/end` | 30/min | Complete with `kills`, `waves_survived`, V2 fields (`kill_value`, `cost_total`, `time_total`, `health_origin/final`, `time_exclude_prepare`, `n_prep_phases`). `score` and `total_score` are accepted for back-compat but the server recomputes the canonical `total_score` authoritatively (modern v2 clients omit both). Triggers `SessionEventBus`. |
| POST | `/api/sessions/{id}/reflection` | 10/min | Attach free-text reflection (≤2000 chars); audit-logged when overwriting an existing entry |

**Validation bounds** (enforced at schema + aggregate + DB layers):

| Field | Range |
|---|---|
| `star_rating` | 1 – 5 |
| `current_wave` | 0 – 999 |
| `gold` | 0 – 99,999 |
| `hp` | 0 – 100 |
| `score` | 0 – 9,999,999; monotonically non-decreasing; per-PATCH delta capped per-level via `max_score_delta_for(level)` = `ceil(LEVEL_MAX_SCORES / LEVEL_MAX_WAVES) × 2` (L1=3334, L2=5000, L3=6000, L4=20000, L5=33334) |
| `kill_value` / `cost_total` | 0 – SCORE_MAX / GOLD_MAX |
| `kills` | 0 – 9,999 |
| `waves_survived` | 0 – 999 |
| `time_total` / per `time_exclude_prepare[i]` | 0 – 7,200 s; ∑ ≤ `time_total` |
| `total_score` | 0 – 1,000,000 |
| `rng_seed` | 0 – 4,294,967,295 (uint32) |
| `replay_version` | 1 or 2 |

**Error codes**

| Code | Domain error(s) | Meaning |
|---|---|---|
| `400` | `SessionValidationError`, `MFANotSetupError`, `NotAStudentError` | Generic validation / pre-condition failure |
| `401` | `InvalidCredentialsError`, `InvalidTokenError`, `InvalidMFACodeError` | Bad credentials / token / TOTP code |
| `403` | `PermissionDeniedError`, `Star5LockedError`, `AccountDisabledError`, `NotClassOwnerError`, `NotActivityOwnerError`, `StudentRemovedFromClassError` | Not authorised |
| `404` | `SessionNotFoundError`, `ChallengeNotFoundError`, `ClassNotFoundError`, `ActivityNotFoundError`, `SlotNotFoundError`, `InvalidJoinCodeError`, `StudentEmailNotFoundError`, `StudentNotInClassError`, `UserNotFoundError` | Resource missing |
| `409` | `UsernameTakenError`, `InvalidStatusTransitionError`, `SessionNotActiveError`, `DuplicateSubmissionError`, `MFAAlreadyEnabledError`, `ChallengeImmutableError`, `InsufficientTalentPointsError`, `PrerequisiteNotMetError`, `MaxLevelReachedError`, `TalentNodeNotFoundError`, `ConstraintViolationError`, `ActivityExpiredError`, `ActivityAlreadySettledError`, `TerritoryCapReachedError`, `ScoreNotHighEnoughError`, `StudentAlreadyInClassError`, `ClassNameConflictError` | Conflict / state |
| `410` | `SessionStaleError` | Session > 2h active — auto-abandoned before raise |
| `422` | `DomainValueError`, `ReplayMismatchError` (`detail: "replay_mismatch"`), `InvalidSessionError`, `ClassNameInvalidError` | Value-level invariant. v2 strict tolerance is `1e-4`; v1 sessions log a warning and overwrite client value with server value instead of rejecting. |
| `429` | `AccountLockedError`, slowapi `RateLimitExceeded` | Per-account login lockout (`Retry-After` header) or per-IP rate limit |
| `500` | `PersistenceError` (catch-all) | Bug surface — logged with traceback |
| `503` | `ReplayUnavailableError` | v2 session submitted but `wasm_runtime` could not load |

### Leaderboard — `/api/leaderboard`

| Method | Path | Rate | Description |
|---|---|---|---|
| GET | `/api/leaderboard?level=&class_id=&challenge_id=&page=&per_page=` | 30/min | Ranked entries. `level` → per-difficulty dense rank; `class_id` → class-scoped (requires auth + membership); `challenge_id` → challenge-scoped (requires auth). |
| GET | `/api/leaderboard/me?level=&page=&per_page=` | 30/min | Personal timeline for the authenticated caller, sourced from their own completed sessions (includes practice + teacher-preview runs, which public boards exclude); `is_personal_best` flag per row |
| POST | `/api/leaderboard` | 10/min | Manual score submission (fallback if event-bus auto-create failed) |

### Achievements — `/api/achievements`

| Method | Path | Rate | Description |
|---|---|---|---|
| GET | `/api/achievements` | 60/min | All achievement definitions with caller's unlock status |
| GET | `/api/achievements/summary` | 60/min | Unlock count, total talent points earned |

### Seasons — `/api/seasons` (read) + `/api/admin/seasons` (write)

| Method | Path | Rate | Description |
|---|---|---|---|
| GET | `/api/seasons` | 60/min | List defined achievement seasons (auth required, sibling `seasons_router` in `routers/achievement.py`) |
| GET | `/api/admin/seasons` | 60/min | Same payload, admin-only (used by the admin console) |
| POST | `/api/admin/seasons` | 30/min | Upsert a season window (admin only) |

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
| POST | `/api/classes/{id}/archive` | 10/min | Archive a class (hidden from active lists; teacher-owner) |
| POST | `/api/classes/{id}/unarchive` | 10/min | Restore an archived class (teacher-owner) |
| POST | `/api/classes/{id}/transfer` | 5/min | Transfer class ownership to another teacher |
| POST | `/api/classes/join` | 10/min | Student joins by `join_code` |
| POST | `/api/classes/claim-invites` | 10/min | Student claims pending email invites issued before their account existed |
| POST | `/api/classes/{id}/regenerate-code` | 5/min | Regenerate join code; old code immediately invalid (teacher) |
| GET | `/api/classes/{id}/qr` | 30/min | Join-QR payload (deep-link `/classes?code=…`) for the current join code (teacher/admin) |
| POST | `/api/classes/{id}/students` | 30/min | Add a student by email directly (teacher, must own) |
| POST | `/api/classes/{id}/students/bulk` | 5/min | Bulk-add students by email list; unknown emails become pending invites (teacher) |
| GET | `/api/classes/{id}/students` | 30/min | List enrolled students (teacher/admin) |
| DELETE | `/api/classes/{id}/students/{student_id}` | 30/min | Remove student; cascades territory occupations (teacher) |
| POST | `/api/classes/{id}/students/{student_id}/move` | 10/min | Move a student to another class owned by the same teacher |
| GET | `/api/classes/{id}/co-teachers` | 30/min | List co-teacher grants (teacher/admin) |
| POST | `/api/classes/{id}/co-teachers` | 10/min | Grant co-teacher access by email (owner) |
| DELETE | `/api/classes/{id}/co-teachers/{teacher_id}` | 10/min | Revoke a co-teacher grant (owner) |
| GET | `/api/classes/{id}/invites` | 30/min | List pending email invites (teacher/admin) |
| DELETE | `/api/classes/{id}/invites/{email}` | 10/min | Cancel a pending invite (teacher) |
| GET | `/api/classes/{id}/groups` | 30/min | List named student sub-groups (teacher/admin) |
| POST | `/api/classes/{id}/groups` | 20/min | Create a group (teacher) |
| PUT | `/api/classes/{id}/groups/{group_id}` | 20/min | Rename a group (teacher) |
| DELETE | `/api/classes/{id}/groups/{group_id}` | 20/min | Delete a group (teacher) |
| GET | `/api/classes/{id}/groups/{group_id}/members` | 30/min | List group members (teacher/admin) |
| POST | `/api/classes/{id}/groups/{group_id}/members/{student_id}` | 30/min | Add a student to a group (teacher) |
| DELETE | `/api/classes/{id}/groups/{group_id}/members/{student_id}` | 30/min | Remove a student from a group (teacher) |
| GET | `/api/classes/{id}/leaderboard` | 30/min | Class-scoped leaderboard (teacher/admin/member) |
| GET | `/api/classes/{id}/report` | 10/min | Per-student aggregate report rows (teacher/admin); practice + preview sessions excluded so ranks match the public boards |
| GET | `/api/classes/{id}/report.csv` | 10/min | Same report as CSV download — UTF-8 BOM for Excel + `csv_safe` formula-injection neutralisation on user-controlled cells |
| GET | `/api/classes/{id}/reflections` | 30/min | Per-session reflection feed for a class (teacher/admin) |

### Admin — `/api/admin`

| Method | Path | Rate | Description |
|---|---|---|---|
| GET | `/api/admin/teachers?page=&per_page=` | 30/min | Paginated teacher accounts |
| POST | `/api/admin/teachers` | 5/min | Provision a new teacher account (admin only); returns the created user |
| GET | `/api/admin/students?page=&per_page=` | 30/min | Paginated student accounts |
| GET | `/api/admin/classes?page=&per_page=` | 30/min | Paginated classes |
| PATCH | `/api/admin/users/{user_id}/active` | 30/min | Soft-ban / unban a user (sets `is_active`) |
| GET | `/api/admin/seasons` | 60/min | Same as `GET /api/seasons` but admin-scoped |
| POST | `/api/admin/seasons` | 30/min | Upsert season window |

### Assessment — `/api/assessment`

| Method | Path | Rate | Description |
|---|---|---|---|
| GET | `/api/assessment/class/{class_id}/posteriors` | 30/min | Per-student Beta posteriors + recommended next-step competency for the teacher dashboard; teacher must own the class |

### Recommendation — `/api/recommendation`

| Method | Path | Rate | Description |
|---|---|---|---|
| GET | `/api/recommendation/me` | 60/min | Adaptive star-rating + talent-node suggestion from the caller's competency posteriors |
| GET | `/api/recommendation/territory/{activity_id}` | 60/min | Slot suggestion for a Grabbing Territory activity — returns `null` if no recommendation applies |

### Challenges — `/api/challenges`

| Method | Path | Rate | Description |
|---|---|---|---|
| POST | `/api/challenges` | 10/min | Create a constrained challenge (teacher/admin) |
| GET | `/api/challenges?mine=true` | 60/min | List challenges authored by the caller (teacher/admin; non-`mine` returns `[]`; students get `403`) |
| GET | `/api/challenges/{id}` | 60/min | Fetch a single challenge by id (any authenticated user — deep-link sharing model) |
| PATCH | `/api/challenges/{id}` | 20/min | Rename / update title or description (teacher-owner or admin) |
| PUT | `/api/challenges/{id}/constraints` | 10/min | Replace the challenge's constraint payload (teacher-owner or admin; rejected with `ChallengeImmutableError` once played) |
| DELETE | `/api/challenges/{id}` | 10/min | Soft-delete (teacher-owner or admin; sets `deleted_at`); historical sessions/leaderboard rows still resolve `challenge_id` |

### Replay & Spectate — `/api/sessions`

| Method | Path | Rate | Description |
|---|---|---|---|
| POST | `/api/sessions/{session_id}/events` | 60/min | Recorder flushes a batch of session events (returns 202; idempotent via `(session_id, seq)`); fans out to live spectators via the in-process spectate hub |
| GET | `/api/sessions/{session_id}/replay` | 30/min | Returns `rng_seed` + `replay_version` + `star_rating` + ordered event stream so `EventPlayer` can reconstruct the run |
| WS | `/api/sessions/{session_id}/spectate` | — | WebSocket: sends a `snapshot` frame (history) then live `event` frames. Owner-only. Periodic auth re-validation every 60 s closes long-lived idle sockets after a ban / password-rotate. |

### Study — `/api/study` (Empirical Validity Probe)

| Method | Path | Rate | Description |
|---|---|---|---|
| POST | `/api/study/enroll?study_id=` | 10/min | Idempotent enrollment (student-only); returns deterministic A/B group from `assign_group()` |
| POST | `/api/study/probe` | 10/min | Submit a probe form (student-only; `form` ∈ `pre`/`post`/`delay`); returns the score |
| POST | `/api/study/affect` | 10/min | Submit a Likert affect survey (student-only; `phase` ∈ `pre`/`post`); 204 No Content |
| GET | `/api/study/export?study_id=` | 10/min | Admin-only CSV export — one row per participant; CSV-injection-safe |

### Territory — `/api/activities`

| Method | Path | Rate | Description |
|---|---|---|---|
| POST | `/api/activities` | 10/min | Create Grabbing Territory activity (teacher; optional `class_id` to scope; `slot_count` ≤ 50; optional `student_slot_cap` 1–50, default 5) |
| GET | `/api/activities` | 30/min | List activities visible to caller (optional `?class_id=` filter) |
| GET | `/api/activities/{id}` | 30/min | Activity + slots + current occupations |
| POST | `/api/activities/{id}/slots/{slot_id}/play` | 30/min | Seize or counter-seize a slot using a completed session (student; cap enforced) |
| GET | `/api/activities/{id}/rankings` | 30/min | Territory rankings ordered by weighted occupation star-value |
| GET | `/api/activities/{id}/rankings/with-meta` | 60/min | Rankings + caller's rank + composition + last-occupation timestamps + rank-change |
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
| `role` | Enum | `admin` / `teacher` / `student`; default `student` |
| `is_active` | Boolean | Soft-ban flag; admin-controllable via `PATCH /api/admin/users/{id}/active` |
| `password_hash` | String(255) | bcrypt hash |
| `password_version` | Integer | Bumped on password change to invalidate older JWTs |
| `is_email_verified`, `mfa_enabled`, `totp_secret`, `totp_last_used_at` | — | `is_email_verified` is a legacy flag (no verification flow); the rest back TOTP MFA (`totp_last_used_at` = step-replay guard) |
| `ia_recent_accuracy` | Float | Rolling fraction of last 10 IA-correct sessions; drives Star-1 concrete-fading |
| `endpoint_marker_style` | String(16) | Nullable; CHECK ∈ `star`/`gorilla`/`custom`; player's P\* endpoint-marker style (NULL = FE default) |
| `endpoint_marker_custom_dataurl` | Text | Nullable; PNG/JPEG data-URL for a custom endpoint marker (only valid when style = `custom`) |
| `endpoint_hit_fx` | String(16) | Nullable; CHECK ∈ `random`/`fragments`/`crying`/`angry`; endpoint hit-effect style |
| `profile_initials_letters` | String(2) | Nullable; profile-initials avatar letters (1–2 chars). Paired CHECK `ck_user_profile_initials_paired` — both initials columns NULL or both set |
| `profile_initials_color` | String(7) | Nullable; avatar colour as `#RRGGBB` (enforced by the paired CHECK) |
| `created_at`, `updated_at` | DateTime | Auto-managed |

### GameSession

| Column | Type | Notes |
|---|---|---|
| `id` | String | UUID primary key |
| `user_id` | String | FK → User (ON DELETE CASCADE) |
| `star_rating` | Integer | CHECK 1–5 (difficulty level) |
| `path_config` | JSON | Serialised generated curve path (nullable) |
| `initial_answer` | Boolean | Whether the player answered the initial-answer screen correctly |
| `status` | Enum | `active` / `completed` / `abandoned` |
| `current_wave`, `gold`, `hp`, `score` | Integer | Progress metrics |
| `kills`, `waves_survived` | Integer | End-of-session counters |
| `kill_value`, `cost_total` | Integer | Cumulative weighted kill value / total gold spent (V2 scoring) |
| `time_total` | Float | Total active time in seconds |
| `time_exclude_prepare` | JSON | Array of prepare-phase durations excluded from scoring time |
| `health_origin`, `health_final` | Integer | HP at level start and end (scoring formula inputs) |
| `total_score` | Float | Server-recomputed canonical score: `max(0, killValue)^exponent · k · difficulty(star)` (× `SCALE` = 1). Server-authoritative — the modern client does not submit it |
| `reflection_text` | String(2000) | Free-text reflection captured after a winning wave |
| `practice_mode` | Boolean | Excluded from the global leaderboard; achievement/talent awards still fire |
| `is_preview` | Boolean | Server-derived from caller's role at create — true when a teacher or admin ran the session. Same leaderboard-exclusion semantics as `practice_mode`; client cannot set this |
| `rng_seed` | BigInteger | Per-session deterministic RNG seed; replayed by `EventPlayer` |
| `replay_version` | SmallInteger | `1` = legacy (mulberry32 + JS Math, ε=5e-4) / `2` = bit-exact (PCG + WASM, ε=1e-4 strict). v2 mismatch → `ReplayMismatchError → 422 replay_mismatch`; v2 with no WASM → `ReplayUnavailableError → 503` |
| `challenge_id` | String (FK) | Non-NULL when launched from a challenge deep-link; FK to `challenges` (SET NULL on soft delete) |
| `started_at`, `ended_at` | DateTime | `ended_at` nullable |

Indexes: `ix_game_session_user_id`, `ix_game_sessions_challenge_id`; partial unique `uq_one_active_per_user WHERE status='active'` — enforces at most one active session per user.

### LeaderboardEntry

| Column | Type | Notes |
|---|---|---|
| `id` | String | UUID primary key |
| `user_id` | String | FK → User (ON DELETE SET NULL), nullable |
| `session_id` | String | FK → GameSession (ON DELETE SET NULL), unique |
| `level` | Integer | CHECK 1–5 (stores star_rating of the completed session) |
| `score`, `kills`, `waves_survived` | Integer | |
| `total_score` | Float | Nullable; floating-point score. `COALESCE(total_score, score)` drives **both** the ranking and the displayed value, falling back to raw `score` for legacy rows |
| `challenge_id` | String (FK) | Nullable; ON DELETE CASCADE — deleting a challenge removes its leaderboard entries so wave-restricted/uncapped challenge scores never leak into global rankings |
| `created_at` | DateTime | |

Unique on `session_id` — guarantees one leaderboard entry per completed session, which is what makes the event-driven auto-create idempotent.

---

## Setup & Running

### Local

```bash
cd backend
python -m venv .venv
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
# macOS/Linux:        source .venv/bin/activate
pip install -r requirements-dev.txt    # includes pytest; use requirements.txt for prod
cp ../.env.example .env                # creates backend/.env — uvicorn resolves env_file=".env" from backend/ cwd
# Edit .env: change DATABASE_URL host from 'postgres' to 'localhost' for non-Docker PG
# then fill in SECRET_KEY, POSTGRES_PASSWORD, TOTP_ENCRYPTION_KEY
# Alembic upgrade head runs automatically from FastAPI lifespan on first boot.
# To run migrations manually (e.g. before launching workers):
#   alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The schema is applied on first boot via `alembic upgrade head` (invoked from the FastAPI `lifespan`, serialised across workers with a PostgreSQL advisory lock — fixed key `483_921_746`). Interactive API docs at http://localhost:8000/docs (only mounted when `DEBUG=true`).

The lifespan also seeds the demo user and starts two background asyncio tasks:

| Task | Purpose |
|---|---|
| `_auth_store_janitor` (10-min interval) | Purges expired JWT deny-list rows + stale `login_attempts` rows so the auth path never has to clean up inline (removes a TOCTOU window and a DoS amplifier under logout spam) |
| `territory_settlement_task` (5-min interval) | Settles `grabbing_territory_activities` whose `deadline` has passed |

The HTTP layer also installs:

- `SecurityHeadersMiddleware` — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`, and `Cache-Control: no-store` on `/api/auth/*`.
- `CsrfMiddleware` — double-submit cookie (`csrf_token` cookie + `X-CSRF-Token` header) on unsafe methods whenever the auth cookie is present.
- A `RequestValidationError` handler that scrubs Pydantic `ctx.error` reprs (to avoid leaking validator internals) while keeping `loc` / `type` so the SPA can map errors to inputs.
- A catch-all `Exception` handler that returns a fixed `{"detail":"Internal server error"}` body and logs the traceback server-side.

### Docker

```bash
docker compose up backend        # from project root (older installs: docker-compose)
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | Yes | JWT signing secret — minimum 32 characters; generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `DATABASE_URL` | Yes | SQLAlchemy URL, e.g. `postgresql+psycopg://mathdefense:changeme@postgres:5432/math_defense`. Scheme must be `postgresql+psycopg` (psycopg v3); the bare `postgresql://` alias resolves to unmaintained psycopg2. |
| `DATABASE_URL_APP` | No | Optional least-privilege runtime URL. When set, the runtime engine (`app/db/database.py`) connects with the DML-only `mathdefense_app` role while Alembic (`alembic/env.py`) keeps migrating as the admin `DATABASE_URL`. Same scheme + `changeme` rejection as `DATABASE_URL`. Unset/blank → runtime falls back to `DATABASE_URL`. |
| `POSTGRES_PASSWORD` | Yes (Docker) | Password for the `postgres` service. Must match the password embedded in `DATABASE_URL`. |
| `CORS_ORIGINS` | Yes | Comma-separated browser origins. No default — an absent value raises at startup rather than silently defaulting to localhost in prod. |
| `ALGORITHM` | No | JWT algorithm (default `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Default `15` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | Default `30` (sets refresh cookie `max-age`) |
| `FRONTEND_URL` | Yes | Base URL used in outbound emails (sign-in links in the welcome / account-exists mail). Required — no default so production cannot silently emit links pointing at localhost. |
| `JWT_ISSUER` | No | Default `math-defense-api`. Bound into every JWT `iss` and required at decode time. |
| `JWT_AUDIENCE` | No | Default `math-defense-clients`. Bound into every JWT `aud` and required at decode time. |
| `PROXY_MODE` | No | Default `false`. When `true`, per-IP rate limiting reads the real client from `X-Forwarded-For`. |
| `TRUSTED_PROXY_IPS` | No | Comma-separated IP/CIDR list whose `X-Forwarded-For` the backend trusts (consulted when `PROXY_MODE=true`). |
| `TOTP_ENCRYPTION_KEY` | Yes | AES-256 Fernet key encrypting TOTP secrets at rest. Required at startup unconditionally — `lifespan` calls `verify_key_configured()` before the first request — so a missing/malformed key fails loudly instead of surfacing as a 500 on the first MFA-related request. Generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. |
| `SEED_DEMO_USER` | No | Default `false`. Set `true` to seed the dev teacher + student + admin accounts on startup (see `backend/app/seed.py`); the credentials are mirrored in `frontend/src/views/AuthView.vue`'s dev hint. A localhost-only guard refuses to seed unless `FRONTEND_URL` resolves to a recognised local-dev host. |
| `SEED_ADMIN_EMAIL` | No | Bootstrap admin e-mail. Set together with `SEED_ADMIN_PASSWORD` to seed the first admin account on startup. Omitting either is a no-op. |
| `SEED_ADMIN_PASSWORD` | No | Bootstrap admin password (stored as a bcrypt hash). Create-once semantics: if the e-mail already exists the row is never modified, so an in-app password change is preserved. You may blank this after first boot. Generate with `python -c "import secrets; print(secrets.token_urlsafe(24))"`. |
| `SEED_ADMIN_NAME` | No | Display name for the bootstrapped admin account. Default `Admin`. |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` / `DB_POOL_RECYCLE` | No | SQLAlchemy pool tuning. Defaults: `10` / `20` / `3600` s. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` / `SMTP_TLS` | No | Optional; when `SMTP_HOST` is empty `email_service` becomes a no-op. |
| `SESSION_STALE_CUTOFF_HOURS` | No | Default `2.0`; active sessions older than this are auto-abandoned |
| `COOKIE_SECURE` | No | Default `true`. Sets `Secure` flag on auth + refresh cookies. Only `false` is honoured under CI/pytest — outside tests, startup aborts so plain-HTTP deployments cannot silently leak cookies. |
| `CSRF_ENABLED` | No | Default `true` outside the pytest/CI harness. `CsrfMiddleware` enforces a double-submit cookie on unsafe methods whenever the auth cookie is present. |
| `DEBUG` | No | Default `false`. When `true`, mounts `/docs`, `/redoc`, `/openapi.json`. |

> Schema is managed exclusively by Alembic — `lifespan` runs `alembic upgrade head` on boot.

---

## Testing

```bash
pytest                                       # 33 test files
pytest tests/test_session_aggregate.py -v    # pure aggregate unit tests
pytest tests/test_coverage_gaps.py -v        # cross-cutting edge cases
pytest tests/test_territory.py -v            # territory integration tests
pytest tests/test_competency_estimator.py -v # Beta posterior update rule
pytest tests/test_assessment_router.py -v    # /api/assessment posteriors + RBAC
pytest tests/test_challenge.py -v            # challenge CRUD + soft-delete + immutability
pytest tests/test_study.py -v                # validity probe enrollment + export
pytest tests/test_recommender.py -v          # adaptive star/talent recommendation
pytest tests/test_refresh_token.py -v        # refresh-token rotation + reuse
pytest tests/test_wasm_runtime.py -v         # WASM runtime lifecycle
```

The test suite targets a dedicated PostgreSQL database (the dev DB name with a `_test` suffix; auto-created on first run). Each test truncates all tables before it starts so the suite shares one connection pool without cross-test pollution. Notable coverage includes:

- Aggregate state-transition matrix (illegal `update / complete / abandon` calls across every `SessionStatus`)
- Stale-session auto-abandon side-effect ordering (must commit *before* raising)
- Per-level / per-class / per-challenge `dense_rank` partitioning
- Real rate-limiter enablement (session create → 429 at 30/min)
- Abuse cases: negative hp, `score` going backwards, per-update score delta above the per-level cap (`max_score_delta_for`, e.g. 3334 at L1), refresh-token reuse
- FK cascade behaviour (PG enforces `ON DELETE CASCADE` / `SET NULL` natively — no fixture gymnastics)
- WASM v2 strict tolerance + fail-closed when `wasm_runtime` cannot load

---

## Rate Limiting

Implemented via `slowapi` (Starlette port of Flask-Limiter), keyed by client IP. Login additionally checks a per-email throttle and per-account `login_guard`.

| Endpoint | Limit |
|---|---|
| `POST /auth/register` | 5/min per IP |
| `POST /auth/login` | 10/min per IP (+ per-email throttle + per-account lockout) |
| `POST /auth/logout` | 30/min |
| `POST /auth/refresh` | 30/min |
| `POST /auth/change-password` | 5/min |
| `GET /auth/me` | 30/min |
| `PUT /auth/profile/name`, `PUT /auth/profile/endpoint-marker`, `PUT /auth/profile/initials` | 10/min |
| `POST /auth/mfa/setup`, `/mfa/confirm`, `/mfa/disable` | 5/min |
| `POST /auth/mfa/challenge` | 10/min |
| `POST /sessions` | 30/min |
| `GET /sessions/active` | 60/min |
| `PATCH /sessions/{id}` | 120/min |
| `POST /sessions/{id}/end`, `/abandon` | 30/min |
| `POST /sessions/{id}/reflection` | 10/min |
| `POST /sessions/{id}/events` | 60/min |
| `GET /sessions/{id}/replay` | 30/min |
| `GET /leaderboard`, `/leaderboard/me` | 30/min |
| `POST /leaderboard` | 10/min |
| `GET /achievements`, `/achievements/summary` | 60/min |
| `GET /seasons`, `GET /admin/seasons` | 60/min |
| `POST /admin/seasons` | 30/min |
| `GET /talents`, `/talents/modifiers` | 60/min |
| `POST /talents/{node_id}/allocate` | 30/min |
| `POST /talents/reset` | 10/min |
| `POST /classes`, `PUT/DELETE /classes/{id}`, `POST /classes/join`, `POST /classes/claim-invites`, `POST /classes/{id}/archive` + `/unarchive` | 10/min |
| `GET /classes`, `/classes/{id}`, `/classes/{id}/students`, `/classes/{id}/reflections`, `/classes/{id}/qr`, `/classes/{id}/leaderboard`, `GET` co-teachers / invites / groups / group-members | 30/min |
| `POST /classes/{id}/regenerate-code`, `POST /classes/{id}/transfer`, `POST /classes/{id}/students/bulk` | 5/min |
| `POST /classes/{id}/students`, `DELETE /classes/{id}/students/{student_id}`, `POST/DELETE` group members | 30/min |
| `POST /classes/{id}/students/{student_id}/move`, `POST/DELETE` co-teachers, `DELETE /classes/{id}/invites/{email}` | 10/min |
| `POST/PUT/DELETE /classes/{id}/groups…` (group CRUD) | 20/min |
| `GET /classes/{id}/report`, `/classes/{id}/report.csv` | 10/min |
| `GET /admin/teachers`, `/admin/classes`, `/admin/students`, `PATCH /admin/users/{id}/active` | 30/min |
| `POST /admin/teachers` | 5/min |
| `POST /activities`, `/activities/{id}/settle` | 10/min, 5/min |
| `GET /activities`, `/activities/{id}`, `/activities/{id}/rankings`, `/activities/{id}/external-rankings` | 30/min |
| `GET /activities/{id}/rankings/with-meta` | 60/min |
| `POST /activities/{id}/slots/{slot_id}/play` | 30/min |
| `GET /assessment/class/{class_id}/posteriors` | 30/min |
| `GET /recommendation/me`, `/recommendation/territory/{id}` | 60/min |
| `POST /challenges`, `PUT /challenges/{id}/constraints`, `DELETE /challenges/{id}` | 10/min |
| `GET /challenges`, `/challenges/{id}` | 60/min |
| `PATCH /challenges/{id}` | 20/min |
| `POST /study/enroll`, `/study/probe`, `/study/affect`, `GET /study/export` | 10/min |

Exceeding the limit returns `HTTP 429 Too Many Requests`. WebSocket spectate (`/api/sessions/{id}/spectate`) is not rate-limited at the slowapi layer; the recorder's 1 Hz flush cadence implicitly bounds spectator fan-out.
