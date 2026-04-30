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
| Math Display | KaTeX (`<MathDisplay>` wrapper component) |
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
│   │   ├── MenuView.vue            Main menu
│   │   ├── AuthView.vue            Login / register (email + player_name + role)
│   │   ├── LevelSelectView.vue     Star-rated difficulty picker (1–5 stars)
│   │   ├── InitialAnswerView.vue   Pre-game endpoint identification (Initial Answer)
│   │   ├── GameView.vue            Game container (canvas + HUD overlay)
│   │   ├── ScoreResultView.vue     Post-game score breakdown (S1/S2/K/TotalScore)
│   │   ├── LeaderboardView.vue     Score table
│   │   ├── ProfileView.vue         User profile + achievement/talent summary cards
│   │   ├── AchievementView.vue     Achievement gallery (20 achievements, 5 categories)
│   │   ├── TalentTreeView.vue      Talent tree allocation UI (21 nodes, 7 tower types)
│   │   ├── ClassView.vue           Student: list/join classes; Teacher: create/manage classes
│   │   ├── AdminView.vue           Admin dashboards for teachers / classes / students
│   │   ├── TeacherDashboard.vue    Teacher overview of activity results
│   │   ├── TeacherTerritorySetup.vue  Create a Grabbing Territory activity
│   │   ├── TerritoryListView.vue   List of territory activities
│   │   ├── TerritoryDetailView.vue Territory map + slot status
│   │   ├── TerritoryResultView.vue Play / result screen for a territory slot
│   │   └── RankingsView.vue        Territory or global rankings (4 ranking types)
│   │
│   ├── components/
│   │   ├── common/
│   │   │   ├── Modal.vue           Generic modal wrapper
│   │   │   ├── MathDisplay.vue     KaTeX renderer wrapper
│   │   │   └── LevelCard.vue       Level-selection card (emits 'select')
│   │   └── game/
│   │       ├── HUD.vue             Two-row HUD: star rating, kill value, IA indicator,
│   │       │                       Monty Hall progress bar, spell bar, buff icons, prep timer
│   │       ├── TowerBar.vue        Tower selection bar
│   │       ├── StartWaveButton.vue Player-paced "Start Wave" control shown during BUILD
│   │       ├── BuildPanel.vue      Thin wrapper — delegates to TowerInfoPanel
│   │       ├── TowerInfoPanel.vue  Unified stats + type-specific panel + upgrade button
│   │       ├── BuildHint.vue       First-time placement hints
│   │       ├── ShopPanel.vue       In-BUILD shop for time-based buffs
│   │       ├── SpellBar.vue        Spell cooldown buttons (Fireball/Frost Nova/Lightning/Rejuvenate)
│   │       ├── MagicModePanel.vue  Magic tower: function curve selection
│   │       ├── RadarConfigPanel.vue Radar tower: arc start/end/restrict config
│   │       ├── MatrixPairPanel.vue  Matrix tower: pair selection
│   │       ├── LimitQuestionPanel.vue  Limit tower: multiple-choice lim question
│   │       ├── CalculusPanel.vue   Calculus tower: derivative/integral function picker
│   │       ├── ChainRulePanel.vue  Boss Type-B chain-rule challenge overlay (KaTeX)
│   │       ├── MontyHallPanel.vue  Monty Hall event overlay (doors, reveal, switch)
│   │       ├── AchievementToast.vue Toast for newly-unlocked achievements after session end
│   │       ├── BuffCardPanel.vue   (Legacy V1 — buff card draw overlay; superseded by ShopPanel)
│   │       ├── FunctionPanel.vue   (Legacy V1 — quadratic a/b/c input)
│   │       ├── MatrixInputPanel.vue (Legacy V1 — 2×2 matrix input)
│   │       ├── IntegralPanel.vue   (Legacy V1 — [a,b] interval input)
│   │       └── FourierPanel.vue    (Legacy V1 — 3-sine sliders)
│   │
│   ├── composables/
│   │   ├── useGameLoop.ts          Mount/unmount engine, inject systems, wire UI bridges, talent modifiers
│   │   ├── useSessionSync.ts       Bridge engine lifecycle ↔ backend session API (V2 payload)
│   │   ├── useAuth.ts              Reactive auth helpers (email-based; role checks)
│   │   └── useLeaderboard.ts       Leaderboard fetch helpers
│   │
│   ├── stores/                     Pinia stores (Vue reactivity layer)
│   │   ├── authStore.ts            token, user (email/player_name/role), initialising flag
│   │   ├── gameStore.ts            Mirror of engine state → drives HUD reactivity (V2 fields)
│   │   ├── talentStore.ts          Caches talent modifiers; exposes getTowerModifiers()
│   │   ├── territoryStore.ts       Territory activity state
│   │   └── uiStore.ts              Panel visibility, selected tower type, hint step
│   │
│   ├── services/                   Backend API clients
│   │   ├── api.ts                  fetch wrapper; auto-attaches Bearer token; ApiError
│   │   ├── authService.ts          register(email, playerName, password, role) / login / me / logout
│   │   ├── sessionService.ts       create / update / end / abandon / getActive (V2 fields)
│   │   ├── leaderboardService.ts   fetchLeaderboard, submitScore
│   │   ├── achievementService.ts   fetchAchievements, fetchSummary
│   │   ├── talentService.ts        fetchTree, fetchModifiers, allocate, reset
│   │   ├── classService.ts         createClass, listClasses, joinByCode, deleteClass
│   │   ├── adminService.ts         listTeachers, listClasses, listStudents
│   │   ├── rankingService.ts       fetchRankings (4 ranking types)
│   │   └── territoryService.ts     createActivity, listActivities, getActivity, occupySlot, getRankings
│   │
│   ├── router/index.ts             Routes with RBAC guards (protected / admin / teacher / student sets)
│   │
│   ├── engine/                     Core engine — pure TS, no Vue imports
│   │   ├── Game.ts                 Fixed-timestep loop orchestrator + GameEvents map + towerModifierProvider callback
│   │   ├── GameState.ts            Strongly typed V2 state container (see GameState section below)
│   │   ├── PhaseStateMachine.ts    FSM with transition validation table (V2 phases)
│   │   ├── EventBus.ts             Generic, type-safe pub/sub
│   │   ├── InputManager.ts         Canvas mouse → game-unit coord events
│   │   ├── Renderer.ts             Canvas-2D drawing primitives
│   │   ├── level-context.ts        Per-level runtime context (curve path, movement strategy, tile style)
│   │   ├── event-handlers/
│   │   │   └── registry.ts         EVENT_HANDLER_REGISTRY — index of every EventBus subscription
│   │   ├── projections/
│   │   │   └── project-path-panel.ts   Path-panel viewport projection (world → screen pixels)
│   │   └── render-helpers/
│   │       └── tile-style.ts           Tile-appearance lookup shared by grid + placement preview
│   │
│   ├── domain/                     Domain policies (shared across systems)
│   │   ├── combat/
│   │   │   └── SplitSlimePolicy.ts     Single source for Split enemy split rules
│   │   ├── level/
│   │   │   ├── level-generator.ts      Reverse-endpoint curve generation algorithm
│   │   │   ├── distractor-generator.ts Plausible wrong answers for Initial Answer
│   │   │   ├── level-layout-service.ts Builds SegmentedPath + placement rules for a level definition
│   │   │   ├── path-group-defs.ts      7 runtime path group definitions
│   │   │   └── placement-policy.ts     Grid-cell → can-place decision shared by preview and click handler
│   │   ├── movement/               Curve-path and piecewise-path movement strategies
│   │   │   ├── movement-strategy.ts
│   │   │   ├── movement-strategy-registry.ts
│   │   │   ├── horizontal-movement-strategy.ts
│   │   │   ├── vertical-movement-strategy.ts
│   │   │   ├── linear-movement-strategy.ts
│   │   │   ├── quadratic-movement-strategy.ts
│   │   │   └── trig-movement-strategy.ts
│   │   ├── path/                   Piecewise path construction + progress tracking
│   │   │   ├── curve-path.ts             V2 CurvePath interface (separate from SegmentedPath)
│   │   │   ├── spawn-calculator.ts       Curve-boundary intersections for enemy spawning
│   │   │   ├── segmented-path.ts         Immutable ordered segment list + total arc length
│   │   │   ├── segment-factories.ts      Factories for each segment kind
│   │   │   ├── path-builder.ts           Random generator producing 1–N connected segments
│   │   │   ├── path-progress-tracker.ts  Scalar progress (0–1) ↔ (segment, localT)
│   │   │   └── path-validator.ts         Enforces grid-bounds + coverage rules
│   │   ├── placement/
│   │   │   └── legal-positions.ts        Grid intersection point legality computation
│   │   ├── scoring/
│   │   │   └── score-calculator.ts       S1/S2/K/TotalScore formula (mirrors backend)
│   │   ├── tower/
│   │   │   └── magic-candidates.ts       Function curve generation (polynomial/trig/log) for Magic tower
│   │   └── formatters.ts           Centralised presentation formatters (formatScore, etc.)
│   │
│   ├── systems/                    ECS systems — pure update logic
│   │   ├── TowerPlacementSystem.ts Click-to-place, grid snap, legal-position check, talent modifiers
│   │   ├── TowerUpgradeSystem.ts   Handles TOWER_UPGRADE and TOWER_REFUND events
│   │   ├── CombatSystem.ts         Projectile physics + DoT ticking; shield absorption
│   │   ├── EnemyAbilitySystem.ts   Helper aura tick, boss minion spawning, chain-rule trigger, boss-death split
│   │   ├── MagicTowerSystem.ts     Function zone effects (debuff enemies / buff towers)
│   │   ├── RadarTowerSystem.ts     Continuous sweep AoE + single-target projectiles
│   │   ├── MatrixTowerSystem.ts    Paired towers + dot-product damage + laser lock-on
│   │   ├── LimitTowerSystem.ts     Multiple-choice limit question + range-based attack
│   │   ├── CalculusTowerSystem.ts  Derivative/integral picker + pet spawning
│   │   ├── MovementSystem.ts       Path movement with arc-length correction
│   │   ├── WaveSystem.ts           Enemy spawn queue per level-defs + wave-generator
│   │   ├── BuffSystem.ts           Time-based buff/curse strategy map; applyExternalBuff() public API
│   │   ├── SpellSystem.ts          4 spells (Fireball/Frost Nova/Lightning/Rejuvenate) + cooldown mgmt
│   │   ├── MontyHallSystem.ts      Kill-value threshold triggers; door reveal + switch logic; reward injection
│   │   ├── EconomySystem.ts        Gold on kill (×goldMultiplier), HP on origin reach, wave bonuses
│   │   └── __tests__/              Vitest unit tests
│   │
│   ├── renderers/                  Draw entities to canvas (read-only state)
│   │   ├── EnemyRenderer.ts        HP bar, shield bar (blue), helper aura circle
│   │   ├── TowerRenderer.ts
│   │   ├── ProjectileRenderer.ts
│   │   ├── MagicZoneRenderer.ts    Function curve zone overlay
│   │   ├── RadarRangeRenderer.ts   Arc + sweep visualisation
│   │   ├── MatrixLaserRenderer.ts  Laser beam between matrix pair
│   │   ├── PetRenderer.ts          Pet projectile sprites
│   │   └── SpellEffectRenderer.ts  Expanding circle VFX for spells
│   │
│   ├── entities/
│   │   ├── types.ts                Tower, Enemy, Projectile, Pet, TowerPreview interfaces (V2 fields)
│   │   ├── TowerFactory.ts         Build towers from tower-defs; accepts optional talent modifiers
│   │   └── EnemyFactory.ts         Build enemies from enemy-defs (V2: split/helper/boss config)
│   │
│   ├── math/
│   │   ├── WasmBridge.ts           initWasm, RAII float buffers, JS fallbacks
│   │   ├── wasm-exports.d.ts       Ambient type decl for the generated math_engine module
│   │   ├── MathUtils.ts            Coordinate conversion, findIntersections, sector test
│   │   ├── RandomUtils.ts          hashStr / mulberry32 — single source used by 4 consumers
│   │   ├── curve-types.ts          CurveDefinition union (polynomial/trig/log), coefficient bounds
│   │   ├── curve-evaluator.ts      evaluate / derivative / isInDomain / curveToLatex (5 families)
│   │   ├── curve-renderer.ts       Accepts CoordTransform callback (no canvas import)
│   │   ├── intersection-solver.ts  Pair/all-curves intersection finding with domain-safe evaluation
│   │   ├── limit-evaluator.ts      Limit question generation with exhaustive outcome handling
│   │   ├── chain-rule-generator.ts Chain rule question generation (pure, no game imports)
│   │   └── wasm/                   Compiled WASM assets (generated — do not edit)
│   │       ├── math_engine.js
│   │       ├── math_engine.wasm
│   │       └── math_engine.d.ts
│   │
│   ├── data/                       Static definitions — no functions
│   │   ├── constants.ts            GamePhase / TowerType / EnemyType / Events (`as const`)
│   │   ├── tower-defs.ts           Cost, damage, range, math concept, V2 params (7 tower types)
│   │   ├── enemy-defs.ts           HP, speed, reward, split/helper/boss config (7 enemy types)
│   │   ├── level-defs.ts           V2 wave definitions with enemy distribution
│   │   ├── difficulty-defs.ts      DIFFICULTY_TABLE, MultisetEntry, pickRandomMultiset
│   │   ├── buff-defs.ts            Time-based buff/curse IDs, labels, effect strategies (30+ effects)
│   │   ├── spell-defs.ts           4 spell definitions (Fireball/Frost Nova/Lightning/Rejuvenate)
│   │   ├── monty-hall-defs.ts      Kill-value thresholds per star rating; door reward pool
│   │   ├── achievement-defs.ts     20 achievement definitions (5 categories)
│   │   ├── talent-defs.ts          21 talent node definitions (7 tower types, prereq chains)
│   │   ├── wave-templates.ts       Wave template definitions
│   │   ├── wave-generator.ts       Dynamic wave generation utilities
│   │   ├── path-segment-types.ts   Piecewise path segment type constants
│   │   └── ui-defs.ts              Panel layout, colour palette
│   │
│   └── styles/global.css
│
├── package.json
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
└── vite.config.ts
```

---

## Game Engine

### Overview

The engine is **ECS-inspired**: entities (towers, enemies, projectiles, pets) are plain data; systems contain all update and render logic. The main loop runs a fixed-timestep 60 FPS accumulator. The engine is pure TypeScript — it has no Vue imports and is independently testable.

```
Game.start()
  └─ requestAnimationFrame loop
       ├─ accumulate frame time (clamped to 0.1 s to avoid spiral-of-death)
       └─ while accumulator >= FIXED_DT (1/60 s):
            ├─ for each system: system.update(dt, game)
            │     placement → combat → movement → wave → buff → economy → …
            └─ accumulator -= FIXED_DT
       └─ render pass:
            renderer.clear() → drawGrid → drawOrigin → drawFunction (path)
            for each system: system.render?.(renderer, game)
              EnemyRenderer → TowerRenderer → ProjectileRenderer → PetRenderer
              MagicZoneRenderer → RadarRangeRenderer → MatrixLaserRenderer
              SpellEffectRenderer
