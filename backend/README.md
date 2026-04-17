# Backend — FastAPI (DDD)

REST API server for Math Defense: authentication, game-session lifecycle, and leaderboard. The code is organised into **Domain / Application / Infrastructure** layers — routers are thin HTTP adapters, business rules live in aggregates, and SQLAlchemy is kept behind repository protocols.

## Tech Stack

| | |
|---|---|
| Framework | FastAPI 0.115 |
| Server | Uvicorn (ASGI) |
| ORM | SQLAlchemy 2.0 |
| Migrations | Alembic |
| Validation | Pydantic v2 + pydantic-settings |
| Auth | PyJWT (HS256) + bcrypt |
| Rate Limiting | slowapi |
| Database | PostgreSQL 16 (psycopg v3; Alembic-managed schema) |
| Testing | pytest + pytest-asyncio |

---

## Directory Layout

```
backend/
├── app/
│   ├── main.py                    FastAPI factory, CORS, lifespan (Alembic upgrade), global DomainError/ValueError handlers
│   ├── config.py                  Settings (Pydantic): SECRET_KEY, DATABASE_URL, CORS_ORIGINS, ...
│   ├── limiter.py                 slowapi Limiter instance shared across routers
│   ├── shared_constants.py        Loads shared/game-constants.json so Python sees the same canvas / grid / player values as the frontend
│   ├── seed.py                    Demo user seeding — ensure_demo_user(); called from lifespan after migrations
│   │
│   ├── domain/                    ── DOMAIN LAYER ──
│   │   ├── value_objects.py       SessionStatus enum, Level, Score, GameResult
│   │   ├── constraints.py         Numeric bounds (LEVEL/SCORE/HP/GOLD/KILLS/WAVES ranges, MAX_SCORE_DELTA) — single source of truth
│   │   ├── errors.py              DomainError hierarchy; each subclass carries its own HTTP status_code
│   │   ├── session/
│   │   │   ├── aggregate.py       GameSession aggregate root (state machine + invariants + events)
│   │   │   ├── events.py          SessionCreated / Updated / Completed / Abandoned
│   │   │   └── repository.py      Repository Protocol (interface only)
│   │   ├── leaderboard/
│   │   │   ├── aggregate.py       LeaderboardEntry aggregate
│   │   │   └── repository.py      Repository Protocol
│   │   └── user/
│   │       ├── aggregate.py       User aggregate root (password_hash only — plaintext never reaches domain)
│   │       └── repository.py      Repository Protocol
│   │
│   ├── application/               ── APPLICATION LAYER ──
│   │   ├── auth_service.py        AuthApplicationService — register / login / authenticate_token
│   │   ├── session_service.py     Session use cases; consumes SessionCompleted to auto-create leaderboard
│   │   ├── leaderboard_service.py Leaderboard query + manual score submission (idempotent)
│   │   └── mappers.py             Aggregate → Pydantic DTO mappers; keeps domain free of Pydantic imports
│   │
│   ├── infrastructure/            ── INFRASTRUCTURE LAYER ──
│   │   ├── unit_of_work.py        SqlAlchemyUnitOfWork — explicit commit; auto-rollback on exit
│   │   ├── login_guard.py         Per-account login-attempt tracker — DB-backed; 5 failures/5-min window triggers 5-min lockout
│   │   ├── token_denylist.py      DB-backed JWT deny-list for server-side logout (jti → expiry); bounded by natural JWT TTL
│   │   └── persistence/
│   │       ├── user_repository.py         SQLAlchemy impl of UserRepository
│   │       ├── session_repository.py      SQLAlchemy impl of SessionRepository
│   │       └── leaderboard_repository.py  SQLAlchemy impl with per-level DENSE_RANK ranking
│   │
│   ├── models/                    SQLAlchemy ORM models
│   │   ├── user.py                User
│   │   ├── game_session.py        GameSession (CHECK level 1–4, partial unique index on active)
│   │   ├── leaderboard.py         LeaderboardEntry (unique session_id)
│   │   ├── login_attempt.py       LoginAttempt (per-username failure count + lockout deadline)
│   │   └── denied_token.py        DeniedToken (revoked JWT JTIs until natural expiry)
│   │
│   ├── schemas/                   Pydantic request/response DTOs
│   │   ├── auth.py
│   │   ├── game_session.py
│   │   └── leaderboard.py
│   │
│   ├── routers/                   HTTP adapters — thin controllers; error translation lives in main.py handlers
│   │   ├── auth.py                /api/auth
│   │   ├── game_session.py        /api/sessions
│   │   └── leaderboard.py         /api/leaderboard
│   │
│   ├── db/database.py             Engine, Base, get_db() session factory
│   ├── middleware/auth.py         get_current_user() dependency (JWT → User aggregate)
│   └── utils/
│       ├── security.py            hash_password, verify_password, create_access_token, decode_token
│       └── integrity.py           is_constraint_violation() — matches PG constraint name on IntegrityError.orig.diag
│
├── alembic/                       Alembic migration environment (versions/ + env.py)
├── alembic.ini                    Alembic config; DATABASE_URL injected at runtime
│
├── tests/
│   ├── conftest.py                Fixtures (PG `math_defense_test` DB, TRUNCATE-per-test isolation, test client)
│   ├── test_auth.py                       (5)
│   ├── test_game_session.py               (11)
│   ├── test_leaderboard.py                (6)
│   ├── test_session_aggregate.py          (26) — pure aggregate unit tests
│   ├── test_value_objects.py              (15) — VO invariants
│   ├── test_coverage_gaps.py              (12) — audit-driven edge cases
│   └── test_shared_constants_parity.py    (3)  — Python ↔ shared/game-constants.json parity
│
├── requirements.txt
└── Dockerfile
```

