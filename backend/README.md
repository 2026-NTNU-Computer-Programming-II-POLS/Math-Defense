# Backend — FastAPI

REST API server providing authentication, game session management, and leaderboard services for Math Defense.

## Tech Stack

| | |
|---|---|
| Framework | FastAPI 0.115 |
| Server | Uvicorn (ASGI) |
| ORM | SQLAlchemy 2.0 |
| Migrations | Alembic |
| Validation | Pydantic v2 |
| Auth | PyJWT (HS256) + bcrypt |
| Rate Limiting | slowapi |
| Database | SQLite (dev) |
| Testing | pytest + pytest-asyncio |

---

## Directory Layout

```
backend/
├── app/
│   ├── main.py              FastAPI app factory, CORS, lifespan, route registration
│   ├── config.py            Settings loaded from .env (SECRET_KEY, DATABASE_URL, etc.)
│   ├── limiter.py           slowapi rate limiter instance
│   ├── db/
│   │   └── database.py      SQLAlchemy engine, Base, get_db() session factory
│   ├── models/
│   │   ├── user.py          User table (UUID PK, username, password_hash, timestamps)
│   │   ├── game_session.py  GameSession table (user_id FK, level, status, metrics)
│   │   └── leaderboard.py   LeaderboardEntry table (user_id, level, score, kills, waves)
│   ├── schemas/
│   │   ├── auth.py          RegisterRequest, LoginRequest, TokenResponse, UserResponse
│   │   ├── game_session.py  CreateSessionRequest, UpdateSessionRequest, SessionResponse
│   │   └── leaderboard.py   SubmitScoreRequest, LeaderboardEntryResponse
│   ├── routers/
│   │   ├── auth.py          POST /register, POST /login, GET /me
│   │   ├── game_session.py  POST /, PATCH /{id}, POST /{id}/end
│   │   └── leaderboard.py   GET /, POST /
│   ├── middleware/
│   │   └── auth.py          get_current_user() dependency (JWT → User)
│   └── utils/
│       └── security.py      hash_password(), verify_password(), create_access_token()
├── tests/
│   ├── test_auth.py
│   ├── test_sessions.py
│   └── test_leaderboard.py
├── requirements.txt
└── Dockerfile
```

---

## API Reference

Base path: `/api`

### Authentication — `/api/auth`

#### `POST /api/auth/register`

Create a new user account.

**Request body**
```json
{ "username": "string", "password": "string" }
```

**Response `201`**
```json
{ "access_token": "string", "token_type": "bearer", "user": { "id": "uuid", "username": "string" } }
```

Rate limit: 5 requests/minute per IP.

---

#### `POST /api/auth/login`

Authenticate an existing user.

**Request body**
```json
{ "username": "string", "password": "string" }
```

**Response `200`**
```json
{ "access_token": "string", "token_type": "bearer", "user": { "id": "uuid", "username": "string" } }
```

Rate limit: 10 requests/minute per IP.

---

#### `GET /api/auth/me`

Get the current authenticated user. Requires `Authorization: Bearer <token>`.

**Response `200`**
```json
{ "id": "uuid", "username": "string", "created_at": "datetime" }
```

---

### Game Sessions — `/api/sessions`

All session endpoints require `Authorization: Bearer <token>`.

#### `POST /api/sessions`

Create a new game session when a level starts.

**Request body**
```json
{ "level": 1 }
```

**Response `201`**
```json
{ "id": "uuid", "user_id": "uuid", "level": 1, "status": "active", "score": 0, "gold": 200, "hp": 20, "current_wave": 0, "started_at": "datetime", "ended_at": null }
```

---

#### `PATCH /api/sessions/{session_id}`

Update session state during gameplay (called periodically by the frontend).

**Request body** (all optional, but at least one field required)
```json
{ "gold": 320, "hp": 18, "score": 450, "current_wave": 2 }
```

**Response `200`** — updated session object.

---

#### `POST /api/sessions/{session_id}/end`