```

### `Game.ts`

Central orchestrator. Owns:

- The RAF loop with fixed-timestep accumulation (`FIXED_DT = 1 / TARGET_FPS`)
- A `Map<string, GameSystem>` of registered systems
- State operations with event side effects: `changeGold`, `changeHp`, `addScore`, `setPhase` (validated via `PhaseStateMachine`)
- `towerModifierProvider` callback — bridges Vue/Pinia (`talentStore`) → engine; set by `useGameLoop` so the engine never imports Pinia
- Flow entry points: `startLevel(levelDef)`, `startWave()`

### `GameState.ts`

```typescript
interface GameState {
  // Flow
  phase: GamePhase
  level: number
  starRating: number
  wave: number
  totalWaves: number

  // Resources
  gold: number
  hp: number
  maxHp: number
  score: number
  kills: number
  cumulativeKillValue: number

  // V2 Economy tracking
  costTotal: number
  healthOrigin: number

  // V2 Timing
  timeTotal: number
  timeExcludePrepare: number[]
  prepPhaseStart: number

  // V2 Initial Answer
  initialAnswer: 0 | 1
  pathsVisible: boolean

  // V2 Monty Hall
  montyHallNextIndex: number
  montyHallPending: boolean

  // Buff flags
  shieldActive: boolean
  goldMultiplier: number
  freeTowerNext: boolean
  freeTowerCharges: number
  enemySpeedMultiplier: number
  enemyVulnerability: number

