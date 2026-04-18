# Frontend — Vue 3 + TypeScript

The frontend hosts both the Vue 3 UI layer and the entire game engine. It renders to an HTML5 Canvas and talks to the FastAPI backend for authentication, session persistence, and the leaderboard. Business logic lives in a pure-TypeScript engine; Vue only provides the reactive UI shell.

## Tech Stack

| | |
|---|---|
| Framework | Vue 3 (Composition API, `<script setup>`) |
| State | Pinia 3 |
| Router | Vue Router 4 |
| Build | Vite 8 |
| Language | TypeScript 5.9 (strict, `erasableSyntaxOnly`, `verbatimModuleSyntax`) |
| Rendering | HTML5 Canvas 2D |
| Math Module | WebAssembly (Emscripten C) via `WasmBridge.ts` — pure-JS fallback for every call |
| Testing | Vitest 4 + `@vue/test-utils` + `happy-dom` |

---

## Directory Layout

```
frontend/
├── src/
│   ├── main.ts                     App entry — bootstrap Vue, restore auth, mount
│   ├── App.vue                     Root component (router-view)
│   │
│   ├── views/                      Page-level screens
│   │   ├── MenuView.vue            Main menu + level select
│   │   ├── AuthView.vue            Login / register
│   │   ├── GameView.vue            Game container (canvas + HUD overlay)
│   │   └── LeaderboardView.vue     Score table
│   │
│   ├── components/
│   │   ├── common/
│   │   │   ├── Modal.vue           Generic modal wrapper
│   │   │   └── LevelCard.vue       Level-selection card (emits 'select')
│   │   └── game/
│   │       ├── HUD.vue             HP / gold / wave / score bar
│   │       ├── TowerBar.vue        Tower info / selection bar
│   │       ├── BuildPanel.vue      Tower purchase + parameter routing
│   │       ├── BuildHint.vue       First-time placement hints
│   │       ├── BuffCardPanel.vue   Buff-card selection overlay
│   │       ├── MatrixInputPanel.vue    2×2 matrix input → Matrix Link
│   │       ├── IntegralPanel.vue       [a,b] interval + visualisation → Integral Cannon
│   │       └── FourierPanel.vue        3-sine composite sliders → Fourier Shield
│   │
│   ├── composables/
│   │   ├── useGameLoop.ts          Mount/unmount engine, inject systems, wire UI bridges
│   │   ├── useSessionSync.ts       Bridge engine lifecycle ↔ backend session API
│   │   ├── useAuth.ts              Reactive auth helpers
│   │   └── useLeaderboard.ts       Leaderboard fetch helpers
│   │
│   ├── stores/                     Pinia stores (Vue reactivity layer)
│   │   ├── authStore.ts            token, user, initialisation flag
│   │   ├── gameStore.ts            Mirror of engine state → drives HUD reactivity
│   │   └── uiStore.ts              Panel visibility, selected tower type, hint step
│   │
│   ├── services/                   Backend API clients
│   │   ├── api.ts                  fetch wrapper; auto-attaches Bearer token; ApiError
│   │   ├── authService.ts          register / login / me / logout
│   │   ├── sessionService.ts       create / update / end / abandon / getActive
│   │   └── leaderboardService.ts   fetchLeaderboard, submitScore
│   │
│   ├── router/index.ts             Routes: /, /auth, /game, /leaderboard
│   │
│   ├── engine/                     Core engine — pure TS, no Vue imports
│   │   ├── Game.ts                 Fixed-timestep loop orchestrator + GameEvents map
│   │   ├── GameState.ts            Strongly typed state container
│   │   ├── PhaseStateMachine.ts    FSM with transition validation table
│   │   ├── EventBus.ts             Generic, type-safe pub/sub
│   │   ├── InputManager.ts         Canvas mouse → game-unit coord events
│   │   ├── Renderer.ts             Canvas-2D drawing primitives
│   │   └── event-handlers/
│   │       └── registry.ts         EVENT_HANDLER_REGISTRY — single source of truth listing every EventBus subscription (module / handler / purpose) so reviewers can answer "who reacts to event X?" in one place
│   │
│   ├── domain/                     Domain policies (shared across systems)
│   │   ├── combat/
│   │   │   └── SplitSlimePolicy.ts Single source for SPLIT_SLIME split rules
│   │   └── formatters.ts           Centralised presentation formatters (e.g. formatScore) used by HUD, GameView, LeaderboardView
│   │
│   ├── systems/                    ECS systems — pure update logic, no rendering
│   │   ├── TowerPlacementSystem.ts Click-to-place, grid snap, preview on hover
│   │   ├── CombatSystem.ts         Attacks, projectile lifecycle, boss-shield trigger
│   │   ├── MovementSystem.ts       Path movement with arc-length correction
│   │   ├── WaveSystem.ts           Enemy spawn queue per level-defs
│   │   ├── BuffSystem.ts           Strategy-map buff/curse effects + timers
│   │   ├── EconomySystem.ts        Gold on kill, HP on origin reach
│   │   └── __tests__/              Vitest unit tests for every system
│   │
│   ├── renderers/                  Draw entities to canvas (read-only state)
│   │   ├── EnemyRenderer.ts
│   │   ├── TowerRenderer.ts
│   │   └── ProjectileRenderer.ts
│   │
│   ├── entities/
│   │   ├── types.ts                Tower, Enemy, Projectile, TowerPreview interfaces
│   │   ├── TowerFactory.ts         Build towers from tower-defs + ui-defs params
│   │   └── EnemyFactory.ts         Build enemies from enemy-defs
│   │
│   ├── math/
│   │   ├── WasmBridge.ts           initWasm, RAII float buffers, JS fallbacks
│   │   ├── wasm-exports.d.ts       Ambient type decl for the generated math_engine module
│   │   ├── MathUtils.ts            Coordinate conversion, findIntersections, sector test
│   │   └── PathEvaluator.ts        Random path generation (5 families) + validation
│   │
│   ├── data/                       Static definitions — no functions
│   │   ├── constants.ts            GamePhase / TowerType / EnemyType / Events (`as const`)
│   │   ├── tower-defs.ts           Cost, damage, range, math concept, default params
│   │   ├── enemy-defs.ts           HP, speed, reward, size
│   │   ├── level-defs.ts           Levels 1–4: wave count, enemy distribution, path seed
│   │   ├── buff-defs.ts            Buff / curse IDs, labels, effect specs
│   │   └── ui-defs.ts              Panel layout, colour palette
│   │
│   └── styles/global.css
│
├── public/
│   └── wasm/                       Compiled WASM (generated — do not edit)
│       ├── math_engine.js
│       └── math_engine.wasm
│
├── package.json
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
└── vite.config.ts
```