---

## DDD Layers

### Domain

Pure Python — no SQLAlchemy, no FastAPI.

- **Value objects** (`value_objects.py`): `SessionStatus` enum, `Level` (1–4), `Score` (0 – 9,999,999), `GameResult`. Immutable dataclasses that validate on construction.
- **Constraints** (`constraints.py`): numeric bounds (level / score / hp / gold / kills / waves ranges, `MAX_SCORE_DELTA`) — imported by both Pydantic schemas and value-object/aggregate invariants so each limit is encoded exactly once.
- **`GameSession` aggregate** (`session/aggregate.py`): the root. Owns its state transitions via `_ALLOWED_TRANSITIONS`; `update_progress()` / `complete()` / `abandon()` raise if called in an illegal status. Score is monotonic; per-update deltas are capped to reject obvious abuse. Emits domain events into an internal buffer collected by the application layer.
- **`LeaderboardEntry` aggregate** — created from a `GameSession` result. Holds `score` as a `Score` VO.
- **`User` aggregate** (`user/aggregate.py`) — stable `id`, immutable `password_hash`. Plaintext passwords never reach the domain — hashing happens in `AuthApplicationService` before construction.
- **Errors** (`errors.py`): `DomainError` hierarchy. Each subclass owns its `status_code`; the global exception handler in `main.py` reads the attribute so routers never see try/except walls.
- **Repository protocols** — interface-only (`typing.Protocol`) so the domain never imports from `infrastructure/`.

### Application

Use-case orchestration. One method per user intent.

- **`AuthApplicationService`**
  - `register(username, password)` — hashes the password with bcrypt, persists a `User`, returns `(user, access_token)`. `UsernameTakenError` on unique-violation.
  - `login(username, password)` — `InvalidCredentialsError` on mismatch.
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

All domain errors (`SessionNotFoundError`, `SessionStaleError`, `InvalidStatusTransitionError`, `SessionNotActiveError`, `PermissionDeniedError`, `DuplicateSubmissionError`, `UsernameTakenError`, `InvalidCredentialsError`, `InvalidTokenError`, `UserNotFoundError`, `SessionValidationError`) inherit from `DomainError` and carry their own `status_code`. The global handler in `main.py` surfaces them — routers never translate manually. Aggregate invariants that raise plain `ValueError` are mapped to `422` by a second handler. `mappers.py` converts aggregates to Pydantic DTOs so routers stay one-liners.

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

Base path: `/api`. All session / leaderboard-submit endpoints require `Authorization: Bearer <token>`.

### Authentication — `/api/auth`

| Method | Path | Rate | Description |
|---|---|---|---|
| POST | `/api/auth/register` | 5/min | Create account, return token |
| POST | `/api/auth/login` | 10/min | Authenticate, return token |
| POST | `/api/auth/logout` | — | Revoke current token — adds JTI to deny-list until natural expiry |
| GET | `/api/auth/me` | — | Current user |

Token: HS256 JWT, 30-minute expiry (configurable). Passwords: bcrypt, ≥8 chars with letter + digit. Logout is server-side: the JTI is denied even if the token has not yet expired. Login failures are tracked per-account (`login_guard`): 5 consecutive failures within 5 minutes trigger a 5-minute lockout.

### Game Sessions — `/api/sessions`

