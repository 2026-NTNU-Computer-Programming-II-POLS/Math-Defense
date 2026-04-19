# Piecewise-Function Paths & Preset Buildable Positions — Design Specification

> **Status:** Draft
> **Author:** Design discussion, 2026-04-19
> **Target release:** Next minor (post-DDD-refactor)
> **Related spec:** `Math_Defense_Spec.md` (core game spec)

---

## 1. Summary

Replace the current **per-wave random function path** and **unrestricted tower placement** with:

1. **Per-level piecewise-function path** — every level defines an ordered sequence of function segments `[f₁ on [a₀,a₁], f₂ on [a₁,a₂], …]`. Enemies follow this concatenated curve. Segment boundaries are fixed and known to the player.
2. **Preset buildable cells** — each level whitelists the grid cells on which towers may be built. All other cells are rejected at placement time.
3. **Function panel HUD** — a side panel renders the current segment's `f(x)` as a live curve with a marker for the lead enemy's `x` position and the literal expression.

This is the "**C′ + C‴**" option from prior design discussion: piecewise functions are the **level skeleton** (not decoration), segment boundaries become natural choke points, and the HUD guarantees functions remain legible even when the map view draws attention elsewhere.

The specification is written to the following non-negotiable engineering standards:

- **Separation of Concerns (SoC):** every responsibility lives in exactly one layer and exactly one module. Presentation, domain logic, data, and infrastructure do not leak into one another. A layer map is defined in §4.4 and every new symbol is assigned to exactly one cell of that map.
- **No technical debt:** every compatibility shim, fallback branch, and feature flag introduced in this work has a named owner and a written removal date (§11.5). Dead code from the previous random-path regime is deleted, not deprecated-in-place.
- **English-only source annotations:** all code, comments, identifiers, commit messages, test names, and inline JSDoc introduced by this feature are written in English. Existing Chinese comments in files touched by this work are translated in the same commit. See §2.4.

---

## 2. Goals, Non-Goals, Principles, and Standards

### 2.1 Goals

- Preserve the game's identity as a **math-function-driven** tower defense. The function is the path, not a side effect.
- Give levels the strategic depth of traditional TD: predictable paths, choke points, meaningful position choices.
- Elevate **piecewise functions** from a single Level-4 generator to a **first-class level-construction primitive**.
- Keep the change incremental: reuse `PathEvaluator`'s existing function math and the current `x`-based enemy kinematics where correct; replace them cleanly where not.
- Backward-compatible migration over a **bounded and scheduled** window (§11.5). No indefinite legacy support.

### 2.2 Non-Goals

- **Not** introducing waypoint/spline-based arbitrary paths (Z/U/spiral). That is a separate, larger redesign.
- **Not** adding a level editor in this iteration. Level data is hand-authored in TypeScript.
- **Not** server-side path validation. Paths remain client-authoritative; backend keeps its current role (session persistence, scoring).
- **Not** changing tower/enemy/economy balance beyond what the path change forces. A follow-up balancing pass is scoped separately.

### 2.3 Architectural Principles (Separation of Concerns)

Every symbol added by this feature belongs to exactly one of four layers:

| Layer | Role | May import from | Must not import from |
|---|---|---|---|
| **Data** (`/frontend/src/data/`) | Pure declarative data. No functions holding behavior. | — | any other layer |
| **Domain** (`/frontend/src/domain/`) | Pure business logic. Stateless functions + instance-scoped services. Deterministic, framework-free. | Data | Systems, Engine, Components, Stores |
| **Systems / Engine** (`/frontend/src/systems/`, `/frontend/src/engine/`) | Stateful game loop, event bus, rendering, orchestration of domain services. | Data, Domain | Components, Stores |
| **Presentation** (`/frontend/src/components/`, `/frontend/src/stores/`, `/frontend/src/composables/`) | Vue components, Pinia stores, composables. | Data, Domain, Engine events (read-only) | — |

Concrete SoC rules enforced by this design:

1. **Construction ≠ Validation ≠ Execution.** Path data is *constructed* by one module, *validated* by another, and *executed at runtime* by a third. They do not share mutable state.
2. **Policy ≠ Mechanism.** `TowerPlacementSystem` (mechanism: click handling, gold deduction, event emission) does not encode rules about which cells are buildable. It asks a `PlacementPolicy` (policy: domain service that answers "is this placement legal?").
3. **Rendering reads; it does not decide.** `Renderer` does not compute tile classifications. It queries `LevelLayoutService.classify(gx, gy)` and paints the answer. If the classification rule changes, `Renderer` does not change.
4. **Entities do not know about segments.** An `Enemy` carries position, speed, and HP. It does not carry `mode: 'riser'` flags. Per-segment traversal is delegated to a polymorphic `MovementStrategy` selected by `MovementSystem` from the segment kind.
5. **Reactive UI subscribes to a single source of truth.** HUD components read from the Pinia store. The store is populated by engine-layer subscribers to domain events. Components never read `game.*` directly.
6. **No closures in serializable state.** Any value that may cross a persistence boundary (session save, store rehydration) is a plain data object. Closures (`(x) => y`) live only in runtime-only services that can be rebuilt from data on demand.

### 2.4 Coding Standards

Mandatory for every file touched or created under this feature:

1. **English-only source content.** All of the following are written in English:
   - Identifiers (variables, functions, classes, types, files, directories).
   - Comments (single-line, block, JSDoc, `TODO`/`FIXME`/`NOTE` markers).
   - Commit messages and PR descriptions.
   - Test names (`describe`/`it` strings).
   - User-visible strings that are identifiers, debug output, or developer-facing logs. *Player-facing UI strings are handled by the existing i18n system and are out of scope for this rule.*
2. **Translation on contact.** If a file touched by this feature already contains Chinese comments or identifiers, they are translated to English in the same commit. This prevents mixed-language files from accumulating.
3. **JSDoc discipline.** Every exported symbol introduced by this feature has a one-line JSDoc summary. Non-obvious behavior (units, invariants, edge cases) gets an additional `@remarks` line. No multi-paragraph docstrings; prefer linking to this spec for long-form rationale.
4. **No commented-out code.** Dead branches are deleted, not commented out.
5. **Naming:** `PascalCase` for types and classes, `camelCase` for values and functions, `SCREAMING_SNAKE_CASE` for module-level constants. File names follow the kebab-case convention already used in the repo (`path-builder.ts`, not `PathBuilder.ts`).

Enforcement: a pre-commit lint rule (ESLint custom rule or simple regex script at `scripts/lint-chinese-comments.ts`) fails CI on any non-ASCII character inside `//`, `/* */`, or `/** */` blocks in `frontend/src/**`. Exceptions are declared per-file with a header comment.

---

## 3. Motivation

### 3.1 Current State

- Tower placement (`frontend/src/systems/TowerPlacementSystem.ts:67-96`) only checks *occupancy* and *gold* — any empty grid cell is valid.
- Each level's path is a **single** randomly-generated function, assigned once at `LEVEL_START` and stored in `Game.pathFunction` (`frontend/src/engine/Game.ts:97`). Level 4 is the only level that draws from `generatePiecewise` (`frontend/src/math/PathEvaluator.ts:76-92`).
- Grid tiles drawn in `Renderer.drawGrid()` (`frontend/src/engine/Renderer.ts:36-96`) are purely decorative.
- No level has a sense of terrain, choke point, or forced line-of-fire.

### 3.2 Why This Matters

The game has no strategic depth today:

- Because the path is one random function per level and the map is fully open, the **optimal play is to flood towers wherever gold allows**.
- Players cannot plan firing arcs, rangebands, or crossfire — the path's exact shape is revealed only after `LEVEL_START`, and towers placed against last level's function are wasted.
- Function identity (linear vs quadratic vs trig) currently makes almost no strategic difference; it is a cosmetic difference in curve shape.

### 3.3 Why C′ + C‴ Specifically

Discussed alternatives and why they were rejected or held back:

| Option | Rejected because |
|---|---|
| **A.** Preset positions only, keep random paths | Choke-point reasoning impossible — random curves may never come near the "good" tiles. |
| **B.** Path band + preset positions | Compresses function shape into a narrow y-range; quadratics look like linears. Visual identity of functions degrades. |
| **C.** Waypoint paths (e.g. Bloons TD style) | Demotes the function to decoration. Rewrites enemy kinematics, path system, and likely requires a level editor. High cost, high risk, destroys the math-teaching value proposition. |
| **C′ + C‴** (this doc) | Keeps functions as the path. Adds strategic predictability via fixed segment boundaries. HUD panel makes function identity unmissable. Reuses existing function math. |

---

## 4. High-Level Design

### 4.1 The Level-as-Piecewise-Function Model

A level's path is a sequence of **segments**. Each segment owns an `x`-interval and a function `f: x ↦ y`. Concatenating the segments end-to-end produces the full path.

```
Level example ("L-curve crossing"):

Segment 1:  x ∈ [−3,  8]   f₁(x) = 5                    (horizontal, teach baseline)
Segment 2:  x = 8          vertical riser, y: 5 → 11    (choke-point corner)
Segment 3:  x ∈ [ 8, 18]   f₃(x) = 11 + 2·sin((x−8)·π/5) (oscillating stretch)
Segment 4:  x ∈ [18, 25]   f₄(x) = 11 − 0.8·(x−18)       (descending linear finish)
```

Segment boundaries at `x = 8` and `x = 18` become the **level's choke points**.

### 4.2 Preset Buildable Cells

Each level ships an explicit `buildablePositions: ReadonlyArray<readonly [number, number]>`. Placement succeeds iff the cell is in the whitelist **and** passes existing occupancy/gold checks.

### 4.3 Function Panel HUD

A new `FunctionPanel.vue` component renders the current segment's expression and curve, with a live marker tracking the lead enemy. Segment boundaries drive the panel's transitions.

### 4.4 Module Ownership & Layer Map

Every new symbol maps to exactly one cell of this grid:

| Module | Layer | Responsibility | Notes |
|---|---|---|---|
| `data/level-defs.ts` (extended) | Data | Declarative level config: segments, buildable cells. | Pure data; no closures. |
| `data/path-segment-types.ts` (new) | Data | `PathSegmentDef`, `PathSegmentKind`, `PathSegmentParams`, `PathLayout`. | Type-only module. |
| `domain/path/path-builder.ts` (new) | Domain | `buildLevelPath(level) → SegmentedPath`. Constructs runtime path from declarative segments. | Pure function. |
| `domain/path/path-validator.ts` (new) | Domain | `validateLevelPath(level) → Result<void, PathValidationError[]>`. | Pure. Separated from builder. |
| `domain/path/segmented-path.ts` (new) | Domain | `SegmentedPath` runtime object + `evaluateAt(x)` + `findSegmentAt(x)`. | Immutable. Holds closures. |
| `domain/path/path-progress-tracker.ts` (new) | Domain | Stateful per-game tracker. Detects segment boundary crossings, holds current-segment id. Emits through an injected event sink. | Isolates boundary-crossing logic. |
| `domain/level/level-layout-service.ts` (new) | Domain | `classify(gx, gy) → 'buildable' \| 'path' \| 'forbidden'`. Precomputes path-cell set per level. | Only reader renderer uses. |
| `domain/level/placement-policy.ts` (new) | Domain | `canPlace(gx, gy, ctx) → PlacementDecision`. Centralises all placement rules. | Future rules extend here, not in systems. |
| `domain/movement/movement-strategy.ts` (new) | Domain | Polymorphic: one strategy per `PathSegmentKind`. `advance(enemy, dt, segment) → NextPosition`. | Replaces enemy-mode flags. |
| `domain/movement/movement-strategy-registry.ts` (new) | Domain | `get(kind) → MovementStrategy`. | Single lookup point. |
| `engine/level-context.ts` (new) | Engine | Per-level derived state holder. Created on `LEVEL_START`, disposed on `LEVEL_END`. Owns `SegmentedPath`, `PathProgressTracker`, `LevelLayoutService`. | Replaces ad-hoc fields on `Game`. |
| `systems/TowerPlacementSystem.ts` (modified) | Systems | Delegates legality to `PlacementPolicy`. No rule logic inside. | Thin. |
| `systems/MovementSystem.ts` (modified) | Systems | Delegates per-segment kinematics to `MovementStrategy`. Emits `SEGMENT_CHANGED` via tracker. | Thin. |
| `engine/Renderer.ts` (modified) | Engine | Queries `LevelLayoutService.classify` per tile. No rule logic inside. | Thin. |
| `engine/event-handlers/registry.ts` (modified) | Engine | Registers new events `SEGMENT_CHANGED`, `PLACEMENT_REJECTED`. | — |
| `components/game/FunctionPanel.vue` (new) | Presentation | Vue SFC. Reads from `gameStore.pathPanel`. | Dumb component. |
| `stores/gameStore.ts` (modified) | Presentation | Adds `pathPanel` slice fed by engine subscribers. | Single source of truth for HUD. |
| `composables/useGameLoop.ts` (modified) | Presentation | Creates `LevelContext` on `LEVEL_START` via a factory; disposes on `LEVEL_END`. No path-building logic inline. | Thin orchestration. |
| `scripts/validate-levels.ts` (new) | Tooling | Offline validator + ASCII renderer. Used in CI and pre-commit. | — |
| `scripts/lint-chinese-comments.ts` (new) | Tooling | English-only enforcement. | — |

This table is the contract. Any PR that adds logic to a module outside its declared responsibility is rejected at review.

---

## 5. Data Model Changes

### 5.1 Data Layer — `data/path-segment-types.ts` (new)

```typescript
/**
 * Declarative description of one piecewise-function segment.
 * Pure data — contains no closures, safe to serialize.
 */
export interface PathSegmentDef {
  readonly id: string
  readonly xRange: readonly [number, number]
  readonly kind: PathSegmentKind
  readonly params: PathSegmentParams
  readonly label?: string
  readonly expr?: string
}

export type PathSegmentKind =
  | 'horizontal'
  | 'linear'
  | 'quadratic'
  | 'trigonometric'
  | 'vertical'

export type PathSegmentParams =
  | { readonly kind: 'horizontal';    readonly y: number }
  | { readonly kind: 'linear';        readonly slope: number; readonly intercept: number }
  | { readonly kind: 'quadratic';     readonly a: number; readonly b: number; readonly c: number }
  | { readonly kind: 'trigonometric'; readonly amplitude: number; readonly frequency: number; readonly phase: number; readonly offset: number }
  | { readonly kind: 'vertical';      readonly x: number; readonly yStart: number; readonly yEnd: number; readonly durationSec: number }

export interface PathLayout {
  readonly segments: ReadonlyArray<PathSegmentDef>
}
```

No `'custom'` closure kind. Custom math must be expressible through one of the declared kinds, or a new kind is added here. This keeps the data layer serializable by construction and avoids a debt escape hatch.

### 5.2 Data Layer — `data/level-defs.ts` (extended)

```typescript
export interface LevelDef {
  readonly id: number
  readonly name: string
  readonly nameEn: string
  readonly description: string
  readonly availableTowers: ReadonlyArray<TowerType>
  readonly waves: ReadonlyArray<WaveDef>

  readonly path: PathLayout
  readonly buildablePositions: ReadonlyArray<readonly [number, number]>
}
```

All fields are `readonly`: level data is immutable after module load.

### 5.3 Domain Layer — `domain/path/segmented-path.ts` (new)

```typescript
/**
 * Runtime path built from PathLayout. Holds closures — never persisted.
 */
export interface SegmentedPath {
  readonly segments: ReadonlyArray<PathSegmentRuntime>
  readonly startX: number
  readonly targetX: number
  evaluateAt(x: number): number
  findSegmentAt(x: number): PathSegmentRuntime | null
}

export interface PathSegmentRuntime {
  readonly id: string
  readonly kind: PathSegmentKind
  readonly xRange: readonly [number, number]
  readonly evaluate: (x: number) => number
  readonly expr: string
  readonly label: string
}
```

### 5.4 Engine Layer — `engine/level-context.ts` (new)

Replaces ad-hoc additions to `Game` / `GameState`:

```typescript
export interface LevelContext {
  readonly level: LevelDef
  readonly path: SegmentedPath
  readonly layout: LevelLayoutService
  readonly progress: PathProgressTracker
  dispose(): void
}

export function createLevelContext(level: LevelDef, eventBus: EventBus<GameEvents>): LevelContext
```

`Game` gains one field:

```typescript
levelContext: LevelContext | null
```

`GameState` is **not** modified. Buildable positions are static per level; storing them in `GameState` would duplicate data and muddy the distinction between "dynamic per-game runtime state" and "static per-level config". The domain service reads `levelContext.level.buildablePositions` when asked.

This is a correction relative to an earlier draft and an explicit tech-debt avoidance: we do not duplicate level config into the persisted game state.

### 5.5 Presentation Layer — `stores/gameStore.ts` (extended)

```typescript
interface PathPanelState {
  segments: PathSegmentView[]   // view-friendly, no closures
  currentSegmentId: string | null
  leadEnemyX: number | null
}

interface PathSegmentView {
  id: string
  index: number
  label: string
  expr: string
  xRange: [number, number]
}
```

This is a **projection** of domain objects into plain data for Vue. The HUD never imports domain modules.

### 5.6 `shared/game-constants.json`

No changes. Grid bounds and tile size remain authoritative.

---

## 6. Algorithms & Service Contracts

### 6.1 `buildLevelPath` — Domain construction

```typescript
// domain/path/path-builder.ts
export function buildLevelPath(level: LevelDef): SegmentedPath
```

Responsibilities:

1. For each `PathSegmentDef`, produce a `PathSegmentRuntime` by dispatching on `kind` to a pure closure factory.
2. Assemble `segments`, `startX`, `targetX`.
3. Return an immutable `SegmentedPath`.

`buildLevelPath` **does not validate**. It assumes the level is well-formed. Callers are required to run `validateLevelPath` first (typically at module load; see §6.2).

### 6.2 `validateLevelPath` — Domain validation

```typescript
// domain/path/path-validator.ts
export type PathValidationError =
  | { code: 'non-contiguous'; gapAt: number }
  | { code: 'out-of-world'; segmentId: string; sampledY: number }
  | { code: 'buildable-overlaps-path'; cell: [number, number] }
  | { code: 'buildable-out-of-bounds'; cell: [number, number] }
  | { code: 'duplicate-segment-id'; id: string }

export function validateLevelPath(level: LevelDef): PathValidationError[]
```

Pure and stateless. Returns an array (empty = valid). Invoked by:

- `scripts/validate-levels.ts` in CI (fails the build on any error).
- `createLevelContext` in dev mode as a defensive assert. Production builds skip (validated in CI).

Validation and construction live in separate modules because **they have different change drivers**: rules evolve (new invariants) while the builder is mostly stable.

### 6.3 `PathProgressTracker` — Boundary crossing detection

```typescript
// domain/path/path-progress-tracker.ts
export interface PathProgressTracker {
  currentSegmentId(): string | null
  leadEnemyX(): number | null
  /** Called every tick with the current vanguard enemy x. */
  update(leadX: number | null): void
  dispose(): void
}
```

Internal state: last known `currentSegmentId`. On `update`, looks up the segment for `leadX`; if it differs from the previous, emits `SEGMENT_CHANGED` through the event bus passed at construction.

**Crossing detection uses previous-vs-current lookup**, not exact-x matching, so it is robust against large `dt` or low framerates.

This isolates boundary logic from `MovementSystem`. `MovementSystem` only calls `tracker.update(leadX)` once per frame.

### 6.4 `LevelLayoutService` — Tile classification

```typescript
// domain/level/level-layout-service.ts
export interface LevelLayoutService {
  classify(gx: number, gy: number): TileClass
  buildableCells(): ReadonlySet<string>   // keys are "gx,gy"
  pathCells(): ReadonlySet<string>
}

export type TileClass = 'buildable' | 'path' | 'forbidden'

export function createLevelLayoutService(level: LevelDef, path: SegmentedPath): LevelLayoutService
```

Precomputes `pathCells` once on construction by sampling `path.evaluateAt(x)` at grid resolution across each segment's `xRange` and rounding. Thereafter `classify` is an `O(1)` set lookup.

### 6.5 `PlacementPolicy` — Placement rules

```typescript
// domain/level/placement-policy.ts
export type PlacementDecision =
  | { ok: true }
  | { ok: false; reason: 'not-buildable' | 'occupied' | 'insufficient-gold' }

export interface PlacementPolicy {
  canPlace(gx: number, gy: number, ctx: PlacementContext): PlacementDecision
}

export interface PlacementContext {
  towerType: TowerType
  gold: number
  freeNext: boolean
  existingTowers: ReadonlyArray<Tower>
  layout: LevelLayoutService
}
```

`TowerPlacementSystem._handleClick` becomes:

```typescript
const decision = this.policy.canPlace(gx, gy, ctx)
if (!decision.ok) {
  game.eventBus.emit(Events.PLACEMENT_REJECTED, { gx, gy, reason: decision.reason })
  return
}
// … place tower, emit TOWER_PLACED
```

No rule code in the system itself. Future rules (e.g. "cells within N units of a shrine unlock after wave 3") are added to `PlacementPolicy` without touching systems.

### 6.6 `MovementStrategy` — Per-segment kinematics