---

## Game Engine

### Overview

The engine is **ECS-inspired**: entities (towers, enemies, projectiles) are plain data; systems contain all update and render logic. The main loop runs a fixed-timestep 60 FPS accumulator. The engine is pure TypeScript — it has no Vue imports and is independently testable.

```
Game.start()
  └─ requestAnimationFrame loop
       ├─ accumulate frame time (clamped to 0.1 s to avoid spiral-of-death)
       └─ while accumulator >= FIXED_DT (1/60 s):
            ├─ for each system: system.update(dt, game)
            │     placement → combat → movement → wave → buff → economy
            └─ accumulator -= FIXED_DT
       └─ render pass:
            renderer.clear() → drawGrid → drawOrigin → drawFunction (path)
            for each system: system.render?.(renderer, game)
              EnemyRenderer → TowerRenderer → ProjectileRenderer
```

### `Game.ts`

Central orchestrator. Owns:

- The RAF loop with fixed-timestep accumulation (`FIXED_DT = 1 / TARGET_FPS`)
- A `Map<string, GameSystem>` of registered systems
- State operations with event side effects: `changeGold`, `changeHp`, `addScore`, `setPhase` (validated via `PhaseStateMachine`)
- Flow entry points: `startLevel(n)`, `startWave()`

### `GameState.ts`

