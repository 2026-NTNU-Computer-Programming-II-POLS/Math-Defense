# Frontend — Vue 3 + TypeScript

The frontend hosts both the Vue 3 UI layer and the entire game engine. It renders to an HTML5 Canvas and talks to the FastAPI backend for authentication, session persistence, leaderboards, classes, achievements, talents, territory activities, challenges, and study probes. Business logic lives in a pure-TypeScript engine; Vue only provides the reactive UI shell.

## Tech Stack

| | |
|---|---|
| Framework | Vue 3 (Composition API, `<script setup>`) |
| State | Pinia 3 |
| Router | Vue Router 5 |
| Build | Vite 8 |
| Language | TypeScript 6.0 (strict, `erasableSyntaxOnly`, `verbatimModuleSyntax`) |
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
│   │   ├── AboutView.vue           Project / accessibility statement page
│   │   ├── AuthView.vue            Login / register (email + player_name + role)
│   │   ├── LevelSelectView.vue     Star-rated difficulty picker (1–5 stars)
│   │   ├── InitialAnswerView.vue   Pre-game endpoint identification (Initial Answer)
│   │   ├── GameView.vue            Game container (canvas + HUD overlay)
│   │   ├── ScoreResultView.vue     Post-game score breakdown (S1/S2/K/TotalScore)
│   │   ├── LeaderboardView.vue     Score table
│   │   ├── ProfileView.vue         User profile + achievement/talent summary cards + endpoint-marker customization (star/gorilla/custom image upload, hit-FX picker)
│   │   ├── AchievementView.vue     Achievement gallery (5 categories, season multipliers)
│   │   ├── TalentTreeView.vue      Talent tree allocation UI (26 nodes, 7 tower types)
│   │   ├── ClassView.vue           Student: list/join classes; Teacher: create/manage classes
│   │   ├── AdminView.vue           Admin dashboards for teachers / classes / students / seasons
│   │   ├── TeacherDashboard.vue    Teacher overview of activity results + per-student competency posteriors
│   │   ├── TeacherTerritorySetup.vue  Create a Grabbing Territory activity
│   │   ├── TerritoryListView.vue   List of territory activities
│   │   ├── TerritoryDetailView.vue Territory map + slot status
│   │   ├── TerritoryResultView.vue Play / result screen for a territory slot
│   │   ├── RankingsView.vue        Territory or global rankings (4 ranking types)
│   │   ├── ChallengeBuilder.vue    Teacher-side authoring UI for generative challenges
│   │   ├── ChallengeView.vue       Player-side challenge runner (constraint preview + launch)
│   │   ├── ChallengeLeaderboardView.vue  Challenge-specific leaderboard
│   │   ├── ReplayView.vue          Deterministic replay player — re-feeds recorded events through `EventPlayer`
│   │   ├── SpectateView.vue        Live spectate via WebSocket (`SpectatorClient`)
│   │   ├── StudyProbeView.vue      Empirical-validity-probe quiz form (`?study_id=…&form=pre|post|delay`)
│   │   ├── AffectSurveyView.vue    Likert affect survey (`?study_id=…&phase=pre|post`)
│   │   └── study-helpers.ts        Shared helpers for study probe / affect views
│   │
│   ├── components/
│   │   ├── common/
│   │   │   ├── Modal.vue           Generic modal wrapper
│   │   │   ├── ManualModal.vue     In-game manual modal (renders markdown from `public/manual/`)
│   │   │   ├── ManualModal.css     Manual modal styles (extracted from .vue)
│   │   │   └── MathDisplay.vue     KaTeX renderer wrapper
│   │   ├── layout/
│   │   │   ├── AppShell.vue        Top-level app chrome (nav, header) wrapping router-view
│   │   │   └── GlobalBackground.vue Procedural background; suppressed via `meta.hideGlobalBg`
│   │   ├── game/
│   │   │   ├── HUD.vue             Two-row HUD: star rating, kill value, IA indicator,
│   │   │   │                       Monty Hall progress bar, spell bar, buff icons, prep timer
│   │   │   ├── TowerBar.vue        Tower selection bar
│   │   │   ├── StartWaveButton.vue Player-paced "Start Wave" control shown during BUILD
│   │   │   ├── GameSpeedPanel.vue  Runtime game-speed multiplier control (×0.5 / ×1 / ×2 / ×3)
│   │   │   ├── WaveForecast.vue    Build-phase preview of upcoming wave composition
│   │   │   ├── WaveBanner.vue      Wave start/end banner overlay
│   │   │   ├── PhaseFader.vue      Visual phase-transition fade overlay (reduced-motion aware)
│   │   │   ├── BuildPanel.vue      Thin wrapper — delegates to TowerInfoPanel
│   │   │   ├── TowerInfoPanel.vue  Unified stats + type-specific panel + upgrade button
│   │   │   ├── BuildHint.vue       First-time placement hints
│   │   │   ├── FirstEncounterCard.vue  First-encounter explanation card (driven by `useFirstEncounterCards`)
│   │   │   ├── ShopPanel.vue       In-BUILD shop for time-based buffs
│   │   │   ├── SpellBar.vue        Spell cooldown buttons (Exponential / Asymptote / Impulse / Acceleration)
│   │   │   ├── SpellIcon.vue       Single spell icon (cooldown ring + glyph)
│   │   │   ├── spell-icon-defs.ts  Spell glyph SVG path lookup used by `SpellIcon`
│   │   │   ├── MagicModePanel.vue  Magic tower: function curve selection
│   │   │   ├── RadarConfigPanel.vue Radar tower: arc start/end/restrict config
│   │   │   ├── MatrixPairPanel.vue  Matrix tower: pair selection
│   │   │   ├── LimitQuestionPanel.vue  Limit tower: multiple-choice lim question (branches on starRating)
│   │   │   ├── CalculusPanel.vue   Calculus tower: function picker + typed derivative/integral quiz
│   │   │   ├── ChainRulePanel.vue  Boss Type-B chain-rule challenge overlay (KaTeX)
│   │   │   ├── MontyHallPanel.vue  Monty Hall event overlay (doors, reveal, switch)
│   │   │   ├── TargetingModePanel.vue Per-tower targeting-mode picker (closest / strongest / first / last)
│   │   │   ├── AchievementToast.vue Toast for newly-unlocked achievements after session end
│   │   │   ├── PrincipleOverlay.vue Post-wave card surfacing the mathematical principle exercised by the player's last move
│   │   │   ├── BuffCardPanel.vue   (Legacy V1 — buff card draw overlay; superseded by ShopPanel)
│   │   │   ├── FunctionPanel.vue   (Legacy V1 — quadratic a/b/c input)
│   │   │   ├── MatrixInputPanel.vue (Legacy V1 — 2×2 matrix input)
│   │   │   └── IntegralPanel.vue   (Legacy V1 — [a,b] interval input)
│   │   ├── teacher/
│   │   │   └── CompetencyBar.vue   Beta-distribution bar for the teacher dashboard (mean ± uncertainty band)
│   │   ├── territory/
│   │   │   ├── TerritorySlotCard.vue       Slot card used in TerritoryDetailView
│   │   │   ├── DeadlineProgressBar.vue     Time-remaining bar for an activity
│   │   │   └── SlotChallengePreview.vue    Per-slot challenge-mode preview (constraints + recommendation)
│   │   └── leaderboard/
│   │       └── PersonalTimeline.vue        User's personal score progression timeline
│   │
│   ├── composables/
│   │   ├── useGameLoop.ts                Mount/unmount engine, inject systems, wire UI bridges, talent modifiers
│   │   ├── useEngineUiBridges.ts         Registers Vue ↔ engine event bridges used by `useGameLoop`
│   │   ├── useEngineAudio.ts             Routes engine events to SFX/music via `AssetManager`
│   │   ├── useUiAudio.ts                 Routes UI-store events (clicks, hovers) to the UI audio bus
│   │   ├── useSessionSync.ts             Bridge engine lifecycle ↔ backend session API (V2 payload, rng_seed)
│   │   ├── useStartRun.ts                Single entry point used by LevelSelect / Territory to start a run
│   │   ├── usePrincipleOverlay.ts        Drives `PrincipleOverlay` from gameplay events
│   │   ├── useFirstEncounterCards.ts     Tracks seen tower/enemy types; surfaces `FirstEncounterCard`
│   │   ├── useChallengePreviewPreference.ts  Persists user's challenge-preview UI preference
│   │   ├── useTerritoryRecommendation.ts Adaptive slot recommendation for territory activities
│   │   ├── useCountdown.ts               Generic countdown reactive helper (territory / activity deadlines)
│   │   ├── usePolling.ts                 Polling helper with backoff + cleanup
│   │   ├── useTokenProbe.ts              Probes auth-token freshness on resume / focus
│   │   ├── useCanvasPlot.ts              Canvas plotting helper for KaTeX-adjacent function previews
│   │   ├── useAuth.ts                    Reactive auth helpers (email-based; role checks)
│   │   ├── useLeaderboard.ts             Leaderboard fetch helpers
│   │   ├── useManual.ts                  Fetch + reactive state for the in-app Manual viewer
│   │   ├── useReducedMotion.ts           `prefers-reduced-motion` reactive flag (gates VFX / fades)
│   │   ├── useValuePop.ts                Brief scale/colour pop animation hook for numeric readouts
│   │   └── useKeyboardPlacement.ts       Arrow-key + Enter tower placement (WCAG 2.2 SC 2.1.1 — pointer-free)
│   │
│   ├── stores/                     Pinia stores (Vue reactivity layer)
│   │   ├── authStore.ts            token, user (email/player_name/role), initialising flag
│   │   ├── gameStore.ts            Mirror of engine state → drives HUD reactivity (V2 fields)
│   │   ├── talentStore.ts          Caches talent modifiers; exposes getTowerModifiers()
│   │   ├── territoryStore.ts       Territory activity state
│   │   └── uiStore.ts              Panel visibility, selected tower type, hint step, audio prefs
│   │
│   ├── services/                   Backend API clients
│   │   ├── api.ts                          fetch wrapper; auto-attaches Bearer token; ApiError
│   │   ├── authService.ts                  register(email, password, playerName, role) / login / me / logout / updatePlayerName / updateAvatar / updateEndpointMarker
│   │   ├── sessionService.ts               create / update / end / abandon / getActive (V2 fields, rng_seed, practice_mode)
│   │   ├── sessionLifecycleService.ts      High-level orchestration around session creation + end / score submit
│   │   ├── gameCommandService.ts           Server-authoritative game commands (when backend governs a run)
│   │   ├── levelGenerationService.ts       Fetches deterministic level definitions / decoys from the backend
│   │   ├── waveService.ts                  Wave-schedule fetch / regeneration helpers
│   │   ├── leaderboardService.ts           get, getForChallenge, getMyHistory (personal timeline)
│   │   ├── achievementService.ts           list, summary, unlockedIds (memoised), invalidateUnlockedIds
│   │   ├── seasonService.ts                list, listAdmin, create (admin)
│   │   ├── talentService.ts                getTree, getModifiers, allocate, reset
│   │   ├── classService.ts                 Class CRUD + roster/groups/co-teachers/invites/reflections (createClass, listClasses, joinByCode, … many helpers)
│   │   ├── adminService.ts                 getTeachers, getClasses, getStudents, createTeacher
│   │   ├── rankingService.ts               getGlobal, getByClass, getInternal, getExternal
│   │   ├── territoryService.ts             createActivity, listActivities, getActivity, playTerritory, getRankings, settleActivity
│   │   ├── territory/
│   │   │   ├── challengeMode.ts            Per-slot challenge-mode helpers
│   │   │   └── rankingSort.ts              Ranking sort + tiebreak helpers
│   │   ├── assessmentService.ts            classPosteriors(classId) — Beta posteriors for the teacher dashboard
│   │   ├── recommendationService.ts        me() — adaptive star + talent steer
│   │   ├── challengeService.ts             create / get / listMine / rename / updateConstraints / remove (generative challenges)
│   │   └── studyService.ts                 enroll(), submitProbe(), submitAffect()
│   │
│   ├── router/index.ts             Routes with RBAC guards (protected / admin / teacher / student sets)
│   │
│   ├── lib/
│   │   └── app-bus.ts              App-level event bus (cross-component non-engine signals, e.g. toasts)
│   │
│   ├── utils/
│   │   ├── formatters.ts           Centralised presentation formatters (formatScore, etc.)
│   │   ├── parseHistoryState.ts    Safely parse `history.state` payloads used by router guards
│   │   ├── manualSections.ts       Markdown → section tree transform consumed by `useManual`
│   │   ├── reducedMotion.ts        Static reduced-motion query helper used outside Vue setup scope
│   │   └── simpleMarkdown.ts       Minimal markdown → HTML renderer used by `ManualModal`
│   │
│   ├── engine/                     Core engine — pure TS, no Vue imports
│   │   ├── Game.ts                 Fixed-timestep loop orchestrator + GameEvents map + towerModifierProvider callback
│   │   ├── GameState.ts            Strongly typed V2 state container (see GameState section below)
│   │   ├── PhaseStateMachine.ts    FSM with transition validation table (V2 phases)
│   │   ├── EventBus.ts             Generic, type-safe pub/sub
│   │   ├── InputManager.ts         Canvas mouse → game-unit coord events
│   │   ├── Renderer.ts             Canvas-2D drawing primitives
│   │   ├── ShakeController.ts      Decaying screen-shake controller (driven by combat/death events; reduced-motion aware)
│   │   ├── register-systems.ts     Single place that constructs + registers every engine system
│   │   ├── level-context.ts        Per-level runtime context (curve path, movement strategy, tile style)
│   │   ├── generated-level-context.ts  Per-level runtime context for procedurally generated curves
│   │   ├── event-handlers/
│   │   │   ├── registry.ts         EVENT_HANDLER_REGISTRY — index of every EventBus subscription
│   │   │   └── index.ts            Wires handlers from the registry at engine boot
│   │   ├── projections/            Pure functions producing render-ready view models from engine state
│   │   │   ├── views.ts            Shared view-model types
│   │   │   ├── project-enemies.ts
│   │   │   ├── project-towers.ts
│   │   │   ├── project-pets.ts
│   │   │   ├── project-magic-zones.ts
│   │   │   ├── project-matrix-lasers.ts
│   │   │   └── project-path-panel.ts   Path-panel viewport projection (world → screen pixels)
│   │   ├── render-helpers/
│   │   │   ├── tile-style.ts           Tile-appearance lookup shared by grid + placement preview
│   │   │   └── clip-to-board.ts        Canvas-clip helper that masks effects to the play-grid rect
│   │   ├── audio/                  HTMLAudioElement-based SFX layer
│   │   │   ├── AssetManager.ts     Lazy-loaded clips, bus mix (music / sfx / ui), polyphony cap, jitter, crossfade
│   │   │   └── sfx-defs.ts         SFX slug → URL + bus + mix params (see frontend/public/audio/)
│   │   └── replay/                 Deterministic recording + playback + spectate
│   │       ├── EventRecorder.ts    Captures curated player-decision events (excludes simulation output) with batched flush
│   │       ├── EventPlayer.ts      Re-feeds the recorded stream against a fresh engine seeded from `rng_seed`
│   │       └── SpectatorClient.ts  WebSocket client for `/api/sessions/{id}/spectate` live fan-out
│   │
│   ├── domain/                     Domain policies (shared across systems)
│   │   ├── combat/
│   │   │   ├── SplitPolicy.ts          Single source for Split enemy split rules
│   │   │   └── RadarTargeting.ts       Shared Radar targeting-mode selection (closest/strongest/first/last)
│   │   ├── level/
│   │   │   ├── level-generator.ts      Reverse-endpoint curve generation algorithm
│   │   │   ├── decoy-generator.ts      Decoy curve generation for Initial Answer screen
│   │   │   ├── level-layout-service.ts Builds SegmentedPath + placement rules for a level definition
│   │   │   ├── placement-policy.ts     Grid-cell → can-place decision shared by preview and click handler
│   │   │   └── checkpoint.ts           Star-5 retry-from-checkpoint serialization (gold/HP/costTotal/killValue)
│   │   ├── movement/               Curve-path and piecewise-path movement strategies
│   │   │   ├── movement-strategy.ts
│   │   │   ├── movement-strategy-registry.ts
│   │   │   ├── arc-length.ts
│   │   │   ├── vertical-movement-strategy.ts
│   │   │   └── x-driven-movement-strategy.ts
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
│   │   ├── study/
│   │   │   └── probe-items.ts            Item pool for the Empirical Validity Probe forms (pre/post/delay) + affect items
│   │   └── wave/
│   │       ├── wave-generator.ts         buildWavesForStar + WaveDef/EnemySpawnEntry types
│   │       └── wave-templates.ts         Composable wave-content templates
│   │
│   ├── systems/                    ECS systems — pure update logic
│   │   ├── TowerPlacementSystem.ts    Click-to-place, grid snap, legal-position check, talent modifiers
│   │   ├── TowerUpgradeSystem.ts      Handles TOWER_UPGRADE and TOWER_REFUND events
│   │   ├── TowerInterferenceSystem.ts Cross-tower interference (e.g. Counter enemy aura, WAVE_START audit)
│   │   ├── CombatSystem.ts            Projectile physics + DoT ticking; shield absorption
│   │   ├── EnemyAbilitySystem.ts      Helper aura tick, boss minion spawning, chain-rule trigger, boss-death split
│   │   ├── MagicTowerSystem.ts        Function zone effects (debuff enemies / buff towers)
│   │   ├── RadarTowerSystem.ts        Continuous sweep AoE + single-target projectiles
│   │   ├── MatrixTowerSystem.ts       Paired towers + dot-product damage + laser lock-on
│   │   ├── LimitTowerSystem.ts        Multiple-choice limit question + range-based attack
│   │   ├── CalculusTowerSystem.ts     Derivative/integral picker + pet spawning
│   │   ├── PetCombatSystem.ts         Pet projectile homing movement, collision damage, expiry pruning
│   │   ├── MovementSystem.ts          Path movement with arc-length correction
│   │   ├── WaveSystem.ts              Enemy spawn queue driven by domain/wave/wave-generator
│   │   ├── BuffSystem.ts              Time-based buff/curse strategy map; applyExternalBuff() public API
│   │   ├── SpellSystem.ts             4 spells (Exponential/Asymptote/Impulse/Acceleration) + cooldown mgmt
│   │   ├── MontyHallSystem.ts         Kill-value threshold triggers; door reveal + switch logic; reward injection
│   │   ├── EconomySystem.ts           Gold on kill (×goldMultiplier), HP on origin reach, wave bonuses
│   │   ├── EndpointFXSystem.ts        Transient hit FX on the endpoint marker (P*) when an enemy breaches — fragments/crying/angry burst (driven by uiStore endpoint-marker prefs; replay-safe via game.rng)
│   │   └── __tests__/                 Vitest unit tests
│   │
│   ├── renderers/                  Draw entities to canvas (read-only state / projection input)
│   │   ├── effects/EffectLayer.ts    Base class for transient-effect render systems (spawn/age/prune); extended by EndpointFXSystem
│   │   ├── primitives.ts             Shared canvas primitives (text badges, bars, rings)
│   │   ├── EnemyRenderer.ts          HP bar, shield bar (blue), helper aura circle, glyph-body sprites
│   │   ├── TowerRenderer.ts          Math-instrument tower sprites (re-skinned in Visual Redesign)
│   │   ├── TowerLifecycleRenderer.ts Tower place / upgrade / refund VFX bursts
│   │   ├── ProjectileRenderer.ts
│   │   ├── ImpactEffectRenderer.ts   Projectile impact spark/ring VFX
│   │   ├── DeathParticleRenderer.ts  Enemy-death particle bursts (reduced-motion gated)
│   │   ├── MagicZoneRenderer.ts      Function curve zone overlay
│   │   ├── RadarRangeRenderer.ts     Arc + sweep visualisation
│   │   ├── MatrixLaserRenderer.ts    Laser beam between matrix pair
│   │   ├── PetRenderer.ts            Pet projectile sprites (cyan-fringe re-skin)
│   │   ├── LimitBurstRenderer.ts     Limit tower outcome burst (±∞ / ±C / 0 variants)
│   │   ├── SpellEffectRenderer.ts    Expanding circle VFX for spells (gold-fringe spell glyphs)
│   │   └── CombatFeedbackRenderer.ts Floating damage/heal numbers + hit flashes
│   │
│   ├── entities/
│   │   ├── types.ts                Tower, Enemy, Projectile, Pet, TowerPreview interfaces (V2 fields)
│   │   ├── TowerFactory.ts         Build towers from tower-defs; accepts optional talent modifiers
│   │   ├── tower-stats.ts          Derived stat calculations (tier scaling, talent application)
│   │   ├── EnemyFactory.ts         Build enemies from enemy-defs (V2: split/helper/boss config)
│   │   └── PetFactory.ts           Build Pet projectile entities for the Calculus tower
│   │
│   ├── math/
│   │   ├── WasmBridge.ts           initWasm, RAII float buffers, JS fallbacks
│   │   ├── wasm-exports.d.ts       Ambient type decl for the generated math_engine module
│   │   ├── MathUtils.ts            Coordinate conversion, findIntersections, sector test
│   │   ├── RandomUtils.ts          hashStr / mulberry32 — single source used by 4 consumers
│   │   ├── seededRandom.ts         Seeded PRNG wrapper used by deterministic content generation
│   │   ├── rational.ts             Exact rational arithmetic (used by Limit / Calculus question generation)
│   │   ├── monomial.ts             Monomial algebra helpers (factoring, simplification)
│   │   ├── curve-types.ts          CurveDefinition union (polynomial/trig/log), coefficient bounds
│   │   ├── curve-evaluator.ts      evaluate / derivative / isInDomain / curveToLatex (5 families)
│   │   ├── curve-renderer.ts       Accepts CoordTransform callback (no canvas import)
│   │   ├── intersection-solver.ts  Pair/all-curves intersection finding with domain-safe evaluation
│   │   ├── limit-evaluator.ts      Limit question generation with exhaustive outcome handling
│   │   ├── chain-rule-generator.ts Chain rule question generation (pure, no game imports)
│   │   ├── expressionParser.ts     Parser for user-entered math expressions (Calculus / function input)
│   │   └── wasm/                   Compiled WASM assets (generated — do not edit)
│   │       ├── math_engine.js
│   │       ├── math_engine.wasm
│   │       └── math_engine.d.ts
│   │
│   ├── data/                       Static definitions — no functions
│   │   ├── constants.ts            GamePhase / TowerType / EnemyType / Events (`as const`)
│   │   ├── tower-defs.ts           Cost, damage, range, math concept, V2 params (7 tower types) + glyph + examRelevance
│   │   ├── enemy-defs.ts           HP, speed, reward, split/helper/boss config + triggerHpRange (10 enemy types)
│   │   ├── counter-enemy-info.ts   Counter-enemy UI metadata used by panels + first-encounter cards
│   │   ├── difficulty-defs.ts      DIFFICULTY_TABLE, MultisetEntry, pickRandomMultiset
│   │   ├── buff-defs.ts            Time-based buff/curse IDs, labels, effect strategies (30+ effects)
│   │   ├── spell-defs.ts           4 spell definitions (Exponential/Asymptote/Impulse/Acceleration)
│   │   ├── monty-hall-defs.ts      Kill-value thresholds per star rating; door reward pool
│   │   ├── achievement-defs.ts     Achievement definitions (5 categories) — lint-tested against trait-praise vocabulary
│   │   ├── talent-defs.ts          26 talent node definitions (19 base + 7 tier-2 advanced, prereq chains across 7 tower types)
│   │   ├── principle-defs.ts       7 mathematical-principle definitions surfaced by `PrincipleOverlay` after the matching gameplay moment
│   │   ├── path-segment-types.ts   Piecewise path segment type constants
│   │   └── ui-defs.ts              Panel layout, colour palette
│   │
│   └── styles/global.css
│
├── public/
│   ├── audio/                      WAV assets — procedurally synthesised by `scripts/synth-audio.py`
│   ├── avatars/                    SVG avatars (alchemist / archer / knight / mage / scholar / wizard)
│   ├── manual/                     In-game manual markdown (`game-mechanics.md`, `towers-and-enemies.md`)
│   ├── logo.png                    Math Defense brand mark — used as favicon + MenuView/AuthView hero
│   ├── logo-V1.png                 Legacy V1 brand mark (kept for migration references)
│   └── icons.svg
│
├── scripts/                        Repo tooling (run via `npm run …`)
│   ├── arch-check.ts                 Forbids forbidden cross-layer imports (Vue → engine, etc.)
│   ├── event-registry-check.ts       Verifies every emitted event has a registered handler
│   ├── lint-chinese-comments.ts      Fails the build if any source file contains Chinese comments
│   ├── lint-determinism.ts           Static checks for non-deterministic primitives in engine code
│   ├── no-raw-px.ts                  Fails the build on raw `font-size: NNpx` outside the `html` root anchor
│   ├── verify-wasm.ts                Verifies the WASM binary loads + matches the JS-fallback parity surface
│   └── synth-audio.py                Regenerates `public/audio/*.wav` from a CC0/synth recipe
│
├── dev/                            Dev-only benches (excluded from prod test run)
│   ├── bench-level-gen.bench.ts
│   └── vitest.bench.config.ts
│
├── package.json
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
└── vite.config.ts
```

---

## Game Engine

### Overview

The engine is **ECS-inspired**: entities (towers, enemies, projectiles, pets) are plain data; systems contain all update and render logic. The main loop runs a fixed-timestep 60 FPS accumulator. The engine is pure TypeScript — it has no Vue imports and is independently testable. Every system is constructed and registered through `engine/register-systems.ts` so the wiring lives in a single file.

```
Game.start()
  └─ requestAnimationFrame loop
       ├─ accumulate frame time (clamped to 0.1 s to avoid spiral-of-death)
       └─ while accumulator >= FIXED_DT (1/60 s):
            ├─ for each system: system.update(dt, game)
            │     placement → combat → movement → wave → buff → economy → …
            └─ accumulator -= FIXED_DT
       └─ render pass:
            renderer.clear() → drawGrid → drawFunction (path)
            for each system: system.render?.(renderer, game)
              EnemyRenderer → TowerRenderer → ProjectileRenderer → PetRenderer
              MagicZoneRenderer → RadarRangeRenderer → MatrixLaserRenderer
              SpellEffectRenderer → CombatFeedbackRenderer
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
  pausePhaseStart: number           // MONTY_HALL / CHAIN_RULE pause start (excluded from score time)
  perceivedSpeedMultiplier: number  // wall-clock pacing only; score time advances at 1×

  // V2 Initial Answer
  initialAnswer: 0 | 1
  pathsVisible: boolean

  // V2 Monty Hall
  montyHallNextIndex: number
  montyHallPending: boolean

  // Buff flags
  shieldActive: boolean
  shieldHitsRemaining: number
  shieldReductionFactor: number  // per-hit multiplier while shield absorbs (1 = inactive)
  goldMultiplier: number       // derived = 1 + goldMultiplierBonus (consumers read this)
  goldMultiplierBonus: number  // additive accumulator owned by BuffSystem (Q15)
  freeTowerNext: boolean
  freeTowerCharges: number
  enemySpeedMultiplier: number
  enemyVulnerability: number
  towerDamageBonus: number     // additive tower-buff accumulators; effective = 1 + bonus
  towerRangeBonus: number
  towerSpeedBonus: number

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
  WAVE          → MONTY_HALL | BUILD | LEVEL_END | GAME_OVER | CHAIN_RULE
  MONTY_HALL    → BUILD | GAME_OVER
  CHAIN_RULE    → WAVE | GAME_OVER
  LEVEL_END     → LEVEL_SELECT | MENU | BUILD
  GAME_OVER     → MENU | LEVEL_SELECT | BUILD