  // Active buffs (time-based)
  activeBuffs: ActiveBuffEntry[]

  // Spell cooldowns
  spellCooldowns: Record<string, number>  // spellId → remaining cooldown seconds
}
```

`createInitialState()` returns a fresh state; `Game.startLevel()` calls it on every level entry.

### `PhaseStateMachine.ts`

Enforces valid phase transitions. Attempts to transition illegally return `false` (logged in dev). `forceTransition()` is used during `startLevel` to escape terminal phases like `GAME_OVER`.

```
Valid transitions:
  MENU          → LEVEL_SELECT | BUILD
  LEVEL_SELECT  → BUILD | MENU
  BUILD         → WAVE | GAME_OVER | MENU
  WAVE          → BUILD | MONTY_HALL | LEVEL_END | GAME_OVER | CHAIN_RULE | BUFF_SELECT
  BUFF_SELECT   → BUILD                        (legacy path; normal flow skips this)
  MONTY_HALL    → BUILD | GAME_OVER
  CHAIN_RULE    → WAVE | GAME_OVER
  LEVEL_END     → LEVEL_SELECT | MENU | BUILD
  GAME_OVER     → MENU | LEVEL_SELECT | BUILD
```

### `EventBus.ts`

Type-safe generic pub/sub. All event names and payload shapes live in the `GameEvents` interface in `Game.ts`. Every subscription returns an `unsubscribe()` function; `useGameLoop` collects these and calls them all on unmount.

Events include: `PHASE_CHANGED`, `LEVEL_START/END`, `GAME_OVER`, `BUILD_PHASE_START/END`, `WAVE_START/END`, `TOWER_PLACED/SELECTED/PARAMS_SET/UPGRADE/REFUND`, `CAST_SPELL`, `TOWER_ATTACK`, `ENEMY_SPAWNED/KILLED/REACHED_ORIGIN`, `BUFF_PHASE_START/END`, `BUFF_CARD_SELECTED`, `BUFF_RESULT`, `BOSS_SHIELD_START/ATTEMPT/END`, `CHAIN_RULE_START/ANSWER/END`, `MONTY_HALL_TRIGGER/DOOR_SELECTED/SWITCH_DECISION/RESULT`, `GOLD_CHANGED`, `HP_CHANGED`, `SCORE_CHANGED`, `CANVAS_CLICK/HOVER`.

---

## Game Systems

| System | Responsibility |
|---|---|
| `TowerPlacementSystem` | Handles `CANVAS_CLICK` during `BUILD`; validates legal grid positions + gold; creates tower via `TowerFactory` with talent modifiers; emits `TOWER_PLACED` |
| `TowerUpgradeSystem` | Handles `TOWER_UPGRADE` (increments tier, adjusts stats) and `TOWER_REFUND` events |
| `CombatSystem` | Projectile physics + DoT ticking; shield HP absorption (shield bar drawn by EnemyRenderer) |
| `EnemyAbilitySystem` | Helper aura tick, boss minion spawning, chain-rule trigger/answer, boss-death split via `ENEMY_KILLED` listener |
| `MagicTowerSystem` | Function curve zone: debuffs enemies inside, buffs nearby towers; `getTowerCurve()` public API used by renderer |
| `RadarTowerSystem` | Continuous AoE sweep (Radar A) + fast single-target (Radar B) + slow powerful (Radar C) |
| `MatrixTowerSystem` | Paired towers via `matrixPairId`; continuous laser with dot-product damage |
| `LimitTowerSystem` | Presents lim question; resolves ±∞/±C/0 outcome; applies range effect |
| `CalculusTowerSystem` | Derivative/integral picker; spawns Pet entities managed by `PetCombatSystem` |
| `SpellSystem` | Fireball (AoE), Frost Nova (slow), Lightning (single), Rejuvenate (tower buff); cooldown per spell |
| `MontyHallSystem` | Kill-value thresholds per star rating; door reveal logic; injects rewards via `BuffSystem.applyExternalBuff()` |
| `MovementSystem` | Advances enemies along CurvePath/SegmentedPath via matching strategy; reads `speedBoost` + `enemySpeedMultiplier` |
| `WaveSystem` | Reads wave schedule; spawns via `EnemyFactory`; detects clear, emits `WAVE_END` |
| `BuffSystem` | Time-based active buffs; 30+ effect strategies; `applyExternalBuff()` for SpellSystem + MontyHallSystem |
| `EconomySystem` | Gold on `ENEMY_KILLED` (`killValue × goldMultiplier`); HP damage on `ENEMY_REACHED_ORIGIN`; wave completion bonus |

---

## Vue ↔ Engine Bridge

The engine knows nothing about Vue. `useGameLoop.ts` is the only bridge:

```
onMounted:
  await initWasm()
  g = new Game(canvas)
  inject all systems
  g.towerModifierProvider = () => talentStore.getModifiers()   // Pinia → engine
  subscribe to LEVEL_START   → build CurvePath (domain/path) + sync to gameStore
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