```typescript
interface GameState {
  // Flow
  phase: GamePhase
  level: number
  wave: number
  totalWaves: number

  // Resources
  gold: number
  hp: number
  maxHp: number
  score: number
  kills: number

  // Buff flags — explicit fields
  shieldActive: boolean
  goldMultiplier: number
  freeTowerNext: boolean
  enemySpeedMultiplier: number

  // Boss Shield (centrally managed, not buried in CombatSystem)
  bossShieldTriggered: boolean
  bossShieldTimer: number
  bossShieldTarget: { freqs: number[]; amps: number[] } | null

  // Path
  pathExpression: string
}
```

`createInitialState()` returns a fresh state; `Game.startLevel()` calls it on every level entry, which also handles retry from `GAME_OVER`.

### `PhaseStateMachine.ts`

Enforces valid phase transitions. Attempts to transition illegally simply return `false` (logged in dev). `forceTransition()` is used during `startLevel` to escape terminal phases like `GAME_OVER`.

```
Valid transitions:
  MENU          → LEVEL_SELECT | BUILD
  LEVEL_SELECT  → BUILD
  BUILD         → WAVE
  WAVE          → BUFF_SELECT | BOSS_SHIELD | LEVEL_END | GAME_OVER
  BUFF_SELECT   → BUILD
  BOSS_SHIELD   → WAVE
  LEVEL_END     → BUILD | MENU
  GAME_OVER     → MENU (or reset via startLevel)
```

### `EventBus.ts`

Type-safe generic pub/sub. All event names and payload shapes live in the `GameEvents` interface in `Game.ts` (includes an index signature so custom event names still type-check). Every subscription returns an `unsubscribe()` function; `useGameLoop` collects these and calls them all on unmount.

Events include: `PHASE_CHANGED`, `LEVEL_START/END`, `GAME_OVER`, `BUILD_PHASE_START/END`, `WAVE_START/END`, `TOWER_PLACED/SELECTED/PARAMS_SET`, `CAST_SPELL`, `TOWER_ATTACK`, `ENEMY_SPAWNED/KILLED/REACHED_ORIGIN`, `BUFF_PHASE_START/END`, `BUFF_CARDS_UPDATED`, `BUFF_CARD_SELECTED`, `BUFF_RESULT`, `BOSS_SHIELD_START/ATTEMPT/END`, `GOLD_CHANGED`, `HP_CHANGED`, `SCORE_CHANGED`, `CANVAS_CLICK/HOVER`.

Subscriptions are indexed in `engine/event-handlers/registry.ts` — the registry is typed against the `Events` map, so removing or renaming an event surfaces a compile error at the index site. Any new `eventBus.on(...)` call must add an entry; reviewers use it to audit that every subscription is disposed on unmount / `destroy()`.

### `InputManager.ts`

Translates raw canvas mouse events into both pixel and game-unit coordinates:

```
game unit = (pixel - origin) / unitPx
```

Emits `CANVAS_CLICK` and `CANVAS_HOVER` on the EventBus so systems never reach into the DOM.

---

## Game Systems

| System | Responsibility |
|---|---|
| `TowerPlacementSystem` | Handles `CANVAS_CLICK` during `BUILD`; validates grid cell + gold; creates a tower via `TowerFactory`; emits `TOWER_PLACED`. Accepts **injected callbacks** `getSelectedTowerType` / `clearSelectedTowerType` instead of reaching into a Pinia store. |
| `CombatSystem` | Per-tower cooldown; picks target in range; dispatches by tower type (Function Cannon → `calculateTrajectory`, Radar Sweep → `pointInSector`, Integral Cannon → `numericalIntegrate`, Matrix Link → `matrixMultiply`). Triggers boss-shield mini-game via `Events.BOSS_SHIELD_START`. |
| `MovementSystem` | Advances enemies along `pathFunction` with arc-length correction; reads `state.enemySpeedMultiplier`; emits `ENEMY_REACHED_ORIGIN`. Uses `SplitSlimePolicy` for split-on-death children. |
| `WaveSystem` | Reads wave schedule from `level-defs.ts`; spawns via `EnemyFactory` at configured intervals; detects clear and emits `WAVE_END`. |
| `BuffSystem` | Strategy-map (`effectId` → handler) lookup; manages active buff durations across `WAVE_END` ticks; handles curse cards too. |
| `EconomySystem` | Single place that awards gold on `ENEMY_KILLED` and deals damage on `ENEMY_REACHED_ORIGIN`. Previously inlined in `Game._setupEventHandlers`; factored out for testability. Includes Boss-dragon `GAME_OVER` trigger (damage = 99). |

