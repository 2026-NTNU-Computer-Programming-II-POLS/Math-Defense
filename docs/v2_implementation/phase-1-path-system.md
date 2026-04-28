# Phase 1 — Path System & Level Generation

> **Goal**: Replace V1's piecewise segment paths with full mathematical curve
> paths. Implement the reverse-generation algorithm, difficulty star rating,
> Initial Answer mechanism, and level selection UI.

**Prerequisites**: Phase 0 (user model with roles, for level access control).

---

## 1.1 Math Curve Engine

Build a math evaluation layer that can represent, evaluate, and render
continuous functions across the full map coordinate space.

### Function Families

| Type | Internal Representation | Example |
|------|------------------------|---------|
| A-path (degree 1) | `a*x + b` | `y = 2x + 1` |
| A-path (degree 2) | `a*x^2 + b*x + c` | `y = x^2 - 3x + 2` |
| A-path (degree 3) | `a*x^3 + b*x^2 + c*x + d` | `y = x^3 - x` |
| B-path (trig) | `a*sin(b*x + c) + d` or `a*cos(b*x + c) + d` | `y = 2sin(x) + 1` |
| C-path (log) | `a*ln(b*x + c) + d` | `y = ln(x) + 3` |

### Files to Create

| File | Purpose |
|------|---------|
| `frontend/src/math/curve-types.ts` | Type definitions: `CurveDefinition`, `CurveFamily`, coefficient types |
| `frontend/src/math/curve-evaluator.ts` | `evaluate(curve, x) → y` for all families; handles domain restrictions (log: x > -c/b) |
| `frontend/src/math/curve-renderer.ts` | Sample curve at N points across visible x-range, produce polyline for canvas rendering |

### WASM Consideration

Trig and log evaluation at high sample rates may benefit from WASM. For Phase 1,
implement in TypeScript. Profile after integration; migrate hot paths to WASM in
a later optimization pass if needed.

---

## 1.2 Reverse Endpoint Generation

The level generator picks the endpoint first, then constructs paths through it.

### Algorithm

```
Input: star_rating, path_group (e.g., type-2 with k=3)
Output: list of CurveDefinitions, endpoint P, interval [a,b]

1. Pick endpoint P = (x0, y0) within playable map area
   (avoid edges; ensure all curve families have valid domain at x0).

2. For each path slot i = 1..k:
   a. Determine family (polynomial degree / trig / log) from the path_group.
   b. Generate random coefficients CONSTRAINED so f_i(x0) = y0.
      - Polynomial: one coefficient is determined by the others + y0.
      - Trig: phase shift c adjusted so a*sin(b*x0 + c) + d = y0.
      - Log: vertical shift d adjusted so a*ln(b*x0 + c_coeff) + d = y0.

3. Verify uniqueness: numerically scan for other x where ALL paths
   share a common y. If another shared intersection exists within the
   playable area, regenerate (go to step 1).

4. Verify slope separation: |f_i'(x0) - f_j'(x0)| > threshold for
   all i ≠ j. Prevents near-tangent degeneracy.

5. Determine interval [a, b] around x0:
   a. Shrink from a wide window until [a, b] contains exactly one
      intersection of ALL paths.
   b. Ensure [a, b] is not impractically narrow (min width constraint).

6. Return curves, P, [a, b].
```

### Files to Create / Modify

| File | Action |
|------|--------|
| `frontend/src/domain/level/level-generator.ts` | Create — implements the reverse-generation algorithm |
| `frontend/src/domain/level/path-group-defs.ts` | Create — defines valid path groups (type-1 to type-7) with k ranges |
| `frontend/src/math/intersection-solver.ts` | Create — numerical intersection finding (Newton-Raphson or bisection for pairs; brute-force scan for "all paths share a point") |

---

## 1.3 Spawn Point Calculation

Each path intersects the map boundary (a rectangle) at one or more points.
These become enemy spawn locations.

### Algorithm

```
For each curve f_i:
  For each boundary edge (top, bottom, left, right):
    Solve f_i(x) = y_edge  (for horizontal edges)
    or    x = x_edge, y = f_i(x_edge)  (for vertical edges)
    Filter: only keep solutions within edge bounds.
  Collect all valid boundary intersection points → spawn_points_i
```

### Files to Create

| File | Purpose |
|------|---------|
| `frontend/src/domain/path/spawn-calculator.ts` | Compute boundary intersections for each curve |

