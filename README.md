<p align="center">
  <img src="logo-ring.svg" alt="Math Defense logo" width="220" />
</p>

<p align="center">
  <img src="accent-bar.svg" alt="" width="440" />
</p>

# Math Defense

An educational tower defense game that teaches mathematics through gameplay. Players build mathematical towers — each embodying a different math concept — to defeat enemies following a procedurally generated path.

## Concept

An educational tower defense where **math is the mechanic, not the gate**. The world is a coordinate plane; the **origin (0, 0)** is the rune you must defend. Enemies spawn at the grid edge and walk along procedurally generated polynomial curves toward the origin. Each tower type corresponds to a real math topic — the functions you choose, the angles you sweep, the limits you evaluate *are* the attacks.

| Tower | Glyph | Math Concept | How It Works | Unlocked |
|---|---|---|---|---|
| Magic | ✦ | Function curves (polynomial / trig / log) | Draws a curve as a band-shaped zone; toggle between **Debuff** (damages enemies in band) and **Buff** (boosts towers in band) | Star 1 |
| Radar A — Sweep | ◐ | Radian arcs, sector area | Continuous AoE sweep; damage applied to all enemies inside the arc on every tick | Star 1 |
| Radar B — Rapid | ◑ | Radian arcs | Fast single-target projectiles within a restricted arc; shortest cooldown in the roster | Star 2 |
| Radar C — Sniper | ◒ | Radian arcs | Slow, heavy single-target shots at long range; highest base damage | Star 2 |
| Matrix | ⊞ | Vectors & dot product | **Paired** tower system — fires nothing alone; base damage = dot product of the pair's grid-coordinate vectors; laser ramps damage the longer it locks on | Star 2 |
| Limit | ∞ | Limits (lim x→a) | Presents a multiple-choice `lim` question; answer drives the effect — `+∞` instakills every enemy in range (bypasses defensive caps), `+C` (finite positive) scales damage by `\|C\| × 1.5`, any other answer (`0`, `−C`, `−∞`) deals chip damage (`effectiveDamage × 0.35 × 1.5`) | Star 3 |
| Calculus | ∫ | Derivatives & integrals (power rule) | Player picks a polynomial and applies `d/dx` or `∫`; the resulting `C·xⁿ` spawns `floor(log2(C+1))` autonomous pets (capped log-curve, not raw C) whose behaviour is determined by `n` (homing, lifetime, AoE) | Star 3 |

Each tower has Tier 2 / Tier 3 upgrades (+25%/+50% damage, +10%/+20% range, plus type-specific bonuses).

---

## Game Mechanics

### Run flow

```
Menu → Level Select (★ 1–5) → Initial Answer → [ Build → Wave ] × N → Score
                                                  ↑              ↓
                                            (refunds, shop)  Monty Hall, Chain Rule
```

- **Initial Answer (IA)** — before the run, the engine shows the level's curves and a disclosure rectangle containing their single common intersection. Enter exact `(x, y)` (fractions / integers / exact decimals). A correct answer sets `IA = 1`, sharpening the score's exponent. Wrong / Skip (50 gold) / "Proceed (Paths Hidden)" all set `IA = 0`; the last option additionally **hides the path overlay during gameplay**.
- **Build Phase** — no enemies; place / upgrade / refund towers, configure each tower's math (curve, arc, pair, `lim` answer, derivative/integral), open the shop, set targeting (closest / strongest / first / last). Time spent here is *prep time* and is excluded from the score's active-time term.
- **Wave Phase** — towers fire automatically; the player retains control of spells and pause (Space / Esc). Tower configuration is locked until the wave ends.
- **Special events** — the engine may inject Monty Hall (kill-value threshold crossed) or Chain Rule (Boss Type-B at ~50% HP) modals mid-run.

### Enemies

Ten enemy types with distinct counter-play. `killValue` (not gold reward) drives Monty Hall thresholds and the score formula.