```

### `EventBus.ts`

Type-safe generic pub/sub. All event names and payload shapes live in the `GameEvents` interface in `Game.ts`. Every subscription returns an `unsubscribe()` function; `useGameLoop` collects these and calls them all on unmount. Every event must be registered in `engine/event-handlers/registry.ts` — `npm run event-registry-check` fails the build otherwise.

Events include: `PHASE_CHANGED`, `LEVEL_START/END`, `GAME_OVER`, `BUILD_PHASE_START/END`, `WAVE_START/END`, `TOWER_PLACED/SELECTED/PARAMS_SET/UPGRADE/REFUND`, `CAST_SPELL`, `TOWER_ATTACK`, `ENEMY_SPAWNED/KILLED/REACHED_ORIGIN`, `BUFF_PHASE_START/END`, `BUFF_CARD_SELECTED`, `BUFF_RESULT`, `BOSS_SHIELD_START/ATTEMPT/END`, `CHAIN_RULE_START/ANSWER/END`, `MONTY_HALL_TRIGGER/DOOR_SELECTED/SWITCH_DECISION/RESULT`, `GOLD_CHANGED`, `HP_CHANGED`, `SCORE_CHANGED`, `CANVAS_CLICK/HOVER`.

---

## Game Systems

| System | Responsibility |
|---|---|
| `TowerPlacementSystem` | Handles `CANVAS_CLICK` during `BUILD`; validates legal grid positions + gold; creates tower via `TowerFactory` with talent modifiers; emits `TOWER_PLACED` |
| `TowerUpgradeSystem` | Handles `TOWER_UPGRADE` (increments tier, adjusts stats) and `TOWER_REFUND` events |
| `TowerInterferenceSystem` | Cross-tower interference effects — re-evaluates affected towers on `WAVE_START`, applies Counter-enemy disruption auras, etc. |
| `CombatSystem` | Projectile physics + DoT ticking; shield HP absorption (shield bar drawn by EnemyRenderer) |
| `EnemyAbilitySystem` | Helper aura tick, boss minion spawning, chain-rule trigger/answer, boss-death split via `ENEMY_KILLED` listener |
| `MagicTowerSystem` | Function curve zone: debuffs enemies inside, buffs nearby towers; `getTowerCurve()` public API used by renderer |
| `RadarTowerSystem` | Continuous AoE sweep (Radar A) + fast single-target (Radar B) + slow powerful (Radar C) |
| `MatrixTowerSystem` | Paired towers via `matrixPairId`; continuous laser with dot-product damage |
| `LimitTowerSystem` | Presents lim question; resolves ±∞/±C/0 outcome; applies range effect |
| `CalculusTowerSystem` | Derivative/integral picker; spawns Pet entities managed by `PetCombatSystem` |
| `PetCombatSystem` | Homing movement for Pet projectiles toward nearest enemy; applies damage on contact; prunes expired or out-of-range pets |
| `SpellSystem` | Exponential (AoE), Asymptote (slow), Impulse (single), Acceleration (tower-speed buff); cooldown per spell |
| `MontyHallSystem` | Kill-value thresholds per star rating; door reveal logic; injects rewards via `BuffSystem.applyExternalBuff()` |
| `MovementSystem` | Advances enemies along CurvePath/SegmentedPath via matching strategy; reads `speedBoost` + `enemySpeedMultiplier` |
| `WaveSystem` | Reads wave schedule; spawns via `EnemyFactory`; detects clear, emits `WAVE_END` |
| `BuffSystem` | Time-based active buffs; 30+ effect strategies; `applyExternalBuff()` for SpellSystem + MontyHallSystem |
| `EconomySystem` | Gold on `ENEMY_KILLED` (`killValue × goldMultiplier`); HP damage on `ENEMY_REACHED_ORIGIN`; wave completion bonus |
| `EndpointFXSystem` | On `ENEMY_REACHED_ORIGIN`, spawns a transient burst on the endpoint marker (P*): `fragments` (default) / `crying` / `angry`. Style read from `game.endpointFx` (set from `uiStore.endpointHitFx`); `random` resolves via `game.rng` so replays reproduce the same FX. Suppressed when the marker is hidden (`pathsVisible === false`) |

There are **18 update systems** in `src/systems/` (the 17 above plus
`EndpointFXSystem`); all are constructed and ordered in
`engine/register-systems.ts`, which also registers the canvas renderers
alongside them.

---

## Vue ↔ Engine Bridge

The engine knows nothing about Vue. `useGameLoop.ts` is the only bridge:

```
onMounted:
  await initWasm()
  g = new Game(canvas)
  registerSystems(g)                                      // engine/register-systems.ts
  g.towerModifierProvider = (towerType) => talentStore.getTowerModifiers(towerType)   // Pinia → engine
  useEngineUiBridges(g)        // TOWER_PLACED → BuildPanel, TOWER_SELECTED, BuildHint, principle overlay
  useEngineAudio(g)            // engine events → AssetManager (sfx + music bus)
  useSessionSync().bind(g)     → backend session lifecycle
  gameStore.bindEngine(g)      → reactive state mirror
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
| `user` | `{ id, email, player_name, role, avatar_url, ia_unlock_earned, ia_recent_accuracy }` (snake_case, mapped from `/auth/me`) or `null` |
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
| `perceivedSpeedMultiplier` | Mirror of the runtime game-speed selection (×0.5/×1/×2/×3) |
| `leadEnemyX` | Lead-enemy X coordinate fed each frame by `MovementSystem` (drives the path panel) |

