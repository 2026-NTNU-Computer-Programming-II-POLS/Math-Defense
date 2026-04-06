# Frontend — Vue 3 + TypeScript

The frontend contains both the Vue 3 UI layer and the entire game engine. It renders to an HTML5 Canvas and communicates with the backend REST API for authentication, session persistence, and leaderboards.

## Tech Stack

| | |
|---|---|
| Framework | Vue 3 (Composition API, `<script setup>`) |
| State | Pinia |
| Router | Vue Router 4 |
| Build | Vite 8 |
| Language | TypeScript 5.9 (strict mode) |
| Rendering | HTML5 Canvas 2D |
| Math Module | WebAssembly (Emscripten C) via `WasmBridge.ts` |

---

## Directory Layout

```
frontend/
├── src/
│   ├── main.ts                App entry — bootstrap Vue, restore auth, mount
│   ├── App.vue                Root component (router-view)
│   │
│   ├── views/                 Page-level components
│   │   ├── MenuView.vue       Main menu
│   │   ├── AuthView.vue       Login / register
│   │   ├── GameView.vue       Game container (canvas + HUD overlay)
│   │   └── LeaderboardView.vue  Score table
│   │
│   ├── components/
│   │   ├── common/
│   │   │   ├── Modal.vue      Generic modal wrapper
│   │   │   └── LevelCard.vue  Level selection card
│   │   └── game/
│   │       ├── HUD.vue        In-game HUD (HP, gold, wave, score)
│   │       ├── BuildPanel.vue Tower purchase panel
│   │       ├── BuffCardPanel.vue  Buff card selection overlay
│   │       └── TowerBar.vue   Tower info bar
│   │
│   ├── composables/
│   │   ├── useGameLoop.ts     Mount/unmount game engine; wire systems and events
│   │   ├── useAuth.ts         Reactive auth state helpers
│   │   └── useLeaderboard.ts  Leaderboard fetch helpers
│   │
│   ├── stores/                Pinia stores (Vue reactivity layer)
│   │   ├── authStore.ts       User auth state (token, user object)
│   │   ├── gameStore.ts       Mirror of engine state → drives HUD reactivity
│   │   └── uiStore.ts         Modal visibility, active panel, overlay state
│   │
│   ├── services/              Backend API clients
│   │   ├── api.ts             Fetch wrapper with auto-attached Bearer token + error types
│   │   ├── authService.ts     register(), login(), getMe()
│   │   ├── sessionService.ts  createSession(), updateSession(), endSession()
│   │   └── leaderboardService.ts  fetchLeaderboard(), submitScore()
│   │
│   ├── router/
│   │   └── index.ts           Routes: /, /auth, /game, /leaderboard
│   │
│   ├── engine/                Core game engine
│   │   ├── Game.ts            Main loop orchestrator (fixed 60 FPS timestep)
│   │   ├── GameState.ts       Strongly typed game state container
│   │   ├── PhaseStateMachine.ts  FSM for game phases with transition validation
│   │   ├── EventBus.ts        Type-safe pub/sub event system
│   │   ├── InputManager.ts    Canvas mouse/click/hover handling
│   │   └── Renderer.ts        Canvas rendering orchestrator
│   │
│   ├── systems/               Game systems (pure update logic, no rendering)
│   │   ├── TowerPlacementSystem.ts   Click-to-place tower; grid snapping
│   │   ├── CombatSystem.ts    Tower attack logic, projectile lifecycle, boss shield
│   │   ├── MovementSystem.ts  Enemy movement along path expression
│   │   ├── WaveSystem.ts      Spawn enemies; advance wave counter
│   │   └── BuffSystem.ts      Buff card activation and effect application
│   │
│   ├── renderers/             Rendering systems (read state, draw to canvas)
│   │   ├── EnemyRenderer.ts
│   │   ├── TowerRenderer.ts
│   │   └── ProjectileRenderer.ts
│   │
│   ├── entities/
│   │   ├── types.ts           Tower, Enemy, Projectile, Buff TypeScript interfaces
│   │   ├── TowerFactory.ts    Construct towers from tower-defs
│   │   └── EnemyFactory.ts    Construct enemies from enemy-defs
│   │
│   ├── math/
│   │   ├── WasmBridge.ts      Load WASM module; expose MathAPI; JS fallbacks
│   │   ├── MathUtils.ts       Distance, angle, vector helpers (pure TS)
│   │   └── PathEvaluator.ts   Evaluate enemy path expression; validate coverage
│   │
│   ├── data/                  Static game definitions (no logic)
│   │   ├── constants.ts       Enums (GamePhase, TowerType, EnemyType) + magic numbers
│   │   ├── tower-defs.ts      Tower cost, damage, range, description, math concept
│   │   ├── enemy-defs.ts      Enemy HP, speed, reward, size
│   │   ├── level-defs.ts      Levels 1–4: wave count, enemy distribution, path seed
│   │   ├── buff-defs.ts       Buff card IDs, descriptions, effect specs
│   │   └── ui-defs.ts         Panel layout, colour palette
│   │
│   └── styles/
│       └── global.css
│
├── public/
│   └── wasm/                  Compiled WASM output (generated — do not edit)
│       ├── math_engine.js
│       └── math_engine.wasm
│
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Game Engine

### Overview

The engine is **ECS-inspired**: entities (towers, enemies, projectiles) are plain data objects; systems contain all update and rendering logic. The game runs a fixed-timestep loop at 60 FPS.

```
Game.start()
  └─ requestAnimationFrame loop
       ├─ accumulate elapsed time
       └─ while accumulated >= fixedDt (1/60 s):
            ├─ TowerPlacementSystem.update(state, dt)
            ├─ WaveSystem.update(state, dt)
            ├─ MovementSystem.update(state, dt)
            ├─ CombatSystem.update(state, dt)
            ├─ BuffSystem.update(state, dt)
            └─ Renderer.render(state)
                 ├─ EnemyRenderer.draw(ctx, state)
                 ├─ TowerRenderer.draw(ctx, state)
                 └─ ProjectileRenderer.draw(ctx, state)
