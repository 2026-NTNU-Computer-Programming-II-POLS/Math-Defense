# Math Defense

An educational tower defense game that teaches mathematics through gameplay. Players build mathematical towers — each embodying a different math concept — to defeat enemies following a procedurally generated path.

## Concept

Each tower type corresponds to a real math topic:

| Tower | Math Concept | How It Works |
|---|---|---|
| Magic | Function Curves (polynomial/trig/log) | Places a function curve as a zone that debuffs enemies or buffs nearby towers |
| Radar A | Trigonometry & Sectors | Continuous AoE sweep; damage applied to all enemies inside the arc |
| Radar B | Polar Coordinates | Fast single-target projectile launcher |
| Radar C | Angular Momentum | Slow, powerful projectile shots with high per-hit damage |
| Matrix | Linear Transforms / Dot Product | Paired tower system; dot-product damage; continuous laser beam between pair |
| Limit | Limits (lim x→c) | Presents a multiple-choice limit question; outcome (±∞ / ±C / 0) sets effective range |
| Calculus | Derivatives & Integrals | Player picks a function then derivative/integral; generates autonomous Pet projectiles |

---

## Architecture

```
Math Game/
├── frontend/          Vue 3 + TypeScript + Vite — UI, game engine, ECS systems
├── backend/           FastAPI — DDD layers (domain / application / infrastructure)
├── wasm/              C + Emscripten — math module compiled to WebAssembly
├── shared/            Shared constants (canvas size, grid bounds, player defaults)
├── assets/            Sprites, audio, fonts
├── emsdk/             Vendored Emscripten SDK for WASM builds
├── docker-compose.yml        Dev orchestration: Postgres + backend (hot reload) + frontend (Vite)
├── docker-compose.prod.yml   Prod orchestration: images are self-contained, nginx terminates /api
├── nginx.conf                Production reverse-proxy config (HTTP, SPA + /api)
├── nginx-tls.conf            Production reverse-proxy config with TLS termination
├── .env.example              Template for required environment variables
└── Math_Defense_Spec.md      Full game-design specification
```

The three runtime layers communicate as follows:

```
Browser
  └─ Vue 3 SPA
       ├─ Pinia stores (reactivity bridge)
       ├─ Game Engine (ECS-style systems, Canvas rendering, fixed 60 FPS)
       │    └─ WasmBridge → math_engine.wasm (C, Emscripten) with JS fallback
       └─ Services → FastAPI Backend
                          ├─ Routers (thin controllers — auth/sessions/leaderboard/
                          │           achievements/talents/classes/admin/territory)
                          ├─ Global exception handlers → HTTP status from DomainError.status_code
                          ├─ Application Services (Auth / Session / Leaderboard /
                          │   Achievement / Talent / Class / Admin / Territory)
                          ├─ Domain Aggregates (User, GameSession, LeaderboardEntry,
                          │   Achievement, Talent, Class, Territory)
                          └─ SQLAlchemy Repositories → PostgreSQL
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 (Composition API, `<script setup>`), TypeScript 5.9 strict, Pinia, Vue Router, Vite 8, Vitest |
| Backend | FastAPI 0.136, Uvicorn, SQLAlchemy 2.0, Pydantic v2, PyJWT (HS256), bcrypt, slowapi |
| WASM | C99, Emscripten (`-O2`, `-sMODULARIZE -sEXPORT_ES6`) |
| Database | PostgreSQL 16 (Alembic migrations) |
| Container | Docker, Docker Compose |

---

## Game Flow

```
MENU
  └─ LEVEL_SELECT (choose star rating 1–5; shows difficulty, initial-answer screen)
       └─ INITIAL_ANSWER (identify path endpoints before the wave; awards bonus)
            └─ BUILD (place towers, configure math params; shop for time-based buffs / spells)
                 └─ WAVE (enemies spawn; towers attack)
                      ├─ BUILD (wave cleared → return to shop/build phase)
                      ├─ MONTY_HALL (kill-value threshold crossed → Monty Hall event → BUILD)
                      ├─ CHAIN_RULE (Boss Type-B triggers chain-rule challenge → WAVE)
                      ├─ LEVEL_END (all waves cleared → score result screen)
                      └─ GAME_OVER (HP reaches 0)