Computed: `isBuilding`, `isWave`, `isBuff`, `isMontyHall`, `hpPercent`.

### `talentStore`

Caches the per-tower attribute modifiers fetched from the backend (`load()` → `talentService.getModifiers()`), stored as `modifiers: Record<TowerType, Record<attribute, number>>`. Exposes `getTowerModifiers(towerType)` (the attribute map for one tower type) and `getStatBonus(towerType, attribute)` plus `loaded` / `clear`. `useGameLoop` wires `game.towerModifierProvider = (towerType) => talentStore.getTowerModifiers(towerType)` so the engine reads talent bonuses without importing Pinia. Cleared on `auth:logout`.

### `territoryStore`

Territory activity list and current activity detail for the Territory views.

### `uiStore`

Panel visibility, selected tower type, build-hint step, modal state, and audio preferences (master / music / sfx / ui volume + mutes) consumed by `useUiAudio` and `AssetManager`.

Also owns the **endpoint-marker** preferences (persisted to `localStorage` and synced server-side):

- `endpointMarkerStyle: 'star' | 'gorilla' | 'custom'` — the glyph drawn at the curves' common intersection (P*); default `'star'`.
- `endpointMarkerCustomDataUrl: string | null` — resized data-URL for the `'custom'` style.
- `endpointHitFx: 'random' | 'fragments' | 'crying' | 'angry'` — burst played when an enemy breaches the marker; default `'fragments'`.