`gameStore.bindEngine(g)` subscribes to state-mutation events and mirrors V2 fields (kill value, Monty Hall progress, active buffs, spell cooldowns) for HUD reactivity.

### Vue → Engine (writes)

User actions emit events through the store — `BuildPanel.vue` calls `TowerInfoPanel` which emits `Events.TOWER_PARAMS_SET` or `Events.TOWER_UPGRADE` on the EventBus. Systems never receive direct method calls from Vue.

### Session Sync

`useSessionSync.ts` subscribes to `LEVEL_START` / `WAVE_END` / `LEVEL_END` / `GAME_OVER` and mirrors the full V2 payload to the backend (`star_rating`, `initial_answer`, `kill_value`, `cost_total`, `time_total`, `time_exclude_prepare`, `health_origin`, `health_final`). Resilient to transient network failures.

---

## Pinia Stores

### `authStore`

| State | Description |
|---|---|
| `token` | JWT access token (persisted to `localStorage`) |
| `user` | `{ id, email, playerName, role, avatarUrl }` or `null` |
| `initializing` | `true` while `me()` is in-flight on boot |

Computed: `isLoggedIn`, `isAdmin`, `isTeacher`, `isStudent`.

Actions: `init()`, `setToken()`, `setUser()`, `clearAuth()`, `logout()`.