---

## 1.4 Difficulty Star Rating System

### Data Definition

Encode the full difficulty table from V2.md Section 5 as a lookup structure.

| File | Purpose |
|------|---------|
| `frontend/src/data/difficulty-defs.ts` | Create — exports `DIFFICULTY_TABLE`: star → list of valid multisets |
| `shared/game-constants.json` | Add `star_ratings: { min: 1, max: 5 }` |

### Path Groups

The difficulty table requires **7** path groups (not 4 — see V2.md Section 4.3):

| Group | Composition | k |
|-------|------------|---|
| type-1 | {A only} | 2–5 |
| type-2 | {A, B} | 2–3 |
| type-3 | {A, C} | 2–3 |
| type-4 | {B, C} | 2–3 |
| type-5 | {B only} | 2–3 |
| type-6 | {C only} | 2–3 |
| type-7 | {A, B, C} | 3 |

Types 5–7 cover higher-star combos: pure trig (e.g., {sin,sin,sin}), pure log
(e.g., {log,log,log}), and triple-mix (e.g., {1,log,sin}).

Each multiset in the difficulty table must map to exactly one group.

### Star Assignment

When generating a level, the generator picks a star rating first, then selects
a valid multiset from `DIFFICULTY_TABLE[star]`, then calls the reverse-generation
algorithm with the corresponding path group and families.

---

## 1.5 Level Configuration Schema

Replace V1's fixed 4-level structure with a dynamic, star-rated level system.

### Backend

| File | Action |
|------|--------|
| `backend/app/models/game_session.py` | Modify — replace `level` (int 1-4) with `star_rating` (int 1-5), add `path_config` (JSON — serialized curve definitions), `initial_answer` (bool), `time_total`, `cost_total`, `health_origin`, `health_final` |
| `backend/app/domain/session/aggregate.py` | Modify — reflect new fields |
| `backend/alembic/versions/<hash>_v2_level_schema.py` | Create — migration |

### Frontend

| File | Action |
|------|--------|
| `frontend/src/data/level-defs.ts` | Rewrite — no longer hardcoded levels; instead, a level is generated on-the-fly from star + multiset |
| `frontend/src/views/LevelSelectView.vue` | Create — star-rated level browser; player picks a star difficulty, system generates a level |

---

## 1.6 Initial Answer Mechanism

Before gameplay starts, the player must solve for the endpoint.

### Flow (Frontend)

```
LevelSelectView → select star → generate level
  → InitialAnswerView:
      - Display all path functions (as formatted equations)
      - Display interval [a, b]
      - Show N multiple-choice options (one correct, rest plausible distractors)
      - Player picks one OR pays gold to skip OR ignores (timer / proceed button)
  → GameView:
      - If IA answered (correct or wrong) or paid: paths visible
      - If IA ignored: paths hidden
      - IA value (0 or 1) stored for scoring
```

### Distractor Generation

Generate plausible wrong answers by:
1. Evaluating nearby intersections of subsets of paths (not all paths).
2. Adding small random offsets to the true endpoint.
3. Picking random points within [a, b] that lie on at least one path.

### Files to Create / Modify

| File | Action |
|------|--------|
| `frontend/src/views/InitialAnswerView.vue` | Create — multiple-choice UI for endpoint identification |
| `frontend/src/domain/level/distractor-generator.ts` | Create — generates plausible wrong answers |
| `frontend/src/composables/useGameLoop.ts` | Modify — accept IA result, control path visibility |

---

## 1.7 Path Rendering

### Visible Mode (IA answered or paid)

- Render each curve as a smooth polyline on the canvas.
- Color-code by path type (A = one color, B = another, C = another).
- Mark the endpoint with a distinct icon.
- Mark spawn points on map edges.

### Hidden Mode (IA ignored)

- No curves rendered.
- No endpoint marker.
- Spawn points still visible (enemies still spawn there).

### Files to Create / Modify

| File | Action |
|------|--------|
| `frontend/src/renderers/` | Modify existing path renderer — replace segment rendering with continuous curve sampling and drawing |
| `frontend/src/domain/path/path-builder.ts` | Rewrite — build path from CurveDefinition instead of piecewise segments |

---

## 1.8 Math Rendering Library