| Enemy | HP | Spd | Reward | Dmg | KV | Special |
|---|---|---|---|---|---|---|
| General | 30 | 2.0 | 15 | 1 | 10 | Baseline |
| Fast | 15 | 4.0 | 8 | 1 | 5 | 2× speed, thin HP |
| Strong | 120 | 1.0 | 38 | 2 | 25 | Tanky |
| Split | 40 | 2.0 | 8 | 1 | 5 | On death splits into 2 smaller Generals |
| Helper | 35 | 2.0 | 23 | 1 | 15 | Aura: +5 HP/s and +20% speed to allies in r=3 — **kill first** |
| Regenerator | 80 | 1.5 | 30 | 2 | 20 | Regens 18 HP/s — needs burst damage |
| Bulwark | 220 | 0.9 | 45 | 3 | 30 | Takes only **40%** of tower damage; pets and player effects bypass the cut |
| Swarmling | 12 | 3.2 | 6 | 1 | 4 | Takes only **35%** of tower damage; pets bypass the modifier |
| Boss Type-A | 500 | 0.8 | 150 | 99 | 100 | 200-HP shield; spawns a General every 8 s |
| Boss Type-B | 600 | 0.7 | 225 | 99 | 150 | 250-HP shield; spawns a Fast every 8 s; triggers **Chain Rule challenge** at ~50% HP — correct answer instakills the boss + 100 gold; wrong answer = no heal, no penalty, boss returns to combat |

### Score formula

Computed in WASM (`compute_total_score` in `wasm/math_engine.c`) so the server can re-verify bit-deterministically; the frontend mirrors it for display.

```
activeTime = max(0.001, timeTotal − Σ(time spent in Build Phase))
S1         = killValue / activeTime                  (kill rate)
S2         = killValue / costTotal       if costTotal > 0 else 0
alpha      = S1 / (S1 + S2)             if S1 + S2 > 0 else 0
K          = alpha·S1 + (1 − alpha)·S2               (continuous blend)
exponent   = 1 / sqrt(max(1, 1 + (2 + healthOrigin − healthFinal − initialAnswer)))
TotalScore = max(0, K)^exponent                      (killValue = 0 → K = 0 → score = 0)
```

Edge cases: no towers built (`costTotal = 0`) → `S2 = 0`, alpha = 1, `K = S1` (no penalty); sitting in Build forever does not pad the timer.

### Monty Hall event

When cumulative kill-value crosses a star-specific threshold, the wave pauses. Pick a door → system reveals a losing door → stay or **switch**. Switching wins `(doors−1)/doors` (2/3 at 3 doors, 4/5 at 5 doors). The game never tells you this — it's the lesson. Rewards include Power Surge (double damage), Eagle Eye (+50% range), Time Warp (-40% enemy speed), Gold Rush (3× gold), Divine Blessing (full HP), Master Builder (next 2 towers free).

### Shop buffs & spells

Shop (Build Phase, time-based, stack independently): Sharpen Blades (+20% damage), Overclock (+15% attack speed), Far Sight (+15% range), Quagmire (-15% enemy speed), Corrode Armor (+10% enemy damage taken), Heal 5/10, Ward Shield (halve next 3 damage hits), Prospector (2× gold).

Spells (cast any time, gold-cost, cooldown-gated): **Exponential** `eˣ` (60 AoE r=3, 80g/12s), **Asymptote** `→0` (slow to 40% in r=4 for 5s, 60g/15s), **Impulse** `δ` (150 single-target, 100g/18s), **Acceleration** `dv/dt` (+tower attack speed 8s, 120g/25s).

### Difficulty (star rating)

| Star | Path multisets | Waves | Enemy mix |
|---|---|---|---|
| 1 | degrees 1–2, 2–4 curves | 3 | General only |
| 2 | adds degree 3, longer multisets | 4 | General, Fast, Bulwark |
| 3 | denser mix of degrees 1–3 | 5 (last wave: Boss Type-A) | Strong, Split, Regenerator, Swarmling, boss |
| 4 | denser multisets | 5 (last wave: Boss Type-B) | Helper-heavy + chain-rule boss |
| 5 | hardest multisets, longest curves | 5 (last wave: Boss-B + Swarmling bursts) | Everything; **only ★5 grants checkpoint retry** (run flagged practice → leaderboard-ineligible) |

Path generation is polynomial-only; the trig / log evaluator is used by the Magic tower and the curve LaTeX renderer. The whole run is replay-deterministic from `rng_seed`.

### Progression (carries between runs)