```typescript
// domain/movement/movement-strategy.ts
export interface MovementStrategy {
  advance(state: MovementState, segment: PathSegmentRuntime, dt: number): MovementState
}

export interface MovementState {
  readonly x: number
  readonly y: number
  readonly t: number     // 0..1 within current segment; used by vertical strategy
  readonly speed: number
}
```

Implementations, one per `PathSegmentKind`:

- `HorizontalMovementStrategy`, `LinearMovementStrategy`, `QuadraticMovementStrategy`, `TrigMovementStrategy`: advance `x` by `speed * dt`, compute `y = segment.evaluate(x)`.
- `VerticalMovementStrategy`: hold `x` constant, advance `t` by `dt / durationSec`, compute `y = lerp(yStart, yEnd, t)`. On `t >= 1`, hand off to the next segment's strategy through `MovementSystem`.

The `Enemy` type does **not** gain mode flags. Per-enemy `state: MovementState` lives in `MovementSystem`'s side table, keyed by enemy id, and is written back to `enemy.x/y` after each advance. All other systems (combat, rendering) read `enemy.x/y` as before.

`MovementStrategyRegistry.get(kind)` resolves the right strategy. The registry is a single lookup map — adding a new `PathSegmentKind` requires registering a strategy there and updating `PathSegmentParams`, nothing else.

---

## 7. Lifecycle & Event Flow

### 7.1 New Events

```typescript
Events.SEGMENT_CHANGED:       { fromId: string | null; toId: string }
Events.PLACEMENT_REJECTED:    { gx: number; gy: number; reason: 'not-buildable' | 'occupied' | 'insufficient-gold' }
```

Registered in `engine/event-handlers/registry.ts`.

### 7.2 `LEVEL_START`

Handled by one subscriber in `composables/useGameLoop.ts`:

```typescript
function onLevelStart(levelId: number) {
  game.levelContext?.dispose()
  const level = findLevel(levelId)
  game.levelContext = createLevelContext(level, game.eventBus)
  // Presentation projection (populates store):
  projectPathPanel(game.levelContext, gameStore)
}
```

No path-building, no validation, no rendering concerns inline. The composable is a three-line orchestrator.

`createLevelContext` internally:

1. Calls `buildLevelPath(level)`.
2. In dev builds, asserts `validateLevelPath(level).length === 0`.
3. Constructs `LevelLayoutService` and `PathProgressTracker`.
4. Returns an object whose `dispose()` unhooks the tracker from the event bus.

### 7.3 Per-Frame

`MovementSystem.tick(dt)`:

1. For each enemy, resolve its segment, resolve strategy, call `strategy.advance`.
2. Find the vanguard `leadX`.
3. Call `game.levelContext.progress.update(leadX)`. That call may emit `SEGMENT_CHANGED`.

`MovementSystem` never directly talks about segment boundaries. The tracker owns that concept.

### 7.4 `SEGMENT_CHANGED`

Two subscribers:

- `stores/gameStore` projection — updates `pathPanel.currentSegmentId`.
- `engine/Renderer` — invalidates any cached segment-highlight overlays (if any).

`FunctionPanel.vue` reacts to the store automatically via Vue reactivity.

### 7.5 `LEVEL_END`

Subscriber calls `game.levelContext.dispose()` and sets it to `null`. Store slice is cleared by the same projection code running with a null context.

---

## 8. Renderer Changes

`Renderer.drawGrid()` changes **only in what it asks**, not in what it decides:

```typescript
drawGrid(): void {
  const layout = this.game.levelContext?.layout
  for (let gx = GRID_MIN_X; gx < GRID_MAX_X; gx++) {
    for (let gy = GRID_MIN_Y; gy < GRID_MAX_Y; gy++) {
      const cls = layout?.classify(gx, gy) ?? 'forbidden'
      this.paintTile(gx, gy, tileStyleFor(cls))
    }
  }
  this.drawGridLines()
  this.drawAxes()
  this.drawSegmentBoundaries()
}
```

`tileStyleFor` is a small pure function: `TileClass → TileStyle`. No rule logic.

`drawSegmentBoundaries` iterates `game.levelContext.path.segments`, drawing a thin accent line at each interior boundary. When the store's `hoveredSegmentId` is set, the corresponding segment's `xRange` is tinted.

Hover cursor during placement consults the same `LevelLayoutService` via a small helper and renders a green or red footprint. Same classification, one authority.

### 8.1 Accessibility

Color alone is insufficient. Each tile class has a secondary visual cue:

- `buildable`: subtle green tint + dotted border.
- `path`: existing stone pattern, slightly darkened.
- `forbidden`: neutral background + diagonal hatching.

---

## 9. HUD: Function Panel

### 9.1 Component (`components/game/FunctionPanel.vue`)

Dumb component. Reads only from `gameStore.pathPanel`. No domain imports.

Renders:

- Current segment header: `"Segment {index+1} / {total} — {label}"`.
- Current segment expression in a prominent `<code>` block.
- A 200×120 canvas plot of the current segment's curve (sampled through a small drawing helper). An overlay dot at the normalized lead-enemy x.
- A scrolling list of all segments with inactive/active/past styling.

### 9.2 Store Integration

```typescript
// stores/gameStore.ts (new slice)
pathPanel: {
  segments: PathSegmentView[]
  currentSegmentId: string | null
  leadEnemyX: number | null
}
```

Populated by `projectPathPanel(ctx, store)` at `LEVEL_START`. Mutated by:

- `SEGMENT_CHANGED` subscriber → updates `currentSegmentId`.
- `MovementSystem` writes `leadEnemyX` each tick (through a dedicated store action, not direct mutation).

The plot's sampled points are computed inside the component on each segment change, not stored. Plot rendering is a presentation concern, not state.

### 9.3 Hover-to-Highlight

Panel hover writes `uiStore.hoveredSegmentId`. Renderer reads it and tints. One-way data flow. When the panel unmounts or the level ends, the hover state resets.

### 9.4 Responsive Behavior

On narrow viewports (< 1200px) the panel collapses to a single-row strip showing only the current segment expression. Collapse is CSS-only; no state change.

---

## 10. Level Design Guidelines

### 10.1 Segment Authoring Rules

1. **Cover the full path:** adjacent segments share an exact `x` boundary.
2. **C⁰ continuity preferred:** `fᵢ(aᵢ) == fᵢ₊₁(aᵢ)` at each interior boundary unless the boundary is a vertical segment.
3. **Respect the world:** for every segment, `f(x) ∈ [GRID_MIN_Y + 0.5, GRID_MAX_Y − 0.5]` across `xRange`.
4. **2–6 segments per level** is the recommended complexity band.

### 10.2 Choke Point Authoring

Each interior boundary is a candidate choke point. Surround it with **at least 2 buildable cells within tower range**, ideally on both sides for crossfire.

### 10.3 Buildable-Cell Density

- **Early levels (1–2):** ~20 buildable cells.
- **Mid levels (3–4):** ~12–16.
- **Late / boss levels:** ~8–10.

### 10.4 Level 1 Rewrite (Example)

```typescript
{
  id: 1, name: 'Grassland', nameEn: 'Grassland',
  description: 'A gentle horizontal approach with one subtle dip.',
  availableTowers: ['arrow', 'cannon'],
  path: {
    segments: [
      { id: 'L1-S1', xRange: [-3,  8], kind: 'horizontal',
        params: { kind: 'horizontal', y: 5 },
        label: 'Entry corridor', expr: 'y = 5' },
      { id: 'L1-S2', xRange: [ 8, 17], kind: 'quadratic',
        params: { kind: 'quadratic', a: 0.08, b: -1.28, c: 10.12 },
        label: 'Descending dip', expr: 'y = 0.08x^2 - 1.28x + 10.12' },
      { id: 'L1-S3', xRange: [17, 25], kind: 'linear',
        params: { kind: 'linear', slope: 0, intercept: 4 },
        label: 'Exit corridor', expr: 'y = 4' },
    ],
  },
  buildablePositions: [
    [4, 7], [6, 7], [4, 3], [6, 3],
    [10, 8], [13, 8], [10, 2], [13, 2],
    [17, 6], [20, 6], [17, 2], [20, 2],
    [8, 8], [8, 2],
  ],
  waves: [ /* unchanged */ ],
}
```

### 10.5 Author-Time Validation

`scripts/validate-levels.ts`:

- Runs `validateLevelPath` against every level in `LEVELS`.
- Renders each level path as ASCII art to stdout for visual sanity-check.
- Exits non-zero on any error.
- Invoked in CI and in a pre-commit Git hook.

---

## 11. Migration, Backward Compatibility, and Technical-Debt Policy

### 11.1 Scope of Migration

All 4 existing levels (`level-defs.ts:31-91`) are re-authored with explicit segments and buildable positions in the same PR that enables the feature. No coexistence period.

### 11.2 Removal of Random Path Generators

The functions `generateHorizontalLine`, `generateLinear`, `generateQuadratic`, `generateTrigonometric`, `generatePiecewise`, `generateComposite` (`PathEvaluator.ts:16-92`) **are deleted** once level migration is complete and the feature flag is retired (§11.5). Their underlying math is preserved inside the per-kind closure factories in `domain/path/path-builder.ts`, which is the only place that math lives going forward.

Rationale: keeping both the old random pipeline and the new deterministic pipeline alive is classical parallel-structure debt. We commit to one pipeline.

### 11.3 Removal of `PathDef` Legacy Type

`PathDef` (`PathEvaluator.ts:6-12`) is deleted. All consumers migrate to `SegmentedPath` / `PathSegmentRuntime`. The `type: 'segmented'` union-expansion workaround discussed in an earlier draft is **not** adopted because it would leave stale union members permanently.

### 11.4 Handling of `EnemySpawnEntry.overrides`

`overrides: { startX?, targetX? }` made sense when every enemy could ride its own variant of the random path. With deterministic paths, its semantics are ambiguous. Decision: **deprecate and remove** in the same PR.

- Any remaining use in level data is converted to a dedicated "spawn-at-segment" mechanism if needed. If no level uses it after migration, the field is deleted entirely.
- Audit script: `scripts/audit-overrides.ts` scans level data and prints all uses. Used once during migration, then deleted.

### 11.5 Feature Flag — Bounded Life

A runtime flag `SEGMENTED_PATHS_ENABLED` exists **only during the merge window**:

- Introduced in Phase 1.
- Default `false` through Phases 1–5 (so merges do not break main).
- Flipped to `true` in Phase 6, same PR that migrates all levels.
- **Flag and all `false`-branch code are deleted in Phase 7**, no later than 14 days after the feature ships in main. The deletion is pre-scheduled as a follow-up issue at the time the flag is introduced.

If the deletion date is missed, the owning engineer is responsible for either deleting immediately or filing a written extension with a new date. Indefinite retention is not allowed.