### `gameStore`

Mirrors a subset of `GameState` for Vue reactivity:

| State | Description |
|---|---|
| `phase` | Current `GamePhase` |
| `level / starRating` | Active level index and star rating |
| `hp / maxHp / gold / score / kills / cumulativeKillValue` | Player resources and counters |
| `wave / totalWaves` | Wave progress |
| `activeBuffs` | Currently active time-based buffs |
| `spellCooldowns` | Remaining cooldown per spell ID |
| `montyHallNextIndex` | Next Monty Hall threshold index |

Computed: `isBuilding`, `isWave`, `hpPercent`.

### `talentStore`

Caches talent allocations fetched from the backend. Exposes `getTowerModifiers(towerType)` returning `{ damageMultiplier, rangeMultiplier, speedMultiplier, petMultiplier }`. Used by `useGameLoop` to inject modifiers into `TowerFactory` via `game.towerModifierProvider`.

### `territoryStore`

Territory activity list and current activity detail for the Territory views.

### `uiStore`

Panel visibility, selected tower type, build-hint step, modal state.

---

## Services

| Service | Methods |
|---|---|
| `api.ts` | `request<T>(path, opts)` — fetch wrapper with auto Bearer token + `ApiError` class |
| `authService.ts` | `register(email, playerName, password, role)`, `login(email, password)`, `me()`, `logout()` |
| `sessionService.ts` | `createSession(starRating)`, `getActiveSession()`, `updateSession(id, patch)`, `endSession(id, result)`, `abandonSession(id)` |
| `leaderboardService.ts` | `fetchLeaderboard({ starRating, page, perPage })`, `submitScore(payload)` |
| `achievementService.ts` | `fetchAchievements()`, `fetchSummary()` |
| `talentService.ts` | `fetchTree()`, `fetchModifiers()`, `allocate(nodeId)`, `reset()` |
| `classService.ts` | `createClass(name)`, `listClasses()`, `joinByCode(code)`, `deleteClass(id)` |
| `adminService.ts` | `listTeachers()`, `listClasses()`, `listStudents()` |
| `rankingService.ts` | `fetchRankings(type, options)` |
| `territoryService.ts` | `createActivity(...)`, `listActivities()`, `getActivity(id)`, `occupySlot(id, slotId)`, `getRankings(id)` |

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