End a session and automatically create a leaderboard entry via the `SessionCompleted` domain event.

**Request body**
```json
{ "score": 4800, "kills": 120, "waves_survived": 5 }
```

**Response `200`** — updated session object (same shape as `POST /api/sessions` response, with `status: "completed"` and `ended_at` populated).

---

### Leaderboard — `/api/leaderboard`

#### `GET /api/leaderboard`

Fetch leaderboard entries, optionally filtered by level.

**Query params**

| Param | Type | Default | Description |
|---|---|---|---|
| `level` | int | — | Filter to a specific level (1–4) |
| `page` | int | 1 | Page number (1-indexed) |
| `per_page` | int | 20 | Entries per page (max 100) |

**Response `200`**
```json
{
  "entries": [
    { "rank": 1, "username": "string", "level": 2, "score": 4800, "kills": 120, "waves_survived": 5, "created_at": "datetime" }
  ],
  "total": 42
}
```

---

#### `POST /api/leaderboard`

Submit a score directly (used if auto-submit on session end fails). Requires `Authorization: Bearer <token>`.

**Request body**
```json
{ "session_id": "uuid", "level": 2, "score": 4800, "kills": 120, "waves_survived": 5 }
```

**Response `201`** — created leaderboard entry.

---

## Database Models

### User

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `username` | VARCHAR(50) | Unique, indexed |
| `password_hash` | VARCHAR | bcrypt hash |
| `created_at` | DATETIME | Auto-set |
| `updated_at` | DATETIME | Auto-updated |

### GameSession

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → User |
| `level` | INT | 1–4 |
| `status` | ENUM | `active` / `completed` / `abandoned` |
| `score` | INT | Running score |
| `gold` | INT | Current gold |
| `hp` | INT | Current HP |
| `current_wave` | INT | Current wave number |
| `started_at` | DATETIME | |
| `ended_at` | DATETIME | Nullable |

### LeaderboardEntry

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → User |
| `session_id` | UUID | FK → GameSession |
| `level` | INT | |
| `score` | INT | |
| `kills` | INT | |
| `waves_survived` | INT | |
| `created_at` | DATETIME | |

---

## Authentication Flow

```
Client                        Backend
  │                              │
  ├── POST /auth/register ──────>│ hash_password(bcrypt)
  │<── {access_token, user} ─────│ create_access_token(HS256, exp=30min)
  │                              │
  ├── POST /auth/login ─────────>│ verify_password → create_access_token
  │<── {access_token, user} ─────│
  │                              │
  ├── GET /auth/me ─────────────>│ decode JWT → load User from DB
  │   Authorization: Bearer ...  │
  │<── {id, username} ───────────│
```

Token format: HS256 JWT, 30-minute expiry. The secret key comes from `SECRET_KEY` in `.env`.

---

## Setup & Running

### Local (no Docker)

```bash
cd backend
pip install -r requirements.txt

# Copy and configure environment
cp ../.env.example ../.env

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The database file is created automatically on first run at the path specified by `DATABASE_URL`.

Interactive API docs are available at http://localhost:8000/docs.

### Docker

From the project root:

```bash
docker-compose up backend
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | Yes | JWT signing secret — use a long random string |
| `DATABASE_URL` | Yes | SQLAlchemy URL, e.g. `sqlite:///./math_defense.db` |
| `CORS_ORIGINS` | Yes | Comma-separated browser-visible origins, e.g. `http://localhost:5173,http://localhost:3000` |

---

## Testing

```bash
cd backend
pytest                        # run all tests
pytest tests/test_auth.py     # run a single file
pytest -v                     # verbose output
```

Tests use an in-memory SQLite database and do not touch the dev database.

---

## Rate Limiting

Implemented via `slowapi` (a Starlette-compatible port of Flask-Limiter).

| Endpoint | Limit |
|---|---|
| `POST /auth/register` | 5/minute per IP |
| `POST /auth/login` | 10/minute per IP |

Exceeding the limit returns `HTTP 429 Too Many Requests`.