`applyServerEndpointMarker()` hydrates these from `/auth/me`; `ProfileView` exposes the picker + custom-image upload and pushes changes via `authService.updateEndpointMarker` (`PUT /api/auth/profile/endpoint-marker`). `useGameLoop` copies the resolved values onto `game.endpointMarker` / `game.endpointFx` so the renderer and `EndpointFXSystem` honour them.

---

## Services

| Service | Methods |
|---|---|
| `api.ts` | `request<T>(path, opts)` — fetch wrapper with auto Bearer token + `ApiError` class |
| `authService.ts` | `register(email, password, playerName, role='student')`, `login(email, password)`, `me()`, `logout()`, `updatePlayerName`, `updateAvatar`, `updateEndpointMarker(payload)` |
| `sessionService.ts` | `create(...)`, `getActive()`, `update(id, patch)`, `end(id, result)`, `abandon(id)`, `submitReflection(id, text)`, `appendReplayEvents(...)`, `getReplay(id)` |
| `sessionLifecycleService.ts` | High-level orchestration: open a session, attach engine, submit the final score in one flow |
| `gameCommandService.ts` | Issues server-authoritative game commands (used when the backend governs a run) |
| `levelGenerationService.ts` | Fetches deterministic level definitions / decoy curves from the backend |
| `waveService.ts` | Wave-schedule fetch and regeneration helpers |
| `leaderboardService.ts` | `get(level?, page, perPage)`, `getForChallenge(challengeId, page, perPage)`, `getMyHistory(level?)` (personal-best timeline). Scores are submitted through the session-end flow, not here |
| `achievementService.ts` | `list()`, `summary()`, `unlockedIds()` (memoised set), `invalidateUnlockedIds()` |
| `talentService.ts` | `getTree()`, `getModifiers()`, `allocate(nodeId)`, `reset()` |
| `classService.ts` | Full class CRUD + roster + organisation: `createClass`, `listClasses`, `getClass`, `renameClass`, `updateClass`, `deleteClass`, `archiveClass` / `unarchiveClass`, `transferOwnership`, `addStudent` / `bulkAddStudents` / `removeStudent` / `moveStudent`, `listStudents`, `joinByCode`, `claimInvites`, `regenerateCode`, `joinQr`, co-teacher + invite + group + reflection + leaderboard/report helpers |
| `adminService.ts` | `getTeachers()`, `getClasses()`, `getStudents()`, `createTeacher(payload)` |
| `rankingService.ts` | `getGlobal(page, perPage)`, `getByClass(classId, …)`, `getInternal(activityId)`, `getExternal(activityId)` |
| `territoryService.ts` | `createActivity(payload)`, `listActivities(classId?)`, `getActivity(id)`, `playTerritory(activityId, slotId, sessionId)`, `getRankings(activityId)`, `settleActivity(activityId)` |
| `territory/challengeMode.ts` | Per-slot challenge-mode constraint helpers |
| `territory/rankingSort.ts` | Ranking sort + tiebreak helpers |
| `assessmentService.ts` | `classPosteriors(classId)` — Beta posteriors per student/competency for the teacher dashboard |
| `recommendationService.ts` | `me()` — adaptive star-rating + suggested talent node |
| `seasonService.ts` | `list()`, `listAdmin()`, `create(req)` (admin) |
| `challengeService.ts` | `create(payload)`, `get(id)`, `listMine()`, `rename(id, title, description)`, `updateConstraints(id, constraints)`, `remove(id)` |
| `studyService.ts` | `enroll(studyId)`, `submitProbe(studyId, form, responses)`, `submitAffect(studyId, phase, anxietyItems, motivationItems)` |