**RAII memory management** — `withFloatBuffers<T>(sizes, cb)` allocates via `_malloc`, runs the callback, and `_free`s in a `finally` block.

**Pure-JS fallback** — every function has a TypeScript implementation used when WASM fails to load. Bridge-level tests assert parity between the two backends.

---

## Routing

| Path | Component | Guard |
|---|---|---|
| `/` | `MenuView` | — |
| `/auth` | `AuthView` | Redirect to `/` if already logged in |
| `/level-select` | `LevelSelectView` | Requires auth (student) |
| `/initial-answer` | `InitialAnswerView` | Requires auth (student) |
| `/game` | `GameView` | Requires auth (student) |
| `/leaderboard` | `LeaderboardView` | Requires auth |
| `/rankings` | `RankingsView` | Requires auth |
| `/profile` | `ProfileView` | Requires auth |
| `/achievements` | `AchievementView` | Requires auth |
| `/talents` | `TalentTreeView` | Requires auth |
| `/classes` | `ClassView` | Requires auth |
| `/territory` | `TerritoryListView` | Requires auth |
| `/territory/create` | `TeacherTerritorySetup` | Requires teacher or admin |
| `/territory/:id` | `TerritoryDetailView` | Requires auth |
| `/territory/:id/play/:slotId` | `TerritoryResultView` | Requires auth |
| `/territory/:id/rankings` | `RankingsView` | Requires auth |
| `/teacher` | `TeacherDashboard` | Requires teacher or admin |
| `/admin/teachers` | `AdminView` | Requires admin |
| `/admin/classes` | `AdminView` | Requires admin |
| `/admin/students` | `AdminView` | Requires admin |