### `SplitSlimePolicy` (shared domain policy)

`src/domain/combat/SplitSlimePolicy.ts` exports `shouldSplit()` and `spawnChildren()` — the single source of truth for how Slime-family enemies split on death. Used by both `CombatSystem` and `MovementSystem` so the rules cannot drift.

---

## Vue ↔ Engine Bridge

The engine knows nothing about Vue. `useGameLoop.ts` is the only bridge:

```
onMounted:
  await initWasm()
  g = new Game(canvas)
  inject systems (placement has UI callbacks injected)
  subscribe to LEVEL_START   → generatePath + sync pathExpression to gameStore
  subscribe to TOWER_PLACED  → open BuildPanel, advance BuildHint
  subscribe to TOWER_SELECTED → open/close BuildPanel
  useSessionSync().bind(g)   → backend session lifecycle
  gameStore.bindEngine(g)    → reactive state mirror
  g.start()

onUnmounted:
  run every unsub()
  gameStore.unbindEngine()
  g.destroy()  (stops loop, destroys systems, clears event bus + input)
```

### Engine → Vue (reads)

`gameStore.bindEngine(g)` subscribes to state-mutation events (`GOLD_CHANGED`, `HP_CHANGED`, `SCORE_CHANGED`, `PHASE_CHANGED`, `WAVE_START`, …) and mirrors the fields the HUD needs.

### Vue → Engine (writes)

User actions call engine methods directly through the store — e.g. `BuildPanel.vue` calls `gameStore.setTowerParams(tower, params)` which calls `game.eventBus.emit(Events.TOWER_PARAMS_SET, { tower, params })`.

### Session Sync

`useSessionSync.ts` subscribes to `LEVEL_START` / `WAVE_END` / `LEVEL_END` / `GAME_OVER` and mirrors state to the backend via `sessionService` (create on level start, patch on wave end, end on level complete / game over). It is resilient to transient network failures so the final score is not lost.

---

## Pinia Stores

### `authStore`

| State | Description |
|---|---|
| `token` | JWT access token (persisted to `localStorage`) |
| `user` | `{ id, username }` or `null` |
| `initializing` | `true` while `me()` is in-flight on boot |

Actions: `init()`, `setToken()`, `setUser()`, `clearAuth()`, `logout()`.

### `gameStore`

Mirrors a subset of `GameState` for Vue reactivity:

| State | Description |
|---|---|
| `phase` | Current `GamePhase` |
| `level` | Active level index (1–4) |
| `hp / maxHp / gold / score / kills` | Player resources and counters |
| `wave / totalWaves` | Wave progress |
| `buffCards` | Currently drawn buff/curse card trio |
| `pathExpression` | String expression for the current level path |

Computed: `isBuilding`, `isWave`, `isBuff`, `hpPercent`.

Actions: `bindEngine(g)`, `unbindEngine()`, `syncFromEngine(g)`.

> The boss-shield Fourier target lives in the engine's `GameState`, not the store — the `FourierPanel` reads it through `useGameLoop` / events, so the reactive store stays focused on HUD mirror state.

### `uiStore`

Panel visibility, selected tower type, build-hint step, modal state.

---

## Services

| Service | Methods |
|---|---|
| `api.ts` | `request<T>(path, opts)` — fetch wrapper with auto Bearer token + `ApiError` class |
| `authService.ts` | `register(u, p)`, `login(u, p)`, `me()`, `logout()` |
| `sessionService.ts` | `createSession(level)`, `getActiveSession()`, `updateSession(id, patch)`, `endSession(id, result)`, `abandonSession(id)` |
| `leaderboardService.ts` | `fetchLeaderboard({ level, page, perPage })`, `submitScore(payload)` |

`api.ts` returns typed `ApiError(status, body)` on non-2xx responses so callers can branch on `err.status === 409`, etc.