### 11.6 Technical Debt Policy (summary)

| Item | Introduced | Scheduled removal | Owner |
|---|---|---|---|
| `SEGMENTED_PATHS_ENABLED` flag | Phase 1 | Phase 7 (≤14 days after ship) | Feature owner |
| `scripts/audit-overrides.ts` | Phase 6 | End of Phase 6 | Feature owner |
| `generateLinear` and other random path generators | (already present) | Phase 7 | Feature owner |
| `PathDef` type | (already present) | Phase 7 | Feature owner |
| `EnemySpawnEntry.overrides` | (already present) | Phase 6 | Feature owner |

No debt item is open-ended. A CI check parses this table and warns on any item past its removal date.

### 11.7 Session-Persistence Compatibility

`session_service` persistence payload is unchanged. Since level config is static, `buildablePositions` and `PathLayout` are re-derived from `level.id` on resume. No schema migration on the backend.

---

## 12. Implementation Plan

### 12.1 Phases

**Phase 1 — Data & Domain skeleton (≈5h)**
- Create `data/path-segment-types.ts`.
- Create `domain/path/path-builder.ts`, `path-validator.ts`, `segmented-path.ts`.
- Unit tests for builder (per-kind math correctness) and validator (every error code).

**Phase 2 — Movement and tracking (≈5h)**
- Create `domain/movement/movement-strategy.ts` + registry + per-kind strategies.
- Create `domain/path/path-progress-tracker.ts`.
- Refactor `MovementSystem` to delegate. Delete any replaced in-system path math.
- Unit tests for each strategy and for tracker boundary emission.

**Phase 3 — Level context and placement policy (≈4h)**
- Create `domain/level/level-layout-service.ts`, `domain/level/placement-policy.ts`, `engine/level-context.ts`.
- Refactor `TowerPlacementSystem` to use `PlacementPolicy`.
- Wire `useGameLoop` to create/dispose `LevelContext` on `LEVEL_START` / `LEVEL_END`.
- Add `PLACEMENT_REJECTED` event.

**Phase 4 — Renderer (≈3h)**
- Update `drawGrid` to consult `LevelLayoutService`.
- Add segment boundary rendering.
- Add hover-cursor classification feedback.
- Accessibility hatching/borders.

**Phase 5 — HUD (≈4h)**
- `FunctionPanel.vue` + store slice + projection code.
- Hover-to-highlight wiring (`uiStore.hoveredSegmentId`).
- Responsive collapse.

**Phase 6 — Level migration & validation tooling (≈4h)**
- Rewrite all 4 levels with segments and buildable cells.
- `scripts/validate-levels.ts` + CI hook.
- `scripts/lint-chinese-comments.ts` + pre-commit hook.
- `scripts/audit-overrides.ts` (used once, then deleted).
- Flip `SEGMENTED_PATHS_ENABLED` to true.

**Phase 7 — Cleanup (≈3h)**
- Delete `PathEvaluator` random generators.
- Delete `PathDef` legacy type.
- Delete `SEGMENTED_PATHS_ENABLED` flag and all `false`-branch code.
- Delete `scripts/audit-overrides.ts`.

**Phase 8 — Balance & polish (≈4–6h)**
- Tune tower costs / enemy HP for new predictability.
- Tune buildable-cell counts per playtest feedback.
- Art pass on tile colors and segment markers.

**Total:** ~32–36 engineer-hours plus ~3h design time for level authoring. Phase 7 is non-negotiable and must land within 14 days of Phase 6.

### 12.2 Dependencies & Ordering

- Phase 1 → 2 → 3 strict.
- Phases 4 and 5 parallelizable after Phase 3.
- Phase 6 requires 1–5.
- Phase 7 follows 6 strictly, within 14 days.
- Phase 8 can start after Phase 6.

---

## 13. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vertical segments look janky when multiple enemies queue | Medium | Low | Risers short (≤3 units); design around single-file traversal. |
| Difficulty swing: predictable paths trivialize existing balance | High | Medium | Dedicated Phase 8 rebalance. |
| Segment boundary detection glitches at high speeds / low FPS | Medium | Medium | `PathProgressTracker` uses prev-vs-current lookup, not equality. Unit-test at varying `dt`. |
| HUD panel clutters small screens | Medium | Low | Responsive collapse (§9.4). |
| Level authoring feels tedious without a visual editor | Medium | Low | ASCII renderer + hot reload acceptable for ≤8 levels. Revisit if count grows. |
| Piecewise math confuses new players (too academic) | Medium | Medium | `label` fields; tutorial in early levels. |
| Cross-layer coupling slips back in during review | Medium | High | §4.4 layer map is the explicit review checklist. Any import crossing a forbidden boundary fails review. |
| Tech debt remains past removal dates | Medium | High | §11.6 table + CI check on dates. |
| Non-English comments sneak into touched files | Medium | Low | `scripts/lint-chinese-comments.ts` pre-commit + CI. |
| `LevelLayoutService` memoization becomes stale if levels mutate | Low | Medium | Level data is `readonly`. Service is created anew per `LevelContext`, discarded on `LEVEL_END`. |
| Vue reactivity over a large `segments` array in store triggers unneeded re-renders | Low | Low | Segments stored as `shallowRef`; only `currentSegmentId` and `leadEnemyX` are deeply reactive. |

---

## 14. Testing Strategy

Every layer is tested in isolation; cross-layer behavior is covered by integration tests.

### 14.1 Unit Tests (Domain — no DOM, no framework)