---

## Setup & Development

```bash
cd frontend
npm install
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # prebuild → `cd ../wasm && make`; then vue-tsc -b + vite build
npm run preview    # Preview the production build
npm test           # Vitest — 26 test files
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
src/engine/EventBus.test.ts
src/engine/Game.test.ts
src/engine/PhaseStateMachine.test.ts
src/engine/Renderer.test.ts
src/engine/level-context.test.ts
src/engine/projections/project-path-panel.test.ts
src/engine/render-helpers/tile-style.test.ts
src/domain/level/level-layout-service.test.ts
src/domain/level/placement-policy.test.ts
src/domain/movement/*.test.ts             horizontal / vertical / linear / quadratic / trig strategies
src/domain/path/path-builder.test.ts
src/domain/path/path-progress-tracker.test.ts
src/domain/path/path-validator.test.ts
src/domain/path/segmented-path.test.ts
src/composables/useSessionSync.test.ts
src/components/game/FunctionPanel.test.ts
src/math/WasmBridge.test.ts                JS-only parity (fallback surface + numerical invariants)
src/math/WasmBridge.wasm.test.ts           JS ↔ WASM parity under Node (requires math_engine.* built)
src/systems/__tests__/*.test.ts            BuffSystem, CombatSystem, EconomySystem,
                                           MovementSystem, TowerPlacementSystem, WaveSystem
```

Vitest is configured with `happy-dom` so systems can be tested without a real browser. The WASM-bridge test files split responsibilities: `WasmBridge.test.ts` pins the JS fallback's behaviour without loading the binary, and `WasmBridge.wasm.test.ts` loads the compiled module under Node to assert numerical parity (skipped if the WASM build is absent).

---

## Canvas Coordinate System

The game has its own coordinate system, separate from pixels:

```
Game unit (0, 0) = pixel (originX, originY) = pixel (640, 360)
1 game unit      = 24 pixels (unitPx)

Conversion:
  pixelX = originX + gameX * unitPx
  pixelY = originY - gameY * unitPx      ← Y axis inverted (game-Y up = pixel-Y down)
```

Grid bounds: X ∈ [-14, 14], Y ∈ [-14, 14]. Tower placement snaps to grid intersection points (not all cells — legal positions are pre-computed from path clearance). Canvas size, origin, unit, bounds, initial HP/gold and `hitRadius` all come from `shared/game-constants.json`.