---

## WASM Integration

`WasmBridge.ts` handles loading and exposes a unified public surface:

```typescript
// ── Lifecycle ──
await initWasm(urlOverride?)             // loads math_engine.js; returns false if unavailable
await whenWasmReady()                    // await readiness without triggering a load
isWasmReady()                            // synchronous readiness check
isUsingWasm()                            // true if WASM is the active backend
setUseWasm(use)                          // force JS fallback (used by parity tests)

// ── Tower math ──
matrixMultiply(a, b)                     // 2×2 × 2×2 matrix multiply (Matrix tower)
sectorCoverage(radius, angleWidth)       // 0.5·r²·θ sector area (Radar A)
pointInSector(px, py, cx, cy, r, aStart, aWidth)  // hit-test (Radar A/B/C)
numericalIntegrate(a, b, c, lo, hi, n?) // trapezoid ∫(ax²+bx+c)dx (Calculus tower)

// ── Scoring ──
powerF64(base, exp)                      // bit-deterministic pow via musl; used by score-calculator.ts
computeTotalScoreWasm(killValue, timeTotal, prepSum, costTotal,
                      healthOrigin, healthFinal, initialAnswer)  // V2 score formula (FU-A parity)

// ── PRNG (PCG XSL-RR 64/32, replay v2) ──
createPrng(seed, stream?)                // allocates a PrngHandle (WasmPrngHandle or JsPrngHandle)
prngNextU32(handle)                      // next uint32
prngNextF64(handle)                      // next [0,1) double (53-bit mantissa)
handle.dispose()                         // free WASM heap slot

// ── Curve evaluator ──
evaluateCurve(curve, x)                  // curve_evaluate (poly/trig/log)
evaluateCurveDerivative(curve, x)        // curve_derivative
isCurveInDomain(curve, x)               // curve_in_domain (log domain guard)

// ── Intersection solver / spawn calculator ──
findPairIntersectionsWasm(c1, c2, xMin, xMax, step?)      // sign-change scan + bisection
findAllCurvesCommonPointWasm(curves, xMin, xMax, step?)   // N-curve common points → {x,y}[]
countCommonIntersectionsInIntervalWasm(curves, xMin, xMax) // cardinality only
computeSpawnPointsWasm(curves, endpoint)                  // boundary spawn points → BridgeSpawnPoint[]

// ── Level generator ──
generateLevelDeterministic(starRating, prngHandle, multiset)  // full rejection-sampling loop → BridgeGeneratedLevel | null
```