- `buildLevelPath`: produces correct `y` for each kind at sampled `x`; composes segments in order; exposes correct `startX` / `targetX`.
- `validateLevelPath`: emits exactly the expected error codes for crafted-bad levels; empty array for valid ones.
- `SegmentedPath.findSegmentAt`: correct segment for in-range `x`, `null` for out-of-range, boundary goes to the right-hand segment.
- `PathProgressTracker`: emits `SEGMENT_CHANGED` exactly once per boundary when leadX steps across; does not emit on same-segment updates.
- Each `MovementStrategy`: after `advance`, new `(x, y)` matches math; vertical strategy completes in `durationSec`.
- `LevelLayoutService.classify`: correct class for cells on/off path and in/out of whitelist.
- `PlacementPolicy.canPlace`: every rejection reason returnable; happy path returns `{ok: true}`.

### 14.2 Systems / Engine Tests

- `TowerPlacementSystem` with a fake `PlacementPolicy`: asserts it emits `PLACEMENT_REJECTED` with the reason the policy returned, and `TOWER_PLACED` on success. No rule logic tested here — that's the policy's test.
- `MovementSystem` with fake strategies: asserts it resolves the right strategy per segment and writes back position.
- `createLevelContext` lifecycle: dispose unhooks tracker (verified by checking no events emitted post-dispose).

### 14.3 Presentation Tests

- `FunctionPanel.vue` with mocked store: renders current segment, switches on `currentSegmentId` change, highlight wiring works.
- Store projection: given a mock `LevelContext`, produces correct `pathPanel` slice.

### 14.4 Integration / Playwright

- Load each level, walk a wave, assert enemies cross every segment exactly once.
- Place on buildable → success; click forbidden → rejected and feedback shown.
- Hover segment label → map highlight appears; unhover → disappears.
- Resume from mid-wave persistence → `levelContext` reconstructed, placements preserved.

### 14.5 Architectural Tests

- `scripts/arch-check.ts` greps imports and fails if any file under `/data/` imports from other layers, any `/domain/` imports Vue, any `/components/` imports `/domain/`. Runs in CI.

### 14.6 Regression

- Existing tests under `frontend/src/**/*.test.ts` must pass. Tests that assumed random paths are updated to assert deterministic paths for the relevant level id.

---

## 15. Open Questions

1. **Hard cuts or smoothed segment boundaries?** Current spec: hard cuts, designer-authored. No auto-smooth.
2. **Retain `EnemySpawnEntry.overrides`?** Current spec: remove in Phase 6.
3. **Panel shows all segments or just current?** Current spec: current plot big, others as compact list.
4. **Optimal buildable-cell count per level?** Heuristic in §10.3; confirm in Phase 8 playtest.
5. **Sandbox / free-path mode?** Deferred. Reinstating it would resurrect the deleted generators; if we ever want it, it gets its own spec and its own deterministic authoring.
6. **Color-blind accessibility.** Hatching/borders mandated (§8.1). Revisit in Phase 8 with user testing.

---

## 16. Appendix — Code References

| Responsibility | File | Current lines |
|---|---|---|
| Level definitions | `frontend/src/data/level-defs.ts` | 7-10 (`EnemySpawnEntry`), 12-15 (`WaveDef`), 17-24 (`LevelDef`), 31-91 (LEVELS) |
| Path generators (to be deleted in Phase 7) | `frontend/src/math/PathEvaluator.ts` | 6-12 (`PathDef`), 27-105 (generators), 109-118 (pool) |
| Tower placement | `frontend/src/systems/TowerPlacementSystem.ts` | 67-96 (`_handleClick`) |
| Tower entity | `frontend/src/entities/types.ts` | 12-40 (`Tower`) |
| Game state | `frontend/src/engine/GameState.ts` | 9-34 (`GameState`) |
| Game core | `frontend/src/engine/Game.ts` | 38-68 (`GameEvents`), 97 (`pathFunction`, to be replaced by `levelContext`) |
| Event bus | `frontend/src/engine/EventBus.ts` | 14-54 |
| Event registry | `frontend/src/engine/event-handlers/registry.ts` | 31-137 |
| Grid renderer | `frontend/src/engine/Renderer.ts` | 36-96 (`drawGrid`) |
| HUD path display | `frontend/src/components/game/HUD.vue` | 62-65 |
| Shared constants | `shared/game-constants.json` | — |
| Session persistence | `backend/app/application/session_service.py` | — |

---

## 17. Appendix — Glossary

- **Segment** — one `(xRange, f)` pair. Building block of a level path.
- **Path** — the complete curve for a level, formed by concatenating segments.
- **Buildable cell** — a grid cell on which a tower may be placed for a given level.
- **Choke point** — in practice, a segment boundary or a narrow `y`-range region; in design terms, a location where player tower placement produces disproportionate value.
- **Riser / vertical segment** — a segment with constant `x` and varying `y`, used for corner turns.
- **C⁰ continuity** — `f` values agree at boundaries; no sudden teleport.
- **C¹ continuity** — first derivative also agrees; the curve has no kinks.
- **SoC** — Separation of Concerns. See §2.3.
- **Level Context** — per-level runtime object owning `SegmentedPath`, `LevelLayoutService`, `PathProgressTracker`. Disposed on `LEVEL_END`.
- **Placement Policy** — domain service answering "may a tower go here?". Rule owner.
- **Movement Strategy** — domain interface implementing per-segment-kind kinematics.