| Method | Path | Rate | Description |
|---|---|---|---|
| POST | `/api/sessions` | 30/min | Create session for `level` (1–4); abandons existing active session first |
| GET | `/api/sessions/active` | 60/min | Fetch caller's active session (null if none) |
| PATCH | `/api/sessions/{id}` | 120/min | Update `current_wave`, `gold`, `hp`, `score` (any subset; ≥1 field) |
| POST | `/api/sessions/{id}/abandon` | 30/min | Idempotent abandon |
| POST | `/api/sessions/{id}/end` | 30/min | Complete with `score` / `kills` / `waves_survived` → auto-creates leaderboard entry |

**Validation bounds** (enforced at schema + aggregate + DB layers):

| Field | Range |
|---|---|
| `level` | 1 – 4 |
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
| `409` | `UsernameTakenError`, `InvalidStatusTransitionError`, `SessionNotActiveError`, `DuplicateSubmissionError` | Conflict: unique violation, illegal state transition, already-scored session |
| `410` | `SessionStaleError` | Session > 2h active — auto-abandoned before raise |
| `422` | `ValueError` from aggregate invariants | Bounds violation, score going backwards, delta > 50 000 |
| `429` | slowapi `RateLimitExceeded` | Rate limit exceeded |

### Leaderboard — `/api/leaderboard`

| Method | Path | Rate | Description |
|---|---|---|---|
| GET | `/api/leaderboard?level=&page=&per_page=` | — | Ranked entries. `level` gives per-level dense rank; omitting gives global rank |
| POST | `/api/leaderboard` | 10/min | Manual score submission (fallback if auto-create failed) |

Query params: `level` 1–4 optional, `page` default 1, `per_page` default 20 (max 100).

---

## Database Models

### User

| Column | Type | Notes |
|---|---|---|
| `id` | String | UUID primary key |
| `username` | String(50) | Unique, indexed |
| `password_hash` | String(255) | bcrypt hash |
| `created_at`, `updated_at` | DateTime | Auto-managed |

### GameSession

| Column | Type | Notes |
|---|---|---|
| `id` | String | UUID primary key |
| `user_id` | String | FK → User (ON DELETE CASCADE) |
| `level` | Integer | CHECK 1–4 |
| `status` | Enum | `active` / `completed` / `abandoned` |
| `current_wave`, `gold`, `hp`, `score` | Integer | Progress metrics |
| `started_at`, `ended_at` | DateTime | `ended_at` nullable |

Indexes: `ix_game_session_user_id`; partial unique `uq_one_active_per_user WHERE status='active'` — enforces at most one active session per user.

### LeaderboardEntry

| Column | Type | Notes |
|---|---|---|
| `id` | String | UUID primary key |
| `user_id` | String | FK → User (ON DELETE CASCADE) |
| `session_id` | String | FK → GameSession (ON DELETE SET NULL), unique |
| `level` | Integer | CHECK 1–4 |
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

The schema is applied on first boot via `alembic upgrade head` (invoked from the FastAPI `lifespan`). Interactive API docs: http://localhost:8000/docs.

### Docker

```bash
docker-compose up backend        # from project root
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | Yes | JWT signing secret — minimum 16 characters |
| `DATABASE_URL` | Yes | SQLAlchemy URL, e.g. `postgresql+psycopg://mathdefense:changeme@postgres:5432/math_defense`. Scheme must be `postgresql+psycopg` (psycopg v3); the bare `postgresql://` alias resolves to unmaintained psycopg2. |
| `POSTGRES_PASSWORD` | Yes (Docker) | Password for the `postgres` service. Must match the password embedded in `DATABASE_URL`. |
| `CORS_ORIGINS` | Yes | Comma-separated browser origins. No default — an absent value raises at startup rather than silently defaulting to localhost in prod. |
| `ALGORITHM` | No | JWT algorithm (default `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Default `30` |
| `SESSION_STALE_CUTOFF_HOURS` | No | Default `2.0`; active sessions older than this are auto-abandoned |

> Schema is managed exclusively by Alembic — `lifespan` runs `alembic upgrade head` on boot. There is no `AUTO_CREATE_TABLES` toggle (removed during the PostgreSQL-only migration).

---

## Testing

```bash
pytest                                      # all 86 tests
pytest tests/test_session_aggregate.py -v   # pure aggregate unit tests
pytest tests/test_coverage_gaps.py -v       # audit-driven edge cases
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
| `POST /sessions` | 30/min |
| `GET /sessions/active` | 60/min |
| `PATCH /sessions/{id}` | 120/min |
| `POST /sessions/{id}/end` | 30/min |
| `POST /sessions/{id}/abandon` | 30/min |
| `POST /leaderboard` | 10/min |

Exceeding the limit returns `HTTP 429 Too Many Requests`.
