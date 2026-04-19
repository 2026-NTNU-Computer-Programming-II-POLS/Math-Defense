# Piecewise-Function Paths & Preset Buildable Positions — Multi-Phase Construction Plan

> **Status:** Draft v1
> **Author:** Transformed from `Piecewise_Path_And_Buildable_Positions_Design.md` (2026-04-19)
> **Target release:** Next minor (post-DDD-refactor)
> **Governing spec:** §§2–16 of the design specification (hereafter "the Spec")
> **Budget:** ≈32–36 engineer-hours + ≈3h level-authoring time, spread across 8 phases

---

## 0. How to Read This Plan

This document is the **execution-level contract** derived from the design spec. Where the spec declares *what* and *why*, this plan declares *in what order*, *by which file*, *with what gate*. It is deliberately exhaustive; every symbol introduced by the spec appears on some phase's task list.

Three invariants hold across every phase and must not be relaxed:

1. **SoC Contract (Spec §4.4).** Every symbol lives in exactly one layer. Cross-layer imports follow the matrix in §2 below. Any PR that violates the matrix is rejected at review and fails the architectural CI check (Phase 1 deliverable).
2. **English-only source (Spec §2.4).** New/touched files have English identifiers, comments, JSDoc, test names. Chinese comments in touched files are translated in the same commit. Enforced by `scripts/lint-chinese-comments.ts` (Phase 6).
3. **No open-ended debt (Spec §11.6).** Every shim, flag, or audit script has a written removal date. Removal deadlines are tracked in the debt ledger (§11 below) and checked in CI (Phase 1 deliverable).

Conventions used in this document:

- **Task IDs** take the form `P{n}-T{m}` for cross-referencing in commit messages and PRs.
- **Exit gate** means the observable condition that must hold before the next phase may begin. Exit gates are verifiable by either an automated test, a command, or a specific grep result — never by subjective judgment.
- **File touch list** is exhaustive for that phase; if a file is not listed, that phase does not modify it. Files listed in multiple phases are each scoped to that phase's responsibility (Phase 3 adds a call into `TowerPlacementSystem`; Phase 7 deletes its legacy fallback — same file, different scopes).

---

## 1. Baseline & Phase 0 — Preparation

Phase 0 is not in Spec §12 but is required to establish the baseline from which every later phase is measured.

### 1.1 Baseline verification

Before Phase 1 begins, confirm the repo matches the assumptions the Spec makes:

- [ ] `frontend/src/systems/TowerPlacementSystem.ts` `_handleClick` at lines 67–96 performs only occupancy + gold checks (Spec §3.1).
- [ ] `frontend/src/engine/Game.ts` has `pathFunction` at line 97 and `GameEvents` at lines 38–68 (Spec §16).
- [ ] `frontend/src/math/PathEvaluator.ts` contains `PathDef` (lines 6–12) and generators at lines 27–105 (Spec §16).
- [ ] `frontend/src/engine/Renderer.ts` `drawGrid` at lines 36–96 performs no tile classification (Spec §3.1).
- [ ] `frontend/src/data/level-defs.ts` `LevelDef` lives at lines 17–24; `LEVELS` at 31–91 (Spec §16).
- [ ] All existing tests pass on `main`: `npm test` (frontend) and `pytest` (backend) both green.

If any bullet fails, update the Spec's line references **before** starting Phase 1; do not silently skew.

### 1.2 Branch strategy

- Feature branch: `feature/piecewise-paths`
- Merge strategy: one PR per phase, squash-merge to `main`. Phases 4 and 5 may be concurrent PRs after Phase 3 merges.
- No force-push to shared branches; no amending merged commits.

### 1.3 Phase 0 exit gate

Baseline checklist above is satisfied; feature branch is created; the debt ledger stub (§11) is committed as `docs/debt-ledger.md` with Phase 1's first entry pre-filled (see §3 below).

---

## 2. SoC Contract — The Layer Matrix (Enforced Every Phase)

This matrix is the single source of truth for allowed imports. It is checked in Phase 1 by `scripts/arch-check.ts` and re-checked on every CI run thereafter.

| From ↓ / May import → | Data | Domain | Systems/Engine | Presentation |
|---|:---:|:---:|:---:|:---:|
| **Data** (`frontend/src/data/`) | ✓ (self) | ✗ | ✗ | ✗ |
| **Domain** (`frontend/src/domain/`) | ✓ | ✓ (self) | ✗ | ✗ |
| **Systems/Engine** (`frontend/src/systems/`, `engine/`) | ✓ | ✓ | ✓ (self) | ✗ |
| **Presentation** (`components/`, `stores/`, `composables/`) | ✓ | ✓ (types only) | ✓ (events, read-only) | ✓ (self) |