```

Phase transitions are enforced by `PhaseStateMachine` on the frontend and mirrored by the `GameSession` aggregate's `SessionStatus` state machine on the backend. The `BUFF_SELECT` phase remains valid in the FSM but is no longer part of the main flow — shop-based purchases during BUILD replaced the end-of-wave buff card draw.

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker & Docker Compose (optional)
- Emscripten SDK (only if rebuilding WASM; `emsdk/` is vendored)

### Option A — Docker (recommended)

```bash
cp .env.example .env          # fill in SECRET_KEY (≥16 chars)
docker-compose up
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- OpenAPI docs: http://localhost:8000/docs

### Option B — Manual

**Backend**

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev        # Vite dev server on http://localhost:5173
```

Vite proxies `/api/*` to `http://localhost:8000` in development so the browser sees no CORS.

### Rebuild WASM (optional)

```bash
cd wasm
make               # writes math_engine.js / .wasm into frontend/src/math/wasm/
```

`npm run build` in the frontend automatically triggers `make` via the `prebuild` script.

---

## Environment Variables

Create `.env` at the project root (see `.env.example`):

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | Yes | JWT signing secret — minimum 16 characters |
| `DATABASE_URL` | Yes | SQLAlchemy URL, e.g. `postgresql+psycopg://mathdefense:changeme@postgres:5432/math_defense` |
| `POSTGRES_PASSWORD` | Yes | Password for the `postgres` service (matches the password embedded in `DATABASE_URL`) |
| `CORS_ORIGINS` | Yes | Comma-separated browser origins, e.g. `http://localhost:5173,http://localhost:3000` |
| `COOKIE_SECURE` | No | Default `true`; only `false` is honoured under CI/pytest (see `reject_insecure_cookie_outside_tests` in `backend/app/config.py`) |

> The backend refuses to start when `DATABASE_URL` embeds the literal password `changeme` — replace it in `.env` before first boot.

---

## Shared Constants

`shared/game-constants.json` is the single source of truth for values referenced by both frontend and backend:

```json
{
  "canvas":      { "width": 1280, "height": 720, "originX": 640, "originY": 374, "unitPx": 20 },
  "grid":        { "minX": -14, "maxX": 14, "minY": -14, "maxY": 14, "pointSpacing": 1 },
  "player":      { "initialHp": 20, "initialGold": 200 },
  "loop":        { "targetFps": 60 },
  "collision":   { "hitRadius": 0.5 },
  "waveSystem":  { "pathValidationMinCoverage": 0.8 },
  "roles":       ["admin", "teacher", "student"],
  "starRatings": { "min": 1, "max": 5 },
  "economy":     { "startingGoldByStar": {...}, "waveCompletionBonus": {...}, "bossCorrectAnswerBonus": 100 }
}
```

`fixedDt` is intentionally derived in code (`1 / targetFps`) rather than stored.

---

## Testing

```bash
cd backend  && pytest              # 97 tests (DDD aggregates, routers, coverage gaps, domain invariants, auth lockout, token deny-list, shared-constants parity)
cd frontend && npm test            # 26 test files (systems, engine, domain policies, movement strategies, path pipeline, projections, WASM bridge + WASM/JS parity)
```

The frontend uses Vitest with `happy-dom`; the backend uses pytest against a real PostgreSQL test DB (`math_defense_test`, auto-created from `DATABASE_URL`).

---

## Production Deployment

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

`docker-compose.prod.yml` builds self-contained images (no bind-mounted source) and fronts them with nginx. `nginx.conf` serves the Vite `dist/` build as an SPA and reverse-proxies `/api/` to the backend container; CORS preflight is short-circuited at the nginx layer and response headers are forwarded from the backend. Postgres is only reachable from the docker network — no host port is published.

---

## Sub-project READMEs

- [frontend/README.md](frontend/README.md) — Vue 3 app, ECS game engine, systems, stores, WASM bridge
- [backend/README.md](backend/README.md) — FastAPI DDD layers, REST API, domain events, rate limits
- [wasm/README.md](wasm/README.md) — C math engine, Emscripten build, exported functions