- **Achievements** — 29 entries across 6 categories (`combat / efficiency / exploration / scoring / survival / territory`); some scale with seasonal multipliers.
- **Talent Tree** — 26 nodes (19 base + 7 tier-2 advanced) across the 7 tower types. Base nodes form linear prerequisite chains; tier-2 nodes additionally require their parent at max level (`prerequisite_max_levels`). Each node has a `maxLevel` (2 or 3) and grants a per-tower attribute multiplier — including damage, range, attack/sweep speed, target count, zone width/strength, Magic zone duration/slow strength, Matrix damage-ramp rate/resonance, Limit burst bonus, and Calculus pet damage/speed/range/crit. Modifiers are snapshotted at tower placement, so re-build to refresh after reallocating. Free reset is supported.
- **Avatar & profile** — unlocked along the way. Profile customization also covers the **endpoint marker** (the origin rune you defend): pick a marker style (`star` / `gorilla` / `custom` data-URL upload) and a hit-effect animation (`random` / `fragments` / `crying` / `angry`), validated at the schema, domain-aggregate, and DB-constraint layers.
- **Class & Territory** — students join classes and compete in time-bounded "Grabbing Territory" events with leaderboards by region / class / global. Each activity has up to 50 slots and a teacher-configurable `student_slot_cap` (1–50, default 5) controlling how many slots a single student may hold.
- **Leaderboard** — every completed non-practice run posts its TotalScore by star rating.

### Accessibility

Every tower has a unique Unicode glyph in addition to colour (WCAG 1.4.1); a polite ARIA live region announces phase transitions and HP warnings; `prefers-reduced-motion` tones down ambient animation; **full keyboard placement** (arrow keys + Enter, WCAG 2.2 SC 2.1.1); path labels fade based on the player's recent IA accuracy.

For the full design rationale, see [`frontend/public/manual/game-mechanics.md`](frontend/public/manual/game-mechanics.md) and the field reference at [`frontend/public/manual/towers-and-enemies.md`](frontend/public/manual/towers-and-enemies.md) — both are surfaced in-game through the Manual modal.

---

## Architecture

> For the full system architecture (topology diagrams, DDD layering, ECS systems, build/deploy pipeline), see **[ARCHITECTURE.md](ARCHITECTURE.md)**.
> For the complete database ERD, column constraints, indexes, and migration history, see **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)**.

```
Math Game/
├── frontend/          Vue 3 + TypeScript + Vite — UI, game engine, ECS systems
├── backend/           FastAPI — DDD layers (domain / application / infrastructure)
├── wasm/              C + Emscripten — math module compiled to WebAssembly
├── shared/            Shared constants (canvas size, grid bounds, player defaults)
├── scripts/           Helper scripts (Postgres role init, backups, etc.)
├── emsdk/             Vendored Emscripten SDK for WASM builds
├── docker-compose.yml        Dev orchestration: Postgres + backend (hot reload) + frontend (Vite)
├── docker-compose.prod.yml   Prod orchestration: images are self-contained, nginx terminates /api
├── nginx.conf                Production reverse-proxy config (HTTP, SPA + /api)
├── nginx-tls.conf            Production reverse-proxy config with TLS termination
├── security-headers.conf     Shared CSP / HSTS / frame-options snippet included by both nginx configs
├── .env.example              Template for required environment variables
├── ARCHITECTURE.md           Comprehensive system architecture documentation
├── DATABASE_SCHEMA.md        Full ERD, column constraints, indexes, and migration history
├── SECURITY.md               Security model, threat surface, and hardening notes
├── Math_Defense_Spec.md      Full game-design specification
└── docs/                     Additional design documents and analysis (Audit, V3 planning, educational theory)
```

The three runtime layers communicate as follows:

```
Browser
  └─ Vue 3 SPA
       ├─ Pinia stores (reactivity bridge)
       ├─ Game Engine (ECS-style systems, Canvas rendering, fixed 60 FPS)
       │    ├─ Audio AssetManager (HTMLAudioElement SFX, mute/volume)
       │    ├─ EventRecorder / EventPlayer / SpectatorClient (replay + live spectate)
       │    └─ WasmBridge → math_engine.wasm (C, Emscripten) with JS fallback
       └─ Services → FastAPI Backend
                          ├─ Routers (thin controllers — auth/sessions/leaderboard/
                          │           achievements/seasons/talents/classes/admin/
                          │           territory/assessment/recommendation/challenge/
                          │           replay/study)
                          ├─ Global exception handlers → HTTP status from DomainError.status_code
                          ├─ Application Services (Auth / Session / Leaderboard /
                          │   Achievement / Season / Talent / Class / Admin /
                          │   Territory / Assessment / Recommender / Challenge /
                          │   Replay / Study)
                          ├─ Domain Aggregates (User, GameSession, LeaderboardEntry,
                          │   Achievement, Talent, Class, Territory, Season,
                          │   Challenge) + Bayesian competency state
                          └─ SQLAlchemy Repositories → PostgreSQL
                                  ↑
                                  └─ scheduler (territory settlement)
                                  └─ spectate hub (in-process WS fan-out)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3.5 (Composition API, `<script setup>`), TypeScript 6.0 strict, Pinia 3, Vue Router 5, Vite 8, Vitest 4 |
| Backend | FastAPI 0.136, Uvicorn, SQLAlchemy 2.0, Pydantic v2, PyJWT (HS256), bcrypt, slowapi |
| WASM | C99, Emscripten (`-O2`, `-sMODULARIZE -sEXPORT_ES6`, deterministic FP flags); 17 exported math functions (plus `_malloc`/`_free`) |
| Database | PostgreSQL 16 (46 Alembic migrations) — schema reference: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) |
| Container | Docker, Docker Compose |
| Replay | Versioned (`replay_version` 1=mulberry32+JS Math, 2=PCG+WASM bit-exact); server-side score recompute via `wasmtime-py` |

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

Phase transitions are enforced by `PhaseStateMachine` on the frontend and mirrored by the `GameSession` aggregate's `SessionStatus` state machine on the backend. The `BUFF_SELECT` phase survives only as a `GamePhase` enum value for V1 compatibility — the `PhaseStateMachine` defines no transitions into it, so the V2 flow never enters it; shop-based purchases during BUILD replaced the end-of-wave buff card draw.

---

## Quick Start

### Prerequisites

- Node.js 26+
- Python 3.13+
- Docker & Docker Compose (optional)
- Emscripten SDK (only if rebuilding WASM; `emsdk/` is vendored)

### Option A — Docker (recommended)

```bash
cp .env.example .env          # then edit .env before booting:
                              #   - SECRET_KEY  (≥32 chars)
                              #   - replace the 'changeme' password in both
                              #     DATABASE_URL and POSTGRES_PASSWORD
                              #   - TOTP_ENCRYPTION_KEY (Fernet key; required)
                              # The backend refuses to start until all are set.
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
| `SECRET_KEY` | Yes | JWT signing secret — minimum 32 characters; generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `DATABASE_URL` | Yes | SQLAlchemy URL, e.g. `postgresql+psycopg://mathdefense:changeme@postgres:5432/math_defense` |
| `POSTGRES_PASSWORD` | Yes | Password for the `postgres` service (matches the password embedded in `DATABASE_URL`) |
| `CORS_ORIGINS` | Yes | Comma-separated browser origins, e.g. `http://localhost:5173,http://localhost:3000` |
| `FRONTEND_URL` | Yes | Base URL used in outbound emails (verification links), e.g. `http://localhost:5173` |
| `POSTGRES_APP_PASSWORD` | No | M-13 least-privilege app role password; consumed by `pg_init_roles.sh` on first DB init to create the DML-only `mathdefense_app` role. Required only if you set `DATABASE_URL_APP` for runtime queries. |
| `DATABASE_URL_APP` | No | M-13 optional least-privilege runtime URL. When set, the runtime engine connects with the `mathdefense_app` role (password = `POSTGRES_APP_PASSWORD`) while Alembic keeps migrating as the admin `DATABASE_URL`. Unset/blank → runtime also uses `DATABASE_URL`. |
| `PROXY_MODE` | No | Default `false`. Set `true` when running behind nginx/another proxy so rate limits key on `X-Forwarded-For` instead of the proxy IP. |
| `TRUSTED_PROXY_IPS` | No | Comma-separated IPs / CIDRs whose `X-Forwarded-For` the backend trusts when `PROXY_MODE=true`. |
| `TOTP_ENCRYPTION_KEY` | Yes | AES-256 Fernet key used to encrypt TOTP secrets at rest. Required at startup unconditionally (`lifespan` calls `verify_key_configured()` before the first request), so a missing key aborts boot regardless of whether MFA is in use. Generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. |
| `SEED_DEMO_USER` | No | Default `false`. Set `true` to seed the dev teacher + student + admin accounts (see `backend/app/seed.py`); the same credentials appear in the AuthView UI when the frontend is built in dev mode. A localhost-only guard refuses to seed unless `FRONTEND_URL` points at a recognised local-dev host. |
| `SEED_ADMIN_EMAIL` | No | Bootstrap admin e-mail. Set together with `SEED_ADMIN_PASSWORD` to seed the first admin on initial boot (the supported way to provision the production admin). Omitting either is a no-op. Create-once: an existing e-mail is never modified. |
| `SEED_ADMIN_PASSWORD` | No | Bootstrap admin password (stored bcrypt-hashed). May be blanked after first boot — an in-app password change is preserved. Generate with `python -c "import secrets; print(secrets.token_urlsafe(24))"`. |
| `SEED_ADMIN_NAME` | No | Display name for the bootstrapped admin. Default `Admin`. |
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
cd backend  && pytest              # ~31 test files (DDD aggregates, routers, coverage gaps, domain invariants, auth lockout, token deny-list, CSRF cookie, shared-constants parity, achievement/talent/class/territory integration, server-side score verification, score-calculator parity, avatar parity, Q-matrix, Bayesian competency estimator, assessment router, challenge mode, validity-probe study, recommender, session repository, wasmtime-py runtime, replay-v2 score recompute, admin teacher provisioning)
cd frontend && npm test            # ~87 test files (systems, engine, domain policies, movement strategies, path pipeline, projections, WASM bridge + WASM/JS parity for prng/curve/intersect/spawn/levelgen, audio asset manager, replay determinism, principle defs, achievement-defs lint, checkpoint serialization, keyboard placement, level-select view, score-calculator parity)
```

The frontend uses Vitest with `happy-dom`; the backend uses pytest against a real PostgreSQL test DB (`math_defense_test`, auto-created from `DATABASE_URL`).

---

## Production Deployment

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

`docker-compose.prod.yml` builds self-contained images (no bind-mounted source) and fronts them with nginx. `nginx.conf` serves the Vite `dist/` build as an SPA and reverse-proxies `/api/` to the backend container; CORS preflight is short-circuited at the nginx layer and response headers are forwarded from the backend. Postgres is only reachable from the docker network — no host port is published.

---

## Documentation

### System references

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — System topology, DDD layering, ECS engine, WASM bridge, deployment, and testing in one place
- **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** — ERD for 29 tables, constraints, indexes, and Alembic migration history
- **[SECURITY.md](SECURITY.md)** — Threat model, auth flow (JWT/bcrypt/MFA), lockout, CSRF, CSP, audit logging
- **[Math_Defense_Spec.md](Math_Defense_Spec.md)** — Original game-design specification
- **[docs/Educational_Theory_Analysis.md](docs/Educational_Theory_Analysis.md)** — Theory-driven design audit mapping each game mechanic to authoritative learning theories (APA 7 citations)
- [docs/](docs/) — Additional design analysis, audit notes, and educational-theory background

### Sub-project READMEs

- [frontend/README.md](frontend/README.md) — Vue 3 app, ECS game engine, systems, stores, WASM bridge
- [backend/README.md](backend/README.md) — FastAPI DDD layers, REST API, domain events, rate limits
- [wasm/README.md](wasm/README.md) — C math engine, Emscripten build, exported functions

### In-game manual (also surfaced in the Manual modal)

- [frontend/public/manual/game-mechanics.md](frontend/public/manual/game-mechanics.md) — Full design rationale
- [frontend/public/manual/towers-and-enemies.md](frontend/public/manual/towers-and-enemies.md) — Tower and enemy field reference

---

## License

Copyright 2026 Isaries, SW9526, Shao077777714.

This project is licensed under the **Apache License, Version 2.0** — see [LICENSE](LICENSE) for the full text and [NOTICE](NOTICE) for project attribution and third-party component credits. In short, you may use, modify, and distribute this software (including for commercial purposes) as long as you preserve the copyright notice, the license, and the NOTICE file, and clearly mark any modifications.

> Built at National Taiwan Normal University (NTNU) for the 2026 Computer Programming II course.