**RAII memory management** — `withFloatBuffers<T>(sizes, cb)` allocates via `_malloc`, runs the callback, and `_free`s in a `finally` block.

**Pure-JS fallback** — every function has a TypeScript implementation used when WASM fails to load. Bridge-level tests assert parity between the two backends.

---

## Routing

| Path | Component | Guard |
|---|---|---|
| `/` | `MenuView` | — |
| `/auth` | `AuthView` | — |
| `/level-select` | `LevelSelectView` | Requires auth |
| `/initial-answer` | `InitialAnswerView` | Requires auth |
| `/game` | `GameView` | Requires auth; `beforeEnter` rejects entry without a parsed `history.state.level` payload |
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
| `/admin/seasons` | `AdminView` | Requires admin — manage achievement-multiplier windows |
| `/about` | `AboutView` | — — accessibility statement and project info |
| `/teacher/challenges` | `ChallengeBuilder` | Requires teacher |
| `/challenge/:id` | `ChallengeView` | Requires auth |
| `/challenge/:id/leaderboard` | `ChallengeLeaderboardView` | Requires auth |
| `/replay/:sessionId` | `ReplayView` | Requires auth |
| `/spectate/:sessionId` | `SpectateView` | Requires auth |
| `/study/probe` | `StudyProbeView` | Requires auth — `?study_id=…&form=pre\|post\|delay` |
| `/study/affect` | `AffectSurveyView` | Requires auth — `?study_id=…&phase=pre\|post` |

