# Math Defense

An educational tower defense game that teaches mathematics through gameplay. Players build mathematical towers — each embodying a different math concept — to defeat enemies following a procedurally generated path.

## Concept

Each tower type corresponds to a real math topic:

| Tower | Math Concept | How It Works |
|---|---|---|
| Function Cannon | Quadratic Functions | Projectile follows `y = ax² + bx + c`; hits enemy where trajectory intersects path |
| Radar Sweep | Trigonometry & Sectors | Scans a sector area; damage applied to enemies inside using `pointInSector()` |
| Matrix Link | 2×2 Matrix / Linear Transforms | Select two towers; input a matrix; applies rotation/scaling transformation |
| Probability Shrine | Probability & Buffs | No direct attack; triggers Buff card selection phase after a wave |
| Integral Cannon | Definite Integration | Damage calculated as a definite integral via the trapezoid rule |
| Fourier Shield | Fourier Series | Defensive tower; mini-game where player matches a 3-sine composite wave |

---

## Architecture

```
Math Game/
├── frontend/          Vue 3 + TypeScript + Vite — UI and game engine
├── backend/           FastAPI (Python) — auth, sessions, leaderboard
├── wasm/              C + Emscripten — high-performance math module (WebAssembly)
├── shared/            Shared constants (canvas size, grid bounds, player defaults)
├── assets/            Sprites, audio, fonts
├── docker-compose.yml Docker orchestration for frontend + backend
└── Math_Defense_Spec.md  Full game design specification
```

The three main layers communicate as follows:

```
Browser
  └─ Vue 3 App
       ├─ Game Engine (ECS-style systems, Canvas rendering)
       │    └─ WasmBridge → math_engine.wasm (C, compiled by Emscripten)
       └─ API Services → FastAPI Backend
                              └─ SQLite database
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 (Composition API), TypeScript, Pinia, Vue Router, Vite |
| Backend | FastAPI, Uvicorn, SQLAlchemy 2.0, Pydantic v2, PyJWT, bcrypt |
| WASM | C, Emscripten SDK |
| Database | SQLite (dev) |
| Container | Docker, Docker Compose |

---

## Game Flow

```
MENU
  └─ LEVEL_SELECT (choose level 1–4)
       └─ BUILD (place towers, configure math parameters)
            └─ WAVE (enemies spawn; towers attack)
                 ├─ BUFF_SELECT (wave cleared → pick a buff card → return to BUILD)
                 ├─ BOSS_SHIELD (boss activates Fourier shield mini-game)
                 ├─ LEVEL_END (all waves cleared → next level)
                 └─ GAME_OVER (HP reaches 0)
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker & Docker Compose (optional)
- Emscripten SDK (only if rebuilding WASM)

### Option A — Docker (recommended)

```bash
cp .env.example .env          # fill in SECRET_KEY
docker-compose up
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

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
npm run dev
```

### Rebuild WASM (optional)

```bash
cd wasm
make          # outputs to frontend/public/wasm/
```

---

## Environment Variables

Create a `.env` file at project root:

```env
SECRET_KEY=<long-random-string>
DATABASE_URL=sqlite:///./math_defense.db
```

---

## Shared Constants

`shared/game-constants.json` is the single source of truth for values used by both frontend and backend:

```json
{
  "canvas":  { "width": 1280, "height": 720, "originX": 160, "originY": 600, "unitPx": 40 },
  "grid":    { "minX": -3, "maxX": 25, "minY": -2, "maxY": 14 },
  "player":  { "initialHp": 20, "initialGold": 200 },
  "loop":    { "targetFps": 60, "fixedDt": 0.016667 }
}
```

---

## Sub-project READMEs

- [frontend/README.md](frontend/README.md) — Vue 3 app, game engine, ECS systems, rendering
- [backend/README.md](backend/README.md) — FastAPI app, auth, sessions, leaderboard API
- [wasm/README.md](wasm/README.md) — C math engine, Emscripten build, exported functions