```

### `Game.ts`

Central orchestrator. Responsibilities:

- Owns the `requestAnimationFrame` loop
- Applies fixed-timestep accumulation
- Holds references to all systems and renderers
- Calls `EventBus.emit('stateChanged', state)` after each tick so Pinia stores stay reactive

### `GameState.ts`

Strongly typed state container passed to every system each tick. Key fields:

```typescript
interface GameState {
  phase: GamePhase           // Current phase (see FSM below)
  level: number              // 1–4
  wave: number               // Current wave
  totalWaves: number
  gold: number
  hp: number
  maxHp: number              // 20
  score: number
  kills: number

  towers: Tower[]
  enemies: Enemy[]
  projectiles: Projectile[]

  // Buff flags — explicit fields, not dynamic properties
  shieldActive: boolean
  goldMultiplier: number
  freeTowerNext: boolean
  enemySpeedMultiplier: number
  disabledTowerType: TowerType | null

  pathExpression: string     // e.g. "sin(x) + 0.5*cos(2x)"
}
```

### `PhaseStateMachine.ts`

Enforces valid phase transitions. Invalid transitions throw at development time.

```
Valid transitions:

MENU          → LEVEL_SELECT
LEVEL_SELECT  → BUILD
BUILD         → WAVE
WAVE          → BUFF_SELECT | BOSS_SHIELD | LEVEL_END | GAME_OVER
BUFF_SELECT   → BUILD
BOSS_SHIELD   → WAVE
LEVEL_END     → BUILD (next level) | MENU (game complete)
GAME_OVER     → MENU
```

### `EventBus.ts`

Type-safe pub/sub. All event names and payload shapes are declared in the `GameEvents` interface:

```typescript
interface GameEvents {
  stateChanged:   GameState
  phaseChanged:   { from: GamePhase; to: GamePhase }
  enemyKilled:    { enemy: Enemy; reward: number }
  towerPlaced:    Tower
  waveStarted:    { wave: number }
  waveCleared:    { wave: number }
  buffSelected:   BuffCard
  bossShieldHit:  { similarity: number }
  gameOver:       { score: number }
}
```

Components subscribe via `EventBus.on(event, handler)` and unsubscribe on `onUnmounted`.

### `InputManager.ts`

Translates raw canvas mouse events (click, mousemove, mouseout) into game-unit coordinates:

```
pixel (x, y)  →  game unit  =  (pixel - origin) / unitPx
```

Emits `gridClick`, `gridHover` events to `EventBus` so systems can react without referencing the DOM.

---

## Game Systems

### `TowerPlacementSystem`

- Listens for `gridClick` events
- Validates placement: grid cell unoccupied, player has enough gold, phase is `BUILD`
- Creates a `Tower` via `TowerFactory` and appends to `state.towers`
- Opens math parameter configuration modal for applicable tower types

### `WaveSystem`

- Reads wave configuration from `level-defs.ts`
- Spawns enemies at configured intervals using `EnemyFactory`
- Advances `state.wave` and emits `waveStarted`
- Detects wave clear (all enemies dead + none queued) and emits `waveCleared`

### `MovementSystem`

- Evaluates `state.pathExpression` via `PathEvaluator` to compute enemy waypoints
- Advances each enemy along the path by `enemy.speed * dt` per tick
- Enemies that reach the end deal damage to `state.hp` and are removed

### `CombatSystem`

- Each tower fires when its cooldown expires and an enemy is in range
- Projectile creation differs per tower type:
  - **Function Cannon**: calls `MathAPI.calculateTrajectory()` to get hit-point
  - **Radar Sweep**: calls `MathAPI.pointInSector()` on all nearby enemies each tick
  - **Integral Cannon**: calls `MathAPI.numericalIntegrate()` to compute damage value
  - **Matrix Link**: calls `MathAPI.matrixMultiply()` to transform target coordinates
  - **Fourier Shield**: each tick calls `MathAPI.fourierMatch()` to evaluate boss shield HP
- Collision detection checks each projectile against each enemy (`hitRadius = 0.5` game units)
- Applies damage, updates `state.kills`, awards gold

### `BuffSystem`

- Activates when phase is `BUFF_SELECT`
- Presents 3 randomly selected cards from `buff-defs.ts`
- Applies selected buff effects directly to `state` fields
- Transitions phase back to `BUILD`

---

## Vue–Engine Bridge

The game engine is pure TypeScript and knows nothing about Vue. The bridge is two-way:

### Engine → Vue (read direction)

`useGameLoop.ts` subscribes to `EventBus.on('stateChanged', ...)` and calls `gameStore.sync(state)`. Pinia's reactivity system propagates updates to all HUD components.

```
Engine tick
  └─ EventBus.emit('stateChanged', state)
       └─ gameStore.sync(state)           ← useGameLoop.ts
            └─ HUD.vue, BuildPanel.vue, etc. re-render via computed properties