Additional SoC rules (restated from Spec §2.3 for the reviewer's checklist):

1. **Construction ≠ Validation ≠ Execution** of path data (one module each).
2. **Policy ≠ Mechanism** for placement (`PlacementPolicy` decides; `TowerPlacementSystem` executes).
3. **Renderer reads; does not decide** (`LevelLayoutService.classify` is the sole classifier).
4. **Entities do not know about segments** (strategies own per-segment kinematics; `Enemy` stays data-shaped).
5. **Single source of truth for HUD** is the Pinia store; components never import domain modules.
6. **No closures in serializable state** (closures live in domain runtime services only).

Every phase has a dedicated **SoC Gate** subsection; failures block the exit gate.

---

## 3. Phase 1 — Data & Domain Skeleton

**Duration:** ≈5h  
**Depends on:** Phase 0  
**Blocks:** Phases 2, 3  
**Owner:** Feature owner  
**Spec references:** §2.3, §4.4, §5.1, §5.3, §6.1, §6.2, §11.5

### 3.1 Goal

Land the declarative data types, the pure domain builder/validator, and the `SegmentedPath` runtime object — all without touching any existing runtime. After this phase, the codebase can describe, build, and validate a piecewise path entirely in isolation from the game loop.

### 3.2 Tasks

| ID | File | Kind | Responsibility |
|---|---|---|---|
| P1-T1 | `frontend/src/data/path-segment-types.ts` | new | `PathSegmentDef`, `PathSegmentKind`, `PathSegmentParams` discriminated union, `PathLayout`. Type-only module. No runtime code. (Spec §5.1) |
| P1-T2 | `frontend/src/domain/path/segmented-path.ts` | new | `SegmentedPath`, `PathSegmentRuntime` interfaces. Factory `createSegmentedPath(runtimes)` that returns a frozen object implementing `evaluateAt`, `findSegmentAt`. (Spec §5.3) |
| P1-T3 | `frontend/src/domain/path/segment-factories.ts` | new | Per-kind pure closure factories: `makeHorizontal(params) → (x) => y`, `makeLinear`, `makeQuadratic`, `makeTrigonometric`, `makeVertical`. **This is the only place the per-kind math lives going forward** (Spec §11.2). |
| P1-T4 | `frontend/src/domain/path/path-builder.ts` | new | `buildLevelPath(level: LevelDef): SegmentedPath`. Dispatches on `kind` via `segment-factories`. Does not validate. (Spec §6.1) |
| P1-T5 | `frontend/src/domain/path/path-validator.ts` | new | `validateLevelPath(level): PathValidationError[]`. Emits every code listed in Spec §6.2: `non-contiguous`, `out-of-world`, `buildable-overlaps-path`, `buildable-out-of-bounds`, `duplicate-segment-id`. |
| P1-T6 | `frontend/src/domain/path/path-builder.test.ts` | new | Unit tests for every `PathSegmentKind`: evaluated `y` matches closed-form math at sampled `x`. `startX`/`targetX` match the outer `xRange` of the first/last segment. |
| P1-T7 | `frontend/src/domain/path/path-validator.test.ts` | new | One test per error code producing exactly that code; a "happy path" test returning `[]`. Boundary tests: contiguous-with-vertical, sampled-y at segment endpoints. |
| P1-T8 | `frontend/src/domain/path/segmented-path.test.ts` | new | `findSegmentAt` in-range, out-of-range returns `null`, boundary `x` resolves to right-hand segment (matches Spec §14.1 invariant). |
| P1-T9 | `scripts/arch-check.ts` | new | Greps all imports; fails if any file under `/data/` imports from any other layer, any `/domain/` imports from `vue`, `@vue/*`, `pinia`, `src/engine/*`, `src/systems/*`, `src/components/*`, `src/stores/*`, `src/composables/*`, or any `src/components/` imports from `src/domain/`. Exit code non-zero on any violation. |
| P1-T10 | `frontend/package.json` scripts | modify | Add `"arch-check": "tsx scripts/arch-check.ts"`. Wire into `"test"` / `"ci"` script as a prerequisite step. |
| P1-T11 | `docs/debt-ledger.md` | new | Table mirroring Spec §11.6. Phase 1 entry: `SEGMENTED_PATHS_ENABLED flag · introduced Phase 1 · removed Phase 7 · deadline = ship-date + 14d · owner = <name>`. |
| P1-T12 | `scripts/check-debt-ledger.ts` | new | Parses the ledger, fails CI if any row's `scheduled removal` date is in the past relative to today. |
| P1-T13 | `frontend/src/config/feature-flags.ts` | new (or modify) | Export `SEGMENTED_PATHS_ENABLED: boolean` (default `false`). Single declaration point; no other module defines the flag. |

### 3.3 SoC Gate

- [ ] `scripts/arch-check.ts` passes.
- [ ] `data/path-segment-types.ts` has zero imports (pure types).
- [ ] `domain/path/*.ts` imports only from `data/` and other `domain/path/*`.
- [ ] No file under `domain/` imports Vue, Pinia, or anything from `engine/`, `systems/`, `components/`, `stores/`, `composables/`.
- [ ] `path-builder.ts` contains no validation branches; `path-validator.ts` contains no construction branches. (Reviewer greps each file for the other's concern.)

### 3.4 Tests Required to Land

- P1-T6 through P1-T8 all pass (`vitest` or repo's test runner).
- `arch-check.ts` run returns exit 0 on this branch's current state.
- `check-debt-ledger.ts` run returns exit 0.
- No existing test is modified or disabled in this phase.

### 3.5 Exit Gate

All tasks P1-T1 through P1-T13 landed; SoC Gate items all green; CI on the phase branch passes; no touch to `Game.ts`, `MovementSystem.ts`, `Renderer.ts`, or any Vue file. Debt ledger entry for the flag is merged.

---

## 4. Phase 2 — Movement Strategy & Progress Tracker

**Duration:** ≈5h  
**Depends on:** Phase 1  
**Blocks:** Phase 3  
**Spec references:** §6.3, §6.6, §7.3

### 4.1 Goal

Replace the current enemy kinematics with a polymorphic `MovementStrategy` selected per segment, and introduce a stateful `PathProgressTracker` that owns segment-boundary detection. `MovementSystem` becomes a thin orchestrator.

### 4.2 Tasks

| ID | File | Kind | Responsibility |
|---|---|---|---|
| P2-T1 | `frontend/src/domain/movement/movement-strategy.ts` | new | `MovementStrategy` interface + `MovementState` type per Spec §6.6. |
| P2-T2 | `frontend/src/domain/movement/horizontal-movement-strategy.ts` | new | Horizontal + linear + quadratic + trig: advance `x` by `speed * dt`; `y = segment.evaluate(x)`. (One file per strategy keeps per-kind math testable in isolation.) |
| P2-T3 | `frontend/src/domain/movement/linear-movement-strategy.ts` | new | As above for linear. |
| P2-T4 | `frontend/src/domain/movement/quadratic-movement-strategy.ts` | new | As above for quadratic. |
| P2-T5 | `frontend/src/domain/movement/trig-movement-strategy.ts` | new | As above for trig. |
| P2-T6 | `frontend/src/domain/movement/vertical-movement-strategy.ts` | new | `x` constant; advance `t` by `dt / durationSec`; `y = lerp(yStart, yEnd, t)`. Hand-off signal at `t ≥ 1`. |
| P2-T7 | `frontend/src/domain/movement/movement-strategy-registry.ts` | new | `registerStrategy(kind, strategy)` + `getStrategy(kind)`. Populated at module load with the five strategies. Throws on unknown kind. (Spec §6.6 last paragraph.) |
| P2-T8 | `frontend/src/domain/path/path-progress-tracker.ts` | new | `PathProgressTracker` interface + factory that takes `SegmentedPath` and an event-bus-like sink. Internal `lastSegmentId: string \| null`; on `update(leadX)` performs prev-vs-current lookup and emits `SEGMENT_CHANGED { fromId, toId }` exactly once per crossing. `dispose()` detaches the sink. (Spec §6.3) |
| P2-T9 | `frontend/src/domain/movement/*.test.ts` (5 files, one per strategy) | new | For each strategy: starting `MovementState`, one `advance(dt)`, assert new `(x,y,t)` equals closed-form math. Vertical strategy: integrating for `durationSec` total produces `t == 1`; asserting at `dt > durationSec` clamps to `t = 1`. |
| P2-T10 | `frontend/src/domain/path/path-progress-tracker.test.ts` | new | (a) No emit when `leadX` stays inside one segment. (b) Exactly one `SEGMENT_CHANGED` when crossing a boundary. (c) At very large `dt` spanning multiple segments, one emit per boundary crossed — prev-vs-current lookup handles non-adjacent jumps. (d) `dispose()` prevents further emits. |
| P2-T11 | `frontend/src/systems/MovementSystem.ts` | modify | Delegate per-enemy advance to `getStrategy(enemy.segmentKind).advance(state, segment, dt)`. Maintain a `Map<enemyId, MovementState>` side table (not on `Enemy`). After each tick compute `leadX` and call `tracker.update(leadX)`. Delete any inline path math. Gate the new code path behind `SEGMENTED_PATHS_ENABLED` so the legacy path still runs when the flag is off. |
| P2-T12 | `frontend/src/systems/MovementSystem.test.ts` | modify | Replace any tests that asserted on random-path kinematics; keep legacy tests under an `if (!SEGMENTED_PATHS_ENABLED)` block. Add: (a) with fake strategy registry, each enemy's advance call uses the strategy keyed by its current segment's kind. (b) On segment crossing, tracker's `update` receives the new `leadX`. (c) Position is written back to `enemy.x/y`. |

### 4.3 SoC Gate

- [ ] `Enemy` type (`entities/types.ts`) is **unchanged**. No `mode`, `segmentKind`, or similar flag is added to the entity. (`segmentKind` is looked up via `enemy.x` + the current path's `findSegmentAt`; it is not stored on the entity.)
- [ ] `MovementSystem` contains no arithmetic on `x`, `y`, `t` beyond `Map` lookups and delegation calls. Greppable: `const y = ` should not appear in the file outside lookup/assignment.
- [ ] `PathProgressTracker` does not import from `systems/` or `engine/` (it takes a sink interface as a parameter).
- [ ] `arch-check.ts` still passes.

### 4.4 Tests Required to Land

- P2-T9 (5 strategy tests), P2-T10 (tracker tests), P2-T11 (system tests with fakes) all green.
- Existing `MovementSystem` tests still pass under the legacy branch (`SEGMENTED_PATHS_ENABLED = false`).

### 4.5 Exit Gate

With the flag off, the game behaves identically to `main` (verified by a quick smoke test: load levels 1–4, run one wave each). With the flag on in a local dev build, enemies follow a hand-crafted two-segment test path correctly (ad-hoc harness, not committed).

---

## 5. Phase 3 — Level Context, Layout Service, Placement Policy

**Duration:** ≈4h  
**Depends on:** Phases 1, 2  
**Blocks:** Phases 4, 5, 6  
**Spec references:** §4.4, §5.4, §6.4, §6.5, §7.1, §7.2, §7.5

### 5.1 Goal

Introduce `LevelContext` as the single per-level holder of derived runtime state (`SegmentedPath`, `LevelLayoutService`, `PathProgressTracker`). Move all placement rules into `PlacementPolicy`. Wire the lifecycle from `LEVEL_START` to `LEVEL_END` through a thin composable, without adding any logic to the composable.

### 5.2 Tasks

| ID | File | Kind | Responsibility |
|---|---|---|---|
| P3-T1 | `frontend/src/domain/level/level-layout-service.ts` | new | `LevelLayoutService` interface + `createLevelLayoutService(level, path)`. Precomputes `pathCells: Set<string>` by sampling `path.evaluateAt` at grid resolution across every segment's `xRange` (vertical segments: sample along `y` instead). `classify(gx, gy)` is `O(1)`. (Spec §6.4) |
| P3-T2 | `frontend/src/domain/level/placement-policy.ts` | new | `PlacementPolicy` interface + `createPlacementPolicy()` default implementation encoding the three rejection reasons: `not-buildable`, `occupied`, `insufficient-gold`. Checks are ordered: buildable → occupied → gold (cheapest to most-context-dependent). (Spec §6.5) |
| P3-T3 | `frontend/src/domain/level/level-layout-service.test.ts` | new | `classify` returns `path` for cells on sampled curve, `buildable` for whitelisted, `forbidden` otherwise. Overlap between path and buildable is reported by the validator, not tolerated here. |
| P3-T4 | `frontend/src/domain/level/placement-policy.test.ts` | new | Each rejection reason reachable with a crafted `PlacementContext`; happy path returns `{ok:true}`. Order-of-checks test: on a non-buildable + insufficient-gold cell, reason is `not-buildable` (cheapest check wins). |
| P3-T5 | `frontend/src/engine/level-context.ts` | new | `LevelContext` interface + `createLevelContext(level, eventBus)` per Spec §5.4 / §7.2. Calls `buildLevelPath`; in dev mode runs `validateLevelPath` and throws on any error; creates `LevelLayoutService` and `PathProgressTracker`; returns object with `dispose()` that detaches the tracker. |
| P3-T6 | `frontend/src/engine/level-context.test.ts` | new | (a) Construction for a valid `LevelDef` wires up all three sub-services. (b) Dev-mode throws for a level with a known validator error. (c) `dispose()` causes subsequent `tracker.update` calls to no-op / not emit. |
| P3-T7 | `frontend/src/engine/Game.ts` | modify | Add field `levelContext: LevelContext \| null = null`. Do **not** remove `pathFunction` yet (it stays for the duration of the flag; Phase 7 removes it). `GameState` is not touched (Spec §5.4 last paragraph). |
| P3-T8 | `frontend/src/engine/event-handlers/registry.ts` | modify | Register `SEGMENT_CHANGED` and `PLACEMENT_REJECTED` in the event union and validator table (Spec §7.1). Add type definitions to `GameEvents` in `Game.ts`. |
| P3-T9 | `frontend/src/systems/TowerPlacementSystem.ts` | modify | In `_handleClick`: when `SEGMENTED_PATHS_ENABLED`, delegate to `policy.canPlace(gx, gy, ctx)`; on `{ok:false}` emit `PLACEMENT_REJECTED { gx, gy, reason }` and return. On `{ok:true}` proceed to existing place-tower code. The policy instance is injected via constructor (`new TowerPlacementSystem(game, policy)`). **No rule logic remains in this file** after the change — greppable by absence of gold-check / buildable-check arithmetic outside the policy. |
| P3-T10 | `frontend/src/systems/TowerPlacementSystem.test.ts` | modify | Replace rule-level assertions with tests using a fake `PlacementPolicy`: (a) rejection path emits `PLACEMENT_REJECTED` with the policy's reason. (b) happy path emits `TOWER_PLACED` and deducts gold. Rule-level correctness is covered in P3-T4. |
| P3-T11 | `frontend/src/composables/useGameLoop.ts` | modify | Add `LEVEL_START` subscriber that (1) disposes prior `game.levelContext`, (2) finds the `LevelDef` via `findLevel(levelId)`, (3) calls `createLevelContext`, (4) invokes `projectPathPanel(levelContext, gameStore)` (stub for now, real body in Phase 5). Add `LEVEL_END` subscriber that disposes and nulls. The composable stays a three-to-five-line orchestrator per Spec §7.2. |
| P3-T12 | `frontend/src/stores/gameStore.ts` | modify | Add empty `pathPanel` slice matching `PathPanelState` (Spec §5.5). Export a no-op `projectPathPanel(ctx, store)` symbol to be filled in Phase 5. This avoids a circular dependency at the import boundary later. |

### 5.3 SoC Gate

- [ ] `PlacementPolicy` has zero imports from `systems/`, `engine/`, or Vue.
- [ ] `TowerPlacementSystem` contains zero rule predicates (`gx < X`, `gold >= cost`, etc.) after refactor. All such predicates live in `PlacementPolicy`.
- [ ] `LevelLayoutService` contains zero imports from Vue/Pinia/engine.
- [ ] `useGameLoop` body for `LEVEL_START` subscriber is ≤10 lines and contains no path math, no validation calls, no classification logic. All three live inside `createLevelContext` or are delegated.
- [ ] `GameState` is **unchanged**.

### 5.4 Tests Required to Land

- P3-T3, P3-T4, P3-T6, P3-T10 all green.
- All Phase 1 and Phase 2 tests still green.
- Integration smoke: with the flag on, clicking a non-whitelisted cell emits `PLACEMENT_REJECTED` observable via an event-bus spy; clicking a whitelisted cell places a tower.

### 5.5 Exit Gate

Flag-off behavior is identical to `main`. Flag-on: running the game with a single hand-authored test level produces correct tile classification when the renderer is unchanged (renderer hookup is Phase 4). `arch-check.ts` + debt-ledger check pass.

---

## 6. Phase 4 — Renderer

**Duration:** ≈3h  
**Depends on:** Phase 3  
**May run in parallel with:** Phase 5  
**Spec references:** §4.4, §7.4, §8.1

### 6.1 Goal

Make `Renderer` read-only with respect to tile classification: it asks `LevelLayoutService` and paints the answer. Add segment-boundary rendering and the accessibility cues from Spec §8.1.

### 6.2 Tasks

| ID | File | Kind | Responsibility |
|---|---|---|---|
| P4-T1 | `frontend/src/engine/Renderer.ts` | modify | In `drawGrid`, iterate the grid and call `this.game.levelContext?.layout.classify(gx, gy) ?? 'forbidden'` for each cell. Paint via new helper `tileStyleFor(cls)`. No rule branching inline. (Spec §8) |
| P4-T2 | `frontend/src/engine/render-helpers/tile-style.ts` | new | Pure function `tileStyleFor(cls: TileClass): TileStyle` returning `{fill, border, hatching}` per Spec §8.1. No DOM, no canvas, no game state. |
| P4-T3 | `frontend/src/engine/Renderer.ts` | modify | Add `drawSegmentBoundaries()` that iterates `game.levelContext?.path.segments` and draws a thin accent line at every interior boundary. When `uiStore.hoveredSegmentId` is set, tint that segment's `xRange`. |
| P4-T4 | `frontend/src/engine/Renderer.ts` | modify | Update the placement-hover cursor helper to consult `LevelLayoutService` for its legality feedback. Same classification, one authority. (Spec §8) |
| P4-T5 | `frontend/src/engine/render-helpers/tile-style.test.ts` | new | One assertion per `TileClass` → style mapping. Hatching flag is set for `forbidden`; dotted border set for `buildable`. |
| P4-T6 | `frontend/src/engine/Renderer.test.ts` (lightweight) | modify | With a fake `LevelLayoutService` returning controlled values, assert that `drawGrid` calls `classify` for every cell in `[GRID_MIN_X, GRID_MAX_X) × [GRID_MIN_Y, GRID_MAX_Y)` and calls `paintTile` with the matching style. Use a canvas stub. |

### 6.3 SoC Gate

- [ ] Grep `Renderer.ts` for the strings `buildablePositions`, `pathCells`, `classify`-like rule predicates: only occurrences should be through `this.game.levelContext.layout.*`.
- [ ] `tile-style.ts` imports nothing from game state, Vue, canvas.

### 6.4 Tests Required to Land

P4-T5 and P4-T6 green. Visual smoke: with the flag on, the hand-authored test level renders the expected tile distribution and segment boundaries (manual verification; screenshot attached to PR).

### 6.5 Exit Gate

With flag on, placement hover and grid render agree on legality for every cell. Flag off: renderer output is identical to `main`.

---

## 7. Phase 5 — HUD: Function Panel

**Duration:** ≈4h  
**Depends on:** Phase 3  
**May run in parallel with:** Phase 4  
**Spec references:** §5.5, §7.4, §9

### 7.1 Goal

Ship the Function Panel as a dumb Vue component reading only from the Pinia store. The engine-to-store projection is a single function; the component never reaches into domain modules.

### 7.2 Tasks

| ID | File | Kind | Responsibility |
|---|---|---|---|
| P5-T1 | `frontend/src/stores/gameStore.ts` | modify | Fill in the `pathPanel` slice: state fields `segments`, `currentSegmentId`, `leadEnemyX`; actions `setPathPanelSegments(views)`, `setCurrentSegment(id)`, `setLeadEnemyX(x)`, `clearPathPanel()`. `segments` held via `shallowRef` (Spec §13 risk row) for render efficiency. |
| P5-T2 | `frontend/src/stores/uiStore.ts` (new or extend) | modify | Add `hoveredSegmentId: string \| null` + setter. Renderer reads it (Phase 4); Panel writes it (below). |
| P5-T3 | `frontend/src/engine/projections/project-path-panel.ts` | new | `projectPathPanel(ctx: LevelContext, store: GameStore)`: (1) maps `ctx.path.segments` to view objects (`PathSegmentView` per Spec §5.5) — **no closures in the view objects**. (2) Writes `segments` and initial `currentSegmentId`. (3) Subscribes to `SEGMENT_CHANGED` and updates `currentSegmentId`. (4) Returns an `unsubscribe` used by `LevelContext.dispose`. |
| P5-T4 | `frontend/src/engine/projections/project-path-panel.test.ts` | new | With a mock `LevelContext` emitting `SEGMENT_CHANGED`, assert store slice reflects updates. Calling the returned unsubscribe stops updates. |
| P5-T5 | `frontend/src/components/game/FunctionPanel.vue` | new | Dumb SFC. Reads `gameStore.pathPanel`. Renders header, current expression, a 200×120 canvas plot of the current segment's curve sampled on mount and on `currentSegmentId` change, overlay dot at normalized `leadEnemyX`, and a scrolling list of all segments with inactive/active/past styling (Spec §9.1). |
| P5-T6 | `frontend/src/components/game/FunctionPanel.test.ts` | new | With mocked store state, assert: renders current segment header and expression; switches when `currentSegmentId` changes; hover on a list item calls `uiStore.setHoveredSegmentId`; unhover clears it. |
| P5-T7 | `frontend/src/components/game/HUD.vue` | modify | Mount `<FunctionPanel />` in the designated side-panel slot. Remove the old single-line path expression display (Spec §16 refers to lines 62–65 in the current HUD). Keep the removal behind `SEGMENTED_PATHS_ENABLED` until Phase 7. |
| P5-T8 | `frontend/src/components/game/FunctionPanel.vue` | modify | Add the narrow-viewport CSS collapse (`< 1200px` → single-row strip; CSS-only, no state change) per Spec §9.4. |
| P5-T9 | `frontend/src/systems/MovementSystem.ts` | modify | After tracker update each tick, also call `gameStore.setLeadEnemyX(leadX)` through a thin action (Spec §9.2). Do not mutate store state directly from the system — use the action. |

### 7.3 SoC Gate

- [ ] `FunctionPanel.vue` imports zero modules from `src/domain/`, `src/engine/`, `src/systems/`.
- [ ] `pathPanel.segments` array contains **no functions** — verified by a JSON.stringify round-trip in P5-T4.
- [ ] `projectPathPanel` is the single writer for `pathPanel.segments` and `currentSegmentId`. No other file writes to those fields (grep for `pathPanel.segments =`, `setPathPanelSegments(` — only one caller).
- [ ] MovementSystem goes through a store action for `leadEnemyX`; no direct assignment (`gameStore.pathPanel.leadEnemyX = `) anywhere except inside the action.

### 7.4 Tests Required to Land

P5-T4 and P5-T6 green. Visual smoke: running the test level, the panel shows the current segment, swaps on boundary crossing, and the dot tracks the lead enemy.

### 7.5 Exit Gate

Flag-off: HUD is identical to `main`. Flag-on: panel functions end-to-end on the hand-authored test level, including hover-highlight round-trip with the renderer.

---

## 8. Phase 6 — Level Migration & Validation Tooling

**Duration:** ≈4h  
**Depends on:** Phases 1–5  
**Blocks:** Phase 7  
**Spec references:** §10.4, §10.5, §11.1, §11.4, §11.5

### 8.1 Goal

Author all four levels with explicit segments and buildable positions, ship the validator scripts and pre-commit hooks, and **flip `SEGMENTED_PATHS_ENABLED` to `true`** in the same PR. After this phase merges, the feature is live on `main`.

### 8.2 Tasks

| ID | File | Kind | Responsibility |
|---|---|---|---|
| P6-T1 | `frontend/src/data/level-defs.ts` | modify | Rewrite `LevelDef` type per Spec §5.2: add `path: PathLayout`, `buildablePositions: ReadonlyArray<readonly [number, number]>`. Mark all fields `readonly`. |
| P6-T2 | `frontend/src/data/level-defs.ts` | modify | Rewrite Level 1 per Spec §10.4. Segment count and buildable density per §10.3. |
| P6-T3 | `frontend/src/data/level-defs.ts` | modify | Author Level 2 segments + buildable cells. Target ~20 buildable cells. |
| P6-T4 | `frontend/src/data/level-defs.ts` | modify | Author Level 3 segments + buildable cells. Target ~12–16. |
| P6-T5 | `frontend/src/data/level-defs.ts` | modify | Author Level 4 segments + buildable cells. Target ~12–16 (mid level per §10.3 bands). |
| P6-T6 | `scripts/validate-levels.ts` | new | Runs `validateLevelPath` over every level in `LEVELS`. Renders each path as ASCII art to stdout (shrink grid to 40×20, sample `evaluateAt`, mark buildable cells with `B`, path cells with `·`, forbidden blank). Exits non-zero on any validation error. (Spec §10.5) |
| P6-T7 | `frontend/package.json` scripts | modify | Add `"validate-levels": "tsx scripts/validate-levels.ts"`; wire into `ci` script. |
| P6-T8 | `scripts/lint-chinese-comments.ts` | new | Walks `frontend/src/**/*.{ts,tsx,vue}`, flags any non-ASCII character inside `//`, `/* */`, `/** */` blocks. Per-file exception via a file-header comment `// @allow-non-ascii-comments: <reason>`. Exit non-zero on any violation. (Spec §2.4) |
| P6-T9 | `.husky/pre-commit` (or equivalent) | modify | Add `npm run validate-levels` and `npm run lint-chinese-comments` to the hook chain. Pre-commit is bypass-only if the user explicitly opts out for a single commit; we do not add `--no-verify` to any automated flow. |
| P6-T10 | `.github/workflows/ci.yml` | modify | Add `arch-check`, `validate-levels`, `lint-chinese-comments`, `check-debt-ledger` as required steps. |
| P6-T11 | `scripts/audit-overrides.ts` | new | Scans `LEVELS` for any `waves[].spawns[].overrides` usage; prints each site. Runs once during this phase's development, not in CI. Deletion is scheduled in this same phase (§8.4). |
| P6-T12 | `frontend/src/data/level-defs.ts` + `frontend/src/entities/types.ts` | modify | Per the audit in P6-T11: if no level uses `overrides`, delete the field from `EnemySpawnEntry` entirely. If some level uses it, migrate to a "spawn-at-segment" mechanism per Spec §11.4 (add `spawnSegmentId?: string` to `EnemySpawnEntry` with a domain-layer resolver) and update call sites. |
| P6-T13 | `frontend/src/config/feature-flags.ts` | modify | Flip `SEGMENTED_PATHS_ENABLED = true`. |
| P6-T14 | `docs/debt-ledger.md` | modify | Stamp Phase-6 removal of `EnemySpawnEntry.overrides` and of `scripts/audit-overrides.ts` as done. Confirm Phase-7 deadline for remaining items (flag, generators, `PathDef`). |
| P6-T15 | `frontend/tests/e2e/piecewise-paths.spec.ts` | new (Playwright) | Per Spec §14.4: load each level, walk a wave, assert enemies cross every segment exactly once (via event spy on `SEGMENT_CHANGED`). Place on buildable → success; click forbidden → rejected and feedback shown. Hover segment label → map highlight appears; unhover → disappears. Resume from mid-wave persistence → `levelContext` reconstructed, placements preserved. |

### 8.3 Delete at end of Phase 6

- [ ] `scripts/audit-overrides.ts` deleted as its last commit in the phase (Spec §11.4 bullet 2).
- [ ] `EnemySpawnEntry.overrides` field deleted if unused.

### 8.4 SoC Gate

- [ ] `level-defs.ts` contains **only** data. No closures, no `function(x)`, no per-level imports from `domain/` or `engine/`. All math is expressed as `PathSegmentParams`.
- [ ] `validate-levels.ts` imports only `data/*` and `domain/path/*`. No engine or Vue imports.
- [ ] `lint-chinese-comments.ts` run on this branch reports zero violations (existing Chinese comments in files touched by the feature were translated in-place during earlier phases per Spec §2.4 rule 2).

### 8.5 Tests Required to Land

- `npm run validate-levels` exits 0.
- `npm run lint-chinese-comments` exits 0.
- P6-T15 Playwright test green.
- All prior phase tests green with the flag on.

### 8.6 Exit Gate

PR merged to `main` with the flag on. Phase-7 follow-up issue already filed with the hard deadline `ship-date + 14 days` per Spec §11.5. Debt ledger shows Phase-7 items remaining open; CI continues to pass.

---

## 9. Phase 7 — Cleanup (Hard Deadline: Ship + 14 Days)

**Duration:** ≈3h  
**Depends on:** Phase 6 merged to `main`  
**Spec references:** §11.2, §11.3, §11.5, §11.6

### 9.1 Goal

Delete every shim introduced during the migration. After this phase, only one path pipeline exists.

### 9.2 Tasks

| ID | File | Kind | Responsibility |
|---|---|---|---|
| P7-T1 | `frontend/src/math/PathEvaluator.ts` | delete functions | Remove `generateHorizontalLine`, `generateLinear`, `generateQuadratic`, `generateTrigonometric`, `generatePiecewise`, `generateComposite` (Spec §16 lines 16–92). |
| P7-T2 | `frontend/src/math/PathEvaluator.ts` | delete type | Remove `PathDef` (Spec §16 lines 6–12). |
| P7-T3 | `frontend/src/math/PathEvaluator.ts` | evaluate remainder | If the file is empty after deletions, delete the file and remove all imports. If residual utilities remain, audit each for a home — move to `domain/path/` if still used, delete if not. No dead code. |
| P7-T4 | `frontend/src/config/feature-flags.ts` | modify | Delete `SEGMENTED_PATHS_ENABLED` export. |
| P7-T5 | repo-wide | sweep | Grep for `SEGMENTED_PATHS_ENABLED` and remove every remaining branch. All `if (SEGMENTED_PATHS_ENABLED)` becomes unconditional; all `if (!SEGMENTED_PATHS_ENABLED)` branches are deleted. Affected files known to contain branches: `MovementSystem.ts`, `TowerPlacementSystem.ts`, `HUD.vue`. |
| P7-T6 | `frontend/src/engine/Game.ts` | modify | Remove `pathFunction` field (Spec §16, line 97). Remove any assignments to it. |
| P7-T7 | repo-wide | sweep | Grep for `pathFunction`. Every read becomes a read through `levelContext.path.evaluateAt`. Any persisted/session path involving `pathFunction` is verified to have been removed in Phase 6's session-compat work (Spec §11.7 — no backend schema change because level data is re-derivable from `level.id`). |
| P7-T8 | `docs/debt-ledger.md` | modify | Stamp Phase-7 items as done. Ledger now has zero open items. |
| P7-T9 | `scripts/check-debt-ledger.ts` behavior verification | test | Run locally; it should pass with no open items. |
| P7-T10 | Commit message | note | PR title: `chore(paths): phase 7 cleanup — remove random-path pipeline`. Body lists every deleted symbol and file for auditability. |

### 9.3 SoC Gate

- [ ] `frontend/src/math/` either no longer contains `PathEvaluator.ts` or contains only symbols not covered by `domain/path/`.
- [ ] No file under `frontend/src/` imports a deleted symbol (`PathDef`, any generator). Verified by a successful TypeScript build.
- [ ] No reference to `SEGMENTED_PATHS_ENABLED` anywhere in the repo.

### 9.4 Tests Required to Land

Full test suite passes with zero conditional branches tied to the old pipeline. Playwright suite from Phase 6 still green. `arch-check.ts`, `validate-levels.ts`, `lint-chinese-comments.ts`, `check-debt-ledger.ts` all exit 0.

### 9.5 Exit Gate

PR merged to `main` within **14 calendar days** of the Phase 6 merge. If the deadline is missed, per Spec §11.5 the feature owner files an extension issue with a new dated deadline **before** the 14-day mark. Indefinite retention is not allowed.

---

## 10. Phase 8 — Balance & Polish

**Duration:** ≈4–6h  
**Depends on:** Phase 6 (may overlap Phase 7)  
**Spec references:** §12.1 Phase 8, §13

### 10.1 Goal

Tune balance for the new predictability of paths and placements; finalize art / accessibility. This phase is open-ended by design; budget is a cap, not a target.

### 10.2 Tasks

| ID | File(s) | Kind | Responsibility |
|---|---|---|---|
| P8-T1 | `frontend/src/data/level-defs.ts` — wave HP/counts | modify | Based on playtest, tune enemy HP and wave sizes so that deterministic paths do not trivialize existing levels. Per-level note in the PR. |
| P8-T2 | `frontend/src/data/level-defs.ts` — buildable density | modify | Adjust buildable-cell counts per level within the §10.3 bands based on playtest data. |
| P8-T3 | `frontend/src/data/tower-defs.ts` (if exists) or equivalent | modify | Tower cost adjustments if combat rebalance demands. |
| P8-T4 | `frontend/src/engine/render-helpers/tile-style.ts` + CSS | modify | Art pass: final tile fills, borders, hatching pattern. Validate color-blind accessibility with a simulator (Deuteranopia, Protanopia, Tritanopia). |
| P8-T5 | `frontend/src/components/game/FunctionPanel.vue` | modify | Polish: typography, canvas plot antialiasing, segment-list scroll behavior on long levels. |
| P8-T6 | `docs/playtest-notes-piecewise.md` | new | Document playtest findings; record what was tuned and why. Non-gating documentation. |

### 10.3 SoC Gate

- [ ] No new symbol is added outside its existing layer. P8 is a tuning phase; no module boundaries move.

### 10.4 Tests Required to Land

- All prior tests still green (balance changes may require updating numeric assertions in specific wave tests; such updates must not hide regressions).
- Manual playtest notes attached to the PR (`docs/playtest-notes-piecewise.md`).

### 10.5 Exit Gate

Feature owner signs off on balance. Color-blind simulator check attached to PR.

---

## 11. Technical-Debt Ledger (Canonical)

This ledger must be kept in `docs/debt-ledger.md` and updated in every phase that adds or retires an entry. `scripts/check-debt-ledger.ts` fails CI on any entry whose `scheduled removal` is in the past.

| Item | Introduced | Scheduled removal | Owner | Phase that closes |
|---|---|---|---|---|
| `SEGMENTED_PATHS_ENABLED` flag | Phase 1 | ship-date + 14d | Feature owner | Phase 7 |
| Legacy `MovementSystem` branch under `!SEGMENTED_PATHS_ENABLED` | Phase 2 | ship-date + 14d | Feature owner | Phase 7 |
| Legacy HUD path-expression display | Phase 5 | ship-date + 14d | Feature owner | Phase 7 |
| `scripts/audit-overrides.ts` | Phase 6 | end of Phase 6 | Feature owner | Phase 6 |
| `EnemySpawnEntry.overrides` | (pre-existing) | end of Phase 6 | Feature owner | Phase 6 |
| `generate*` random path generators | (pre-existing) | Phase 7 | Feature owner | Phase 7 |
| `PathDef` type | (pre-existing) | Phase 7 | Feature owner | Phase 7 |
| `Game.pathFunction` field | (pre-existing) | Phase 7 | Feature owner | Phase 7 |

No entry is open-ended. Deadline extensions are allowed only in writing and must carry a new dated deadline.

---

## 12. Cross-Phase Concerns

### 12.1 Architectural Tests (run every CI build from Phase 1 onward)

- `arch-check.ts` — import-boundary enforcement per §2.
- `validate-levels.ts` — every level in `LEVELS` passes `validateLevelPath` (from Phase 6).
- `lint-chinese-comments.ts` — no non-ASCII in comment blocks in `frontend/src/**` (from Phase 6).
- `check-debt-ledger.ts` — no past-due debt (from Phase 1).

### 12.2 Test Pyramid (Spec §14)

Every phase ships tests at the appropriate level:

| Layer | Runner | Phase introduces |
|---|---|---|
| Domain unit | Vitest | Phase 1 (builder, validator, segmented-path), Phase 2 (strategies, tracker), Phase 3 (layout, policy) |
| Systems/engine | Vitest with fakes | Phase 2 (`MovementSystem`), Phase 3 (`TowerPlacementSystem`, `LevelContext`) |
| Presentation unit | Vue Test Utils | Phase 5 (`FunctionPanel`, projections) |
| Engine/renderer | Vitest with canvas stub | Phase 4 (`Renderer`, `tileStyleFor`) |
| Integration / E2E | Playwright | Phase 6 (`piecewise-paths.spec.ts`) |
| Regression | existing suites | all phases — no existing test is silently disabled |

### 12.3 Commit & PR Discipline

- One PR per phase; squash-merge to `main`.
- PR description includes: (a) link to this plan, (b) checkbox list of the phase's exit-gate items, (c) architectural-test output snippets.
- Commit messages in English per Spec §2.4.
- No `--no-verify` or `--no-edit` in automated flows.
- Phase 7 PR must link to the Phase 6 merge commit and name the 14-day deadline explicitly.

### 12.4 Observability During Migration

While the flag is live (Phases 1–6), the app surfaces two dev-only logs (stripped in prod builds):

- On `LEVEL_START` with flag on: log `[paths] segmented path active for level {id}, {n} segments`.
- On `PLACEMENT_REJECTED`: dev console warning with `{gx, gy, reason}`. Production UI handles the user-facing feedback.

These logs are deleted in Phase 7 along with the flag.

### 12.5 Backend & Persistence

Per Spec §11.7, the backend `session_service` is unchanged. Level config is static and re-derivable from `level.id`; `buildablePositions` and `PathLayout` are not persisted. The backend is not touched in any phase of this plan. (Any backend change discovered necessary during implementation is out-of-scope and must be filed as a separate spec.)

---

## 13. Risk Register — Construction-Time Addenda

The Spec's §13 risk register covers feature-level risks. The following construction-time risks are tracked by this plan:

| Risk | Phase most at risk | Mitigation |
|---|---|---|
| Phase 1–2 churn blocks unrelated work on `MovementSystem` | Phase 2 | All Phase 2 changes gated by `SEGMENTED_PATHS_ENABLED`; main-branch behavior unchanged. |
| Phase 6 level rewrite introduces a silent regression in wave numerics | Phase 6 | P6-T15 Playwright suite; balance-specific numeric tests updated explicitly, never silently. |
| Phase 7 deadline slips | Phase 7 | CI `check-debt-ledger.ts` fails after deadline. Extension requires a dated re-file — not a quiet delay. |
| Flag removal creates a large merge conflict with concurrent work | Phase 7 | Phase 7 PR is sequenced immediately after ship, with a code freeze on `MovementSystem`, `TowerPlacementSystem`, `HUD.vue`, `Renderer.ts` during its review window. |
| ASCII validator `validate-levels.ts` becomes dev noise | Phase 6+ | Keep its stdout terse: one line per level with a `PASS/FAIL`; ASCII art is opt-in via `--visual` flag. |
| Pre-commit hook slows developer loop | Phase 6+ | `validate-levels` and `lint-chinese-comments` must each run in <2s on a cold cache; if either exceeds, profile before merging Phase 6. |

---

## 14. Appendix A — Complete File Inventory

Files **created** by this feature (final state after Phase 7):

**Data**
- `frontend/src/data/path-segment-types.ts`

**Domain**
- `frontend/src/domain/path/segmented-path.ts`
- `frontend/src/domain/path/segment-factories.ts`
- `frontend/src/domain/path/path-builder.ts`
- `frontend/src/domain/path/path-validator.ts`
- `frontend/src/domain/path/path-progress-tracker.ts`
- `frontend/src/domain/movement/movement-strategy.ts`
- `frontend/src/domain/movement/movement-strategy-registry.ts`
- `frontend/src/domain/movement/horizontal-movement-strategy.ts`
- `frontend/src/domain/movement/linear-movement-strategy.ts`
- `frontend/src/domain/movement/quadratic-movement-strategy.ts`
- `frontend/src/domain/movement/trig-movement-strategy.ts`
- `frontend/src/domain/movement/vertical-movement-strategy.ts`
- `frontend/src/domain/level/level-layout-service.ts`
- `frontend/src/domain/level/placement-policy.ts`

**Engine**
- `frontend/src/engine/level-context.ts`
- `frontend/src/engine/render-helpers/tile-style.ts`
- `frontend/src/engine/projections/project-path-panel.ts`

**Presentation**
- `frontend/src/components/game/FunctionPanel.vue`

**Tooling**
- `scripts/arch-check.ts`
- `scripts/validate-levels.ts`
- `scripts/lint-chinese-comments.ts`
- `scripts/check-debt-ledger.ts`
- `scripts/audit-overrides.ts` *(deleted end of Phase 6)*

**Docs**
- `docs/debt-ledger.md`
- `docs/playtest-notes-piecewise.md` *(Phase 8)*

Files **modified** by this feature:

- `frontend/src/data/level-defs.ts`
- `frontend/src/engine/Game.ts`
- `frontend/src/engine/Renderer.ts`
- `frontend/src/engine/event-handlers/registry.ts`
- `frontend/src/systems/MovementSystem.ts`
- `frontend/src/systems/TowerPlacementSystem.ts`
- `frontend/src/stores/gameStore.ts`
- `frontend/src/stores/uiStore.ts` (or equivalent)
- `frontend/src/composables/useGameLoop.ts`
- `frontend/src/components/game/HUD.vue`
- `frontend/src/entities/types.ts` *(only if `EnemySpawnEntry.overrides` removed in Phase 6)*
- `frontend/src/config/feature-flags.ts`
- `frontend/package.json`
- `.github/workflows/ci.yml`
- `.husky/pre-commit` (or equivalent hook file)

Files **deleted** by Phase 7:

- Symbols inside `frontend/src/math/PathEvaluator.ts` (file deleted if empty).

---

## 15. Appendix B — Per-Phase Exit Checklist (Copy into PR description)

### Phase 1
- [ ] Tasks P1-T1 … P1-T13 merged.
- [ ] `arch-check.ts` exit 0.
- [ ] `check-debt-ledger.ts` exit 0.
- [ ] No existing Vue/engine/system file touched.
- [ ] All new unit tests green.

### Phase 2
- [ ] Tasks P2-T1 … P2-T12 merged.
- [ ] `Enemy` type unchanged.
- [ ] `MovementSystem` contains no inline path math.
- [ ] Flag off → smoke test identical to `main`.
- [ ] All strategy + tracker unit tests green.

### Phase 3
- [ ] Tasks P3-T1 … P3-T12 merged.
- [ ] `TowerPlacementSystem` contains no rule predicates.
- [ ] `GameState` unchanged.
- [ ] `useGameLoop` `LEVEL_START` body ≤10 lines.
- [ ] Flag-on harness: rejection path emits event with correct reason.

### Phase 4
- [ ] Tasks P4-T1 … P4-T6 merged.
- [ ] `Renderer.drawGrid` calls `layout.classify` for every cell.
- [ ] `tile-style.ts` is pure and stateless.
- [ ] Flag-on visual smoke OK (screenshot on PR).

### Phase 5
- [ ] Tasks P5-T1 … P5-T9 merged.
- [ ] `FunctionPanel.vue` has zero domain/engine/system imports.
- [ ] `pathPanel.segments` survives JSON.stringify round-trip.
- [ ] MovementSystem writes `leadEnemyX` via action, not direct mutation.

### Phase 6
- [ ] Tasks P6-T1 … P6-T15 merged (with P6-T11 and `overrides` already deleted).
- [ ] `validate-levels.ts`, `lint-chinese-comments.ts` exit 0.
- [ ] All 4 levels re-authored.
- [ ] Flag flipped to `true`.
- [ ] Playwright E2E green.
- [ ] Phase-7 follow-up issue filed with dated deadline.

### Phase 7
- [ ] Tasks P7-T1 … P7-T10 merged.
- [ ] `SEGMENTED_PATHS_ENABLED` absent from repo (grep empty).
- [ ] `PathDef`, `Game.pathFunction`, random generators absent (grep empty).
- [ ] Debt ledger has zero open items.
- [ ] Merged within 14 days of Phase 6 ship date.

### Phase 8
- [ ] Tasks P8-T1 … P8-T6 merged.
- [ ] Color-blind simulator verification attached.
- [ ] Playtest notes committed.

---

## 16. Appendix C — Mapping from Spec Symbols to Phases

| Spec symbol | Introduced | Final owner layer |
|---|---|---|
| `PathSegmentDef`, `PathSegmentKind`, `PathSegmentParams`, `PathLayout` | Phase 1 | Data |
| `SegmentedPath`, `PathSegmentRuntime` | Phase 1 | Domain |
| `buildLevelPath` | Phase 1 | Domain |
| `validateLevelPath`, `PathValidationError` | Phase 1 | Domain |
| per-kind closure factories | Phase 1 | Domain |
| `MovementStrategy`, `MovementState` | Phase 2 | Domain |
| per-kind `*MovementStrategy` | Phase 2 | Domain |
| `movement-strategy-registry` | Phase 2 | Domain |
| `PathProgressTracker` | Phase 2 | Domain |
| `Events.SEGMENT_CHANGED` | Phase 3 | Engine (event registry) |
| `Events.PLACEMENT_REJECTED` | Phase 3 | Engine (event registry) |
| `LevelLayoutService`, `TileClass` | Phase 3 | Domain |
| `PlacementPolicy`, `PlacementDecision`, `PlacementContext` | Phase 3 | Domain |
| `LevelContext`, `createLevelContext` | Phase 3 | Engine |
| `Game.levelContext` field | Phase 3 | Engine |
| `tileStyleFor`, `TileStyle` | Phase 4 | Engine (render helper) |
| `drawSegmentBoundaries` | Phase 4 | Engine (renderer) |
| `pathPanel` store slice, `PathSegmentView`, `PathPanelState` | Phase 5 | Presentation |
| `uiStore.hoveredSegmentId` | Phase 5 | Presentation |
| `projectPathPanel` | Phase 5 | Engine (projection) |
| `FunctionPanel.vue` | Phase 5 | Presentation |
| `LevelDef.path`, `LevelDef.buildablePositions` | Phase 6 | Data |
| `validate-levels.ts`, `lint-chinese-comments.ts` | Phase 6 | Tooling |
| `audit-overrides.ts` | Phase 6 (deleted same phase) | Tooling (transient) |
| Deletion of `PathDef`, random generators, flag, legacy fields | Phase 7 | n/a |

---

## 17. Sign-off

This plan is binding as the execution contract for the feature. The feature owner confirms they have read §§1–16 and agrees to:

- The SoC contract in §2 as the review checklist for every PR.
- The debt-ledger deadlines in §11; any slip is filed, not ignored.
- The per-phase exit checklists in §15 as the merge gate.
- The English-only source rule in §0 (3) for every file touched.

Deviations from this plan require a written amendment committed to `docs/` and linked from the feature owner's PR. Silent scope changes are not permitted.