---

## Setup & Development

```bash
cd frontend
npm install
npm run dev          # Vite dev server at http://localhost:5173 (proxies /api → VITE_API_TARGET, default http://localhost:8000)
npm run build        # prebuild → `cd ../wasm && make`; then vue-tsc -b + vite build
npm run preview      # Preview the production build
npm test             # arch-check + event-registry-check + Vitest (default test command)
npm run test:watch   # Vitest in watch mode
npm run ci           # arch-check + event-registry-check + lint-chinese-comments + lint-determinism + no-raw-px + Vitest
npm run bench        # Run Vitest benchmarks under dev/vitest.bench.config.ts
npm run verify-wasm  # Verifies the WASM binary loads and matches the JS-fallback parity surface
```

Type-check only (no emit): `npx vue-tsc -b` (there is no dedicated `npm run typecheck` script).

There is also no `npm run lint` script — repo-wide lints are split across
`arch-check`, `event-registry-check`, `lint-chinese-comments`,
`lint-determinism`, and `no-raw-px` (all bundled under `npm run ci`).

### Backend wiring

`vite.config.ts` proxies `/api` to `process.env.VITE_API_TARGET ?? 'http://localhost:8000'`.
For local non-Docker development, run `backend/app/main.py` (FastAPI/uvicorn) on
`:8000` and the default works. Under `docker-compose.yml`, the `frontend`
service sets `VITE_API_TARGET=http://backend:8000` so the dev container reaches
the backend on the compose network instead of `localhost`. Both backend and
frontend dev ports are bound to `127.0.0.1` only in compose.

### Repo lints / guards (`scripts/`)

| Script | Run via | Purpose |
|---|---|---|
| `arch-check.ts` | `npm run arch-check` | Forbids cross-layer imports (Vue → engine, engine → Vue/Pinia, etc.) |
| `event-registry-check.ts` | `npm run event-registry-check` | Verifies every emitted EventBus event is registered in `engine/event-handlers/registry.ts` |
| `lint-chinese-comments.ts` | `npm run lint-chinese-comments` | Fails the build if any source file contains Chinese characters in comments |
| `lint-determinism.ts` | `npm run lint-determinism` | Static checks for non-deterministic primitives (`Math.random`, `Date.now`) inside engine code |
| `no-raw-px.ts` | `npm run no-raw-px` | Fails the build on raw `font-size: NNpx` declarations outside the allowlisted `html` root anchor (forces the `--text-*` rem token scale) |
| `verify-wasm.ts` | `npm run verify-wasm` | Loads the compiled WASM binary and verifies it boots + matches the JS-fallback parity surface |
| `synth-audio.py` | `python scripts/synth-audio.py` | Regenerates `public/audio/*.wav` from a deterministic CC0/synth recipe |