```

### Vue → Engine (write direction)

User interactions in Vue components dispatch actions through `gameStore`:

```
BuildPanel.vue: user clicks "Buy Tower"
  └─ gameStore.requestTowerPlacement(towerType)
       └─ EventBus.emit('towerPlacementRequested', towerType)
            └─ TowerPlacementSystem picks up on next input event
```

---

## Pinia Stores

### `authStore`

| State | Description |
|---|---|
| `token` | JWT access token (persisted to `localStorage`) |
| `user` | `{ id, username }` or `null` |
| `isAuthenticated` | Derived from `token !== null` |

Actions: `login()`, `register()`, `logout()`, `restoreSession()`.

### `gameStore`

Mirrors a subset of `GameState` for Vue reactivity:

| State | Description |
|---|---|
| `phase` | Current `GamePhase` |
| `hp / maxHp` | Player health |
| `gold` | Current gold |
| `score` | Current score |
| `wave / totalWaves` | Wave progress |
| `activeBuffs` | Currently active buff labels |

### `uiStore`

| State | Description |
|---|---|
| `activeModal` | Which modal is open (`null` if none) |
| `selectedTowerType` | Tower type selected in build panel |
| `buildPanelOpen` | Whether build panel is visible |

---

## WASM Integration

`WasmBridge.ts` handles loading and exposes a unified `MathAPI` object:

```typescript
// Usage in CombatSystem.ts
import { MathAPI } from '../math/WasmBridge';

const pts = MathAPI.calculateTrajectory(a, b, c, xStart, xEnd, 0.1);
const inside = MathAPI.pointInSector(px, py, cx, cy, r, aStart, aWidth);
const dmg = MathAPI.numericalIntegrate(a, b, c, lo, hi, 100);
```

The WASM module is loaded once asynchronously at app startup. Until it resolves, all calls use pure-JS fallbacks transparently.

Memory for array arguments is managed inside `WasmBridge.ts` with `_malloc` / `_free` in `try/finally` blocks — callers never handle raw pointers.

---

## Routing

| Path | Component | Guard |
|---|---|---|
| `/` | `MenuView` | none |
| `/auth` | `AuthView` | redirect to `/` if already logged in |
| `/game` | `GameView` | requires auth |
| `/leaderboard` | `LeaderboardView` | none |

---

## API Communication

All backend calls go through `services/api.ts`:

```typescript
// api.ts — simplified
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const token = authStore.token;
    const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options?.headers,
        },
    });
    if (!response.ok) throw new ApiError(response.status, await response.json());
    return response.json();
}
```

Vite proxies `/api/*` to `http://localhost:8000` in development so there are no CORS issues during local dev.

---

## Setup & Development

```bash
cd frontend
npm install
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
```

TypeScript compilation is checked separately (no emit, Vite handles transpilation):

```bash
npx tsc --noEmit   # type-check only
```

---

## Canvas Coordinate System

The game uses its own coordinate system separate from pixel space:

```
Game unit (0, 0) = pixel (originX, originY) = pixel (160, 600)
1 game unit       = 40 pixels (unitPx)

Conversion:
  pixelX = originX + gameX * unitPx
  pixelY = originY - gameY * unitPx   ← Y axis is inverted (game Y up = pixel Y down)
```

Grid bounds: X ∈ [-3, 25], Y ∈ [-2, 14]. Tower placement is snapped to integer grid cells.