Multiple V2 systems display formatted math equations to the player:
- **Phase 1**: Initial Answer — path functions displayed as equations
- **Phase 2**: Limit tower questions, Calculus tower function selection
- **Phase 3**: Boss Type-B chain rule challenge

### Recommendation

Integrate **KaTeX** (fast, lightweight, renders to HTML/CSS — no MathJax
overhead). Use it everywhere math expressions appear in UI.

### Files to Create / Modify

| File | Action |
|------|--------|
| `frontend/package.json` | Add `katex` dependency |
| `frontend/src/components/common/MathDisplay.vue` | Create — wrapper component: accepts LaTeX string, renders via KaTeX |
| `frontend/src/views/InitialAnswerView.vue` | Use `<MathDisplay>` for path equations |

All later phases (2, 3) reuse the same `MathDisplay` component.

---

## 1.9 Canvas Coordinate System Review

V1 uses: canvas 1280×720, grid x∈[-3, 25], y∈[-2, 14], unitPx=40.

V2 full math curves (especially trig oscillations and log asymptotes) may
need a different coordinate window. Review before implementation:

| Concern | Check |
|---------|-------|
| **Trig amplitude** | Do sin/cos curves with typical coefficients (a=1–3) stay within y∈[-2, 14]? |
| **Log domain** | Log functions require x > 0 (shifted). Does x∈[-3, 25] provide enough usable domain? |
| **Cubic range** | Cubic polynomials grow fast. At x=25, x³=15625. Need coefficient constraints to keep curves on screen. |
| **Endpoint visibility** | The endpoint must be in a region where all curve types have valid domain. |

### Action

| File | Action |
|------|--------|
| `shared/game-constants.json` | May need to adjust `grid.bounds`, `canvas` dimensions, or `unitPx` based on curve rendering tests |

If the current coordinate system works with reasonable coefficient constraints,
keep it. Document the coefficient bounds in `curve-types.ts`.

---

## 1.10 Game Engine Wiring Foundation

V1 `useGameLoop.ts` wires systems in order: placement → combat → movement →
wave → buff → economy → renderers. V2 adds ~8 new systems across later
phases.

### Phase 1 Changes

| File | Action |
|------|--------|
| `frontend/src/composables/useGameLoop.ts` | Refactor — extract system registration into a pluggable list so later phases can insert new systems without rewriting the wiring each time. Add IA result state and path-visibility toggle. |

### System Registration Pattern

```typescript
// Instead of hardcoded wiring:
const systems: GameSystem[] = [
  placementSystem,
  combatSystem,
  movementSystem,
  waveSystem,
  buffSystem,
  economySystem,
];
// Later phases push: magicTowerSystem, radarTowerSystem, etc.
```

Each subsequent phase adds its systems to this list. The wiring order is
documented in the README.

---

## 1.11 Remove V1 Path Infrastructure

| File | Action |
|------|--------|
| `frontend/src/data/path-segment-types.ts` | Remove (5 piecewise segment kinds) |
| `frontend/src/domain/path/path-validator.ts` | Rewrite or remove — validation logic changes entirely |
| `frontend/src/domain/path/path-progress-tracker.ts` | Modify — track enemy progress along a continuous curve instead of segment chain |

---

## Acceptance Criteria

- [ ] All 5 function families (linear, quadratic, cubic, sin/cos, log) can be
      evaluated and rendered as smooth curves on the canvas.
- [ ] Reverse-generation produces k paths that share exactly one intersection
      point in [a, b], verified by numerical scan.
- [ ] Spawn points correctly computed as curve-boundary intersections.
- [ ] Difficulty table encodes all multisets from V2.md Section 5; a random
      level can be generated for each star rating.
- [ ] Initial Answer UI presents a multiple-choice question; correct/wrong/pay/ignore
      outcomes correctly set IA value and path visibility.
- [ ] Paths render in visible mode and are fully hidden in ignore mode.
- [ ] V1 piecewise path code is removed; no dead code remains.
- [ ] Level selection UI shows star-rated options; selecting one generates and starts a level.
- [ ] KaTeX integrated; `<MathDisplay>` component renders LaTeX strings correctly.
- [ ] Canvas coordinate system reviewed; coefficient bounds documented or grid adjusted.
- [ ] `useGameLoop.ts` refactored to pluggable system registration pattern.
- [ ] Path groups type-5 (B-only), type-6 (C-only), type-7 (A+B+C) defined and functional.