### TypeScript project settings of note

- `erasableSyntaxOnly: true` — no `enum`; use `as const` + type alias.
- `verbatimModuleSyntax: true` — type-only imports must use `import type`.
- `noUnusedLocals` / `noUnusedParameters: true` — prefix intentionally unused params with `_`.
- Path aliases: `@/*` → `src/*`; `@shared/*` → `../shared/*`.

---

## Testing

Vitest is configured with `happy-dom` so systems can be tested without a real browser. The codebase currently ships **87 `*.test.ts` files** under `frontend/src/` (plus one `*.bench.ts` under `dev/`, excluded from the prod run) spanning engine units, system behaviour, projections, renderers, view components, composables, scoring parity, and a CounterEnemy end-to-end scenario. Notable groupings:

- **Engine units** — `EventBus`, `Game`, `PhaseStateMachine`, `Renderer`, `level-context`, `generated-level-context`, `engine/audio/AssetManager`, `engine/projections/{project-path-panel, project-enemies, project-towers}`, `engine/render-helpers/tile-style`, `engine/__tests__/determinism` (replay reproducibility from `rng_seed`).
- **Domain** — `domain/combat/{SplitPolicy, RadarTargeting}`, `domain/level/{level-generator, level-layout-service, placement-policy, checkpoint}`, `domain/movement/{vertical, x-driven}-movement-strategy`, `domain/path/{path-builder, path-progress-tracker, path-validator, segmented-path}`, `domain/scoring/score-calculator.parity` (frontend ↔ backend formula parity), `domain/wave/wave-generator`.
- **Systems** (`systems/__tests__/`) — `BuffSystem` + `BuffSystem.duration` + `BuffSystem.effects`, `CalculusTowerSystem`, `CombatSystem`, `CounterEnemy.e2e`, `EconomySystem`, `EnemyAbilitySystem`, `EndpointFXSystem`, `LimitTowerSystem`, `MagicTowerSystem`, `MatrixTowerSystem`, `MontyHallSystem`, `MovementSystem`, `PetCombatSystem`, `RadarTowerSystem`, `TowerInterferenceSystem`, `TowerPlacementSystem`, `TowerUpgradeSystem`, `WaveSystem`.
- **Components / views / composables** — `views/{GameView, InitialAnswerView, LevelSelectView}`, `components/game/{FunctionPanel, LimitQuestionPanel, RadarConfigPanel, CalculusPanel, PrincipleOverlay, WaveForecast}`, `stores/uiStore`, `composables/{useSessionSync, useKeyboardPlacement, useFirstEncounterCards, principle-defs}`.
- **Data / lints** — `data/tower-defs`, `data/achievement-defs` (bans trait-praise vocabulary; requires verb-led descriptions), `entities/{EnemyFactory, TowerFactory, tower-stats, PetFactory}`, `math/{rational, monomial, limit-evaluator, curve-evaluator, curve-renderer}`.
- **WASM parity** — `WasmBridge.test.ts` pins the JS fallback surface; `WasmBridge.curve.test.ts` / `WasmBridge.prng.test.ts` cover JS-only parity for curve and PRNG subsystems; `WasmBridge.wasm.test.ts` and the four `*.wasm.test.ts` siblings (`curve`, `prng`, `intersect`, `spawn`, `levelgen`) load the compiled binary under Node and assert bit-level parity for each subsystem (skipped if the WASM build is absent).
- **Renderers** — `renderers/{CombatFeedbackRenderer, LimitBurstRenderer, PetRenderer, SpellEffectRenderer, TowerRenderer, EnemyRenderer, glyph-fallback-safety}` cover floating-number / hit-flash output, burst variants, glyph-body sprites, and font-fallback safety.

---

## Canvas Coordinate System

The game has its own coordinate system, separate from pixels:

```
Game unit (0, 0) = pixel (originX, originY) = pixel (640, 374)
1 game unit      = 20 pixels (unitPx)

Conversion:
  pixelX = originX + gameX * unitPx
  pixelY = originY - gameY * unitPx      ← Y axis inverted (game-Y up = pixel-Y down)
```

Grid bounds: X ∈ [-14, 14], Y ∈ [-14, 14]. Tower placement snaps to grid intersection points (not all cells — legal positions are pre-computed from path clearance). Canvas size, origin, unit, bounds, initial HP/gold and `hitRadius` all come from `shared/game-constants.json`.

---

## Audio Assets

`frontend/public/audio/` contains WAV clips loaded on-demand by `engine/audio/AssetManager`. Every file is procedurally synthesised by `scripts/synth-audio.py`, so the repo carries no third-party audio licence. `AssetManager` enforces three mix buses (`music` / `sfx` / `ui`) backed by the four sliders in `uiStore` (master + per-bus), defers initial `play()` until after the first user gesture (autoplay policy), supports per-slug polyphony caps, pitch / volume jitter, and crossfades between the BUILD and WAVE music beds.

| File | Bus | Trigger |
|---|---|---|
| `ambient-build.wav` | music | Looped bed during BUILD phase |
| `ambient-wave.wav` | music | Looped bed during WAVE phase (crossfades with `ambient-build`) |
| `ui-click.wav` / `ui-hover.wav` / `ui-confirm.wav` / `ui-cancel.wav` | ui | UI affordances (buttons, hovers, modals) |
| `tower-place.wav` / `tower-upgrade.wav` / `tower-refund.wav` / `tower-select.wav` | sfx | Build-economy actions |
| `cast-spell.wav` | sfx | Spell cast |
| `tower-attack-light.wav` / `tower-attack-heavy.wav` | sfx | Tower attack variants (chosen per tower type) |
| `enemy-spawn.wav` / `boss-spawn.wav` / `enemy-reached.wav` | sfx | Enemy lifecycle |
| `kill.wav` | sfx | Enemy killed (pitch + volume jitter) |
| `wave-start.wav` / `wave-end.wav` | sfx | Wave flow |
| `level-victory.wav` / `game-over.wav` | sfx | Run outcome |
| `mh-reveal.wav` | sfx | Monty Hall door reveal |
| `buff-expire.wav` | sfx | Buff timer expiry (paired with the HUD's expiry-flash + countdown ring) |
| `achievement.wav` | sfx | Newly-unlocked achievement toast |

The exact slug → file + mix-parameter mapping lives in `src/engine/audio/sfx-defs.ts`.