---

## WASM Integration

`WasmBridge.ts` handles loading and exposes a unified public surface:

```typescript
await initWasm()                         // loads math_engine.js; returns false if unavailable
isUsingWasm()                            // true if WASM is the active backend

matrixMultiply(a, b)                     // 2×2 × 2×2
sectorCoverage(r, θ)
pointInSector(px, py, cx, cy, r, aStart, aWidth)
numericalIntegrate(a, b, c, lo, hi, n = 100)
fourierComposite(t, freqs, amps)
fourierMatch(f1, a1, f2, a2, samples = 200)
calculateTrajectory(a, b, c, xStart, xEnd, step)
lineCircleIntersect(m, b, cx, cy, r)

setUseWasm(use)                          // force JS fallback (used by parity tests)
benchmark(fn, iterations = 1000)         // ms per iteration; reports WASM vs JS in dev
```

**RAII memory management** — `withFloatBuffers<T>(sizes, cb)` allocates via `_malloc`, runs the callback, and `_free`s in a `finally` block. Callers never handle raw pointers.

**Pure-JS fallback** — every function has a TypeScript implementation used when WASM fails to load. Game systems always call `WasmBridge.*` and never import `math_engine.js` directly. Bridge-level tests assert parity between the two backends.

---

## Routing

| Path | Component | Guard |
|---|---|---|
| `/` | `MenuView` | — |
| `/auth` | `AuthView` | Redirect to `/` if already logged in |
| `/game` | `GameView` | Requires auth |
| `/leaderboard` | `LeaderboardView` | — |

---

## API Communication

All requests go through `services/api.ts`. The dev server proxies `/api/*` → `http://localhost:8000` (see `vite.config.ts`), so the browser sees no CORS in local dev. The Authorization header is injected automatically when `authStore.token` is set.

---

## Setup & Development

```bash
cd frontend
npm install
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # prebuild → `cd ../wasm && make`; then vue-tsc -b + vite build
npm run preview    # Preview the production build
npm test           # Vitest — 14 test files covering engine, systems, composables, math bridge
npm run test:watch # Vitest in watch mode
```

Type-check only (no emit): `npx vue-tsc -b`.

### TypeScript project settings of note

- `erasableSyntaxOnly: true` — no `enum`; use `as const` + type alias.
- `verbatimModuleSyntax: true` — type-only imports must use `import type`.
- `noUnusedLocals` / `noUnusedParameters: true` — prefix intentionally unused params with `_`.
- Path aliases: `@/*` → `src/*`; `@shared/*` → `../shared/*`.

---

## Testing

```
src/engine/*.test.ts                EventBus, Game, PhaseStateMachine
src/composables/useSessionSync.test.ts
src/math/PathEvaluator.test.ts
src/math/WasmBridge.test.ts         JS-only parity (fallback surface + numerical invariants)
src/math/WasmBridge.wasm.test.ts    JS ↔ WASM parity under Node (requires math_engine.* built)
src/systems/__tests__/*.test.ts     BuffSystem (+ duration), CombatSystem, EconomySystem,
                                    MovementSystem, TowerPlacementSystem, WaveSystem
```

Vitest is configured with `happy-dom` so systems can be tested without a real browser. The two WASM-bridge test files split responsibilities: `WasmBridge.test.ts` pins the JS fallback's behaviour without loading the binary, and `WasmBridge.wasm.test.ts` loads the compiled module under Node to assert numerical parity between the two backends (skipped if the WASM build is absent).

---

## Canvas Coordinate System

The game has its own coordinate system, separate from pixels:

```
Game unit (0, 0) = pixel (originX, originY) = pixel (160, 600)
1 game unit      = 40 pixels (unitPx)

Conversion:
  pixelX = originX + gameX * unitPx
  pixelY = originY - gameY * unitPx      ← Y axis inverted (game-Y up = pixel-Y down)
```

Grid bounds: X ∈ [-3, 25], Y ∈ [-2, 14]. Tower placement snaps to integer grid cells. Canvas size, origin, unit, bounds, initial HP/gold and `hitRadius` all come from `shared/game-constants.json`.
