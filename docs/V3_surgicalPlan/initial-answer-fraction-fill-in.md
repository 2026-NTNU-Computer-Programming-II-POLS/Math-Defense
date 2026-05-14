# V3 — Initial Answer: Fraction-Based Fill-In Rework

**Status:** Proposed
**Author:** (drafted with Claude Code)
**Scope:** Frontend (TS + Vue) and WASM (C). No backend changes.

---

## 1. Background

The pre-game **Initial Answer (IA)** screen (`InitialAnswerView.vue`) currently
shows the player the equations of every enemy path, states that all paths share
exactly one common point inside an interval, and asks the player to pick that
point from **four multiple-choice options**.

Two structural problems make a fraction-based fill-in version impossible without
changing level generation:

1. **The answer is not a rational number.** `level-generator.ts` picks the
   common point `P*` as `x0 = PLAYABLE_X_MIN + rng() * range` — a uniform random
   `float`. It has no fraction representation.
2. **The displayed equations are rounded approximations, not the real curves.**
   `curveToLatex` runs every coefficient through `fmt()` (`toFixed(2)`), but the
   true coefficients are arbitrary floats from `randRange`. A student who solves
   the *displayed* system by hand reaches a different point than the stored
   `endpoint`. The multiple-choice format hides this because distractors are
   spaced far apart, so "closest option" is unambiguous.
3. **Transcendental curves cannot be solved to a fraction at all.** Even with
   rational coefficients, the intersection of a `sin`/`cos`/`log` curve with a
   line is transcendental.

Therefore this rework is **not** a UI change — it is primarily a **level
generator rework** with a UI change on top.

## 2. Goals / Non-Goals

### Goals

- IA becomes a **fill-in question**: two inputs (`x`, `y`) instead of a
  4-option grid.
- The question is **displayed in fraction form** (KaTeX `\frac{}{}`), never
  rounded decimals.
- Answers are **entered and judged as exact rationals** (`3/2`, `-5/4`,
  integers, exact decimals).
- The level generator produces **polynomial-only** levels with **dyadic
  rational** coefficients and a **dyadic rational `P*`**, so the displayed
  equations are exact and the common point is genuinely a fraction the student
  can derive.
- Both generation paths — JS (v1) and WASM/C (v2) — are reworked so the change
  is global.

### Non-Goals

- Keeping `sin`/`cos`/`log` **enemy paths** (dropped from generation; see §4).
- Removing the `sin`/`cos`/`log` **curve types** — they remain in the codebase
  for Magic-tower function curves; only the *level generator* stops producing
  them.
- Changing the IA's "Pay 50 Gold to Skip" / "Proceed (Paths Hidden)" escape
  hatches, scoring formula, or the `iaResult` contract consumed by
  `useGameLoop.ts`.
- Backend changes. `path_config` is opaque stored JSON (audit B-C-4: currently
  dead data); the serialized `CurveDefinition` shape is unchanged.

## 3. Confirmed Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | MC → fill-in | Requested. |
| D2 | Question shown as fractions; answers judged as fractions | Requested — students solve with fractions. |
| D3 | Fraction levels use **polynomials only** | Transcendental intersections are not hand-solvable to a fraction. |
| D4 | **Replace** existing generation entirely (not a separate mode) | Requested. |
| D5 | **Keep degree 3**, with small fractional leading coefficients | Requested; accepted that solving a cubic system by hand is advanced. |
| D6 | **Rewrite `level_gen.c`** too, keeping the WASM v2 path | Requested; preserves the v2 self-determinism contract. |

## 4. The Math (correctness basis)

For a student to **solve by hand and get a fraction**, two conditions must hold,
both satisfied by construction:

1. **Exact, displayed equations.** All coefficients are dyadic rationals
   (integer multiples of `1/4`). Dyadic values are represented *exactly* in both
   `float` (C) and `double` (JS), so no rounding enters storage, display, or
   evaluation. `curveToLatex` renders them exactly.
2. **Rational `P*`.** The generator already works *backwards* — it picks `P*`
   first, then constructs curves through it. We pick `P*` as a dyadic rational,
   so it is a rational common point by construction.

### Solvability per degree pairing

Let `D(x) = curveA(x) - curveB(x)`. Both curves pass through `P* = (x0, y0)`, so
`(x - x0)` divides `D`. With rational coefficients and rational `x0`, the
cofactor is also rational.

| Pairing | `D(x)` | Student-side solve | Result |
|---------|--------|--------------------|--------|
| deg1 ↔ deg1 | linear | one linear equation | `x0` rational ✔ |
| deg1/deg2 ↔ deg2 | quadratic | quadratic formula; discriminant is a perfect square of a rational (both roots rational) | rational roots; pick the one inside the disclosure region ✔ |
| any ↔ deg3 | cubic | must use the rational-root theorem to extract `x0`; the cofactor quadratic may have irrational roots | `x0` still rational by construction, but **deriving** it is advanced (accepted, D5) |

The generator's existing uniqueness guarantee
(`countCommonIntersectionsInInterval` must return exactly 1 inside the
disclosure region) is **unaffected** — it works for polynomials as-is.

### Why degree 3 needs care

An integer/large leading coefficient makes a cubic shoot off-grid (`a·x³` at
`x=11` with `a=1` is 1331). The original generator used `a ∈ [-0.02, 0.02]` to
keep cubics gentle. Our mitigation:

- Degree-3 leading coefficient is restricted to small dyadic values
  (`±1/4`, `±1/2`).
- When a multiset contains a degree-3 entry, **`P*` is biased toward the origin**
  (`|x0|, |y0|` small) so `a·x0³` stays bounded.
- The existing rejection-sampling validators (`verifySlopeSeparation`,
  `hasTwoSpawnsPerCurve`, `findDisclosureRegion`) cull any remaining pathological
  geometry. Consequence: degree-3 curves produce **short, steep enemy paths** —
  an accepted trade-off (D5).

## 5. Architecture & Separation of Concerns

### 5.1 Layer placement (frontend layering rules in `frontend/CLAUDE.md`)

```
views/        InitialAnswerView.vue          ← presentation + trivial answer-check orchestration
   │                                            (imports math/ + utils/ ONLY — no domain/)
math/         rational.ts            (NEW)   ← pure rational primitives
              curve-evaluator.ts             ← curveToLatex uses rational.ts
              curve-types.ts                 ← COEFFICIENT_BOUNDS (polynomial-only, dyadic)
domain/       level/level-generator.ts       ← generation algorithm (imports math/ + data/)
data/         difficulty-defs.ts             ← pure multiset tables (no imports)
wasm/         level_gen.c / .h               ← C mirror of the generation algorithm
```

### 5.2 SoC decisions

- **New `math/rational.ts` is the single source of truth** for "what is a
  rational, and how do we parse / format / quantize / compare one." It is a
  pure, dependency-free module at the bottom layer, consumed by three otherwise
  unrelated callers (generator, curve renderer, IA view). This prevents the
  parsing/formatting logic from being duplicated or leaking into the view.
- **The view does not import `domain/`.** Today `InitialAnswerView.vue` imports
  `domain/level/distractor-generator` and is whitelisted in
  `scripts/arch-check.ts` `PRE_EXISTING_ALLOWLIST`. After this rework the view
  needs only `math/` (`rational.ts`, `curve-evaluator.ts`) and `utils/`
  (`parseHistoryState.ts`), so **the allowlist exception is deleted** — a strict
  improvement in layering compliance.
- **The "is the answer correct" rule stays in the view.** It is trivial point
  equality (`rationalEquals(inputX, endpoint.x) && rationalEquals(inputY,
  endpoint.y)`). The *reusable primitive* (`rationalEquals`) lives in `math/`;
  the one-line application of it is view orchestration. A dedicated domain
  module would be over-engineering for a single equality check, and the view
  cannot import `domain/` anyway.
- **Generator stays pure domain logic.** `level-generator.ts` keeps its current
  shape (pick `P*` → construct curves → reject-sample → emit `GeneratedLevel`);
  only the *numeric strategy* (continuous floats → quantised dyadic rationals)
  and the *curve families* (drop trig/log) change. No engine/view/store imports
  are introduced.
- **C mirrors the algorithm, not the bitstream.** v1 (JS) and v2 (C) are, by
  existing design, *independent* self-deterministic streams (construction plan
  §3.7). The C rewrite mirrors the *algorithm*; it does not need to produce
  byte-identical output to the JS path.

## 6. Detailed Component Changes

### 6.1 `frontend/src/math/rational.ts` — NEW

Pure, dependency-free. Exports:

- `RATIONAL_QUANTUM = 0.25` — the dyadic grid; all generated coordinates and
  coefficients are integer multiples of this.
- `quantize(value: number): number` — snap to the nearest multiple of
  `RATIONAL_QUANTUM` (used by the generator).
- `parseFraction(input: string): { num: number; den: number } | null` — accepts
  `"3/2"`, `"-5/4"`, integers (`"7"`), and exact decimals (`"1.5"`, `"-2.25"`).
  Returns a reduced rational or `null` on malformed input. Whitespace-trimmed;
  rejects `den === 0`.
- `numberToRational(value: number): { num: number; den: number }` — exact for
  dyadic inputs (multiply by a power of two, reduce). Used to convert a stored
  `endpoint` coordinate to an exact rational for comparison and display.
- `rationalEquals(a, b): boolean` — exact cross-multiply comparison
  (`a.num * b.den === b.num * a.den`). No epsilon.
- `fractionToLatex(value: number): string` — renders a dyadic value as exact
  KaTeX: integers as-is (`"3"`, `"-3"`), fractions as `\frac{p}{q}` (sign pulled
  to the front: `-\frac{5}{4}`).

> All inputs the generator produces are dyadic, so `numberToRational` is exact.
> `parseFraction` may produce a non-dyadic rational (student typo); comparison
> still works because `rationalEquals` is exact and a non-dyadic input simply
> compares unequal to the dyadic answer.

### 6.2 `frontend/src/math/curve-types.ts`

- `COEFFICIENT_BOUNDS` — drop the `trigonometric` and `logarithmic` keys
  (only `level-generator.ts` reads this object, and only its now-deleted
  trig/log branches used those keys). Replace `polynomial` with **dyadic
  coefficient specs** (proposed initial values; tune against rejection-sampling
  acceptance rate):

  | Degree | Coefficient | Allowed dyadic values | Solved term |
  |--------|-------------|------------------------|-------------|
  | 1 | slope | `±1/2 … ±3` step `1/2` (exclude 0) | intercept |
  | 2 | `a` | `±1/4, ±1/2` | — |
  | 2 | `b` | `±1/2 … ±3` step `1/2` | `c` |
  | 3 | `a` | `±1/4, ±1/2` | — |
  | 3 | `b` | `±1/4 … ±1` step `1/4` | — |
  | 3 | `c` | `±1/2 … ±2` step `1/2` | `d` |

  Express each as a discrete candidate list (or `{lo, hi, step}`) — the
  generator picks an index, not a continuous value (see §6.4).
- `CurveDefinition`, `PolynomialCurve`, `TrigonometricCurve`, `LogarithmicCurve`
  — **unchanged**. Trig/log types stay for Magic-tower curves.

### 6.3 `frontend/src/data/difficulty-defs.ts`

- `MultisetEntry` — narrow `number | 'sin' | 'cos' | 'log'` → `1 | 2 | 3`
  (alias `PolynomialDegree`).
- `MultisetDef` — **remove the `groupId` field** (set but never read anywhere;
  see §6.5). `ms()` helper drops its second parameter.
- `DIFFICULTY_TABLE` — rebuild **polynomial-only**:
  - Star 1 is already polynomial-only — keep as-is.
  - Stars 2–5 — delete every multiset containing `'sin'`/`'cos'`/`'log'`; keep
    the existing polynomial multisets; **add new polynomial multisets** so each
    star's pool stays varied (escalate by curve count and degree mix). The
    star-to-difficulty intent stays: more curves + higher degree = harder.
- `pickRandomMultiset` / `getMultisetsForStar` — signature unchanged; still pure.

### 6.4 `frontend/src/domain/level/level-generator.ts`

Rewrite the numeric strategy; keep the orchestration shape
(`generateLevel` → `tryGenerate` → reject-sample → `GeneratedLevel`).

- `tryGenerate`:
  - `x0`, `y0` — replace the continuous `PLAYABLE_* + rng()*range` draw with a
    **quantised dyadic pick**: choose an integer index over the playable dyadic
    grid, map to a value. When the multiset contains a degree-3 entry, draw
    `x0`/`y0` from a **narrower, origin-biased range** (proposed `|x0|,|y0| ≤ 4`).
  - Everything downstream (`computeSpawnPoints`, `findDisclosureRegion`,
    interval, slope separation) is unchanged.
- `generateCurveThrough` — drop the `'sin'`/`'cos'`/`'log'` branches; only
  `1|2|3` remain.
- `generatePolynomialThrough` — pick each free coefficient by **index into the
  dyadic candidate list** from `COEFFICIENT_BOUNDS.polynomial`, then solve the
  constant term from the through-point equation. Because `x0`, `y0`, and every
  picked coefficient are dyadic, the solved constant term is dyadic too (sums
  and products of dyadics are dyadic). Run the solved value through `quantize`
  defensively to erase any float noise.
- **Delete** `generateTrigThrough`, `generateLogThrough`, and the
  `randRange` helper if it becomes unused.
- Remove the `TrigonometricCurve` / `LogarithmicCurve` type imports.
- Keep `generateLevelV2*` / `generateLevelDeterministicFromSeed` — they delegate
  to the C path (§6.10) and their TS-side shape does not change.

> **Determinism note.** Preserve a fixed PRNG draw count per curve so the seed
> schedule stays stable. Quantised selection = `floor(rng() * candidateCount)`;
> this consumes exactly one draw per coefficient, same discipline as today.

### 6.5 `frontend/src/domain/level/path-group-defs.ts` — DELETE

`PATH_GROUPS` / `PathGroupId` / `PathGroupDef` are imported by no source file
(only referenced in `frontend/README.md` and historical docs). The construct
is family-based (`type-1`…`type-7` = polynomial/trig/log combinations) and is
obsolete once generation is polynomial-only. Delete the file; remove the
`groupId` field it conceptually backed from `MultisetDef` (§6.3).

### 6.6 `frontend/src/domain/level/distractor-generator.ts` — DELETE

`generateDistractors` is used **only** by `InitialAnswerView.vue`, which no
longer needs distractors in a fill-in format. (Note: `limit-evaluator.ts` has
its own unrelated local `generateDistractors`; `chain-rule-generator.ts` has its
own `distractors` set — neither is affected.) Delete the file and its test if
one exists.

### 6.7 `frontend/src/math/curve-evaluator.ts`

- `curveToLatex` / `polynomialToLatex` — replace the `fmt()` (`toFixed(2)`)
  number formatter with `fractionToLatex` from `rational.ts`. Coefficients are
  now dyadic, so this renders them **exactly** (`y = \frac{3}{4}x^2 - \frac{1}{2}x + 2`).
- `trigToLatex` / `logToLatex` — leave as-is (still used to render Magic-tower
  function curves). They may keep their local `fmt`, or also adopt
  `fractionToLatex` for consistency — non-blocking.
- `evaluate` / `evaluateDerivative` / `isInDomain` — unchanged.

### 6.8 `frontend/src/views/InitialAnswerView.vue`

- **Imports:** remove `generateDistractors` / `AnswerOption` from
  `@/domain/level/distractor-generator`. Add `parseFraction`, `rationalEquals`,
  `numberToRational`, `fractionToLatex` from `@/math/rational`. Keep
  `curveToLatex`, `parseLevelJson`, `GeneratedLevel`.
- **State:** replace `options` / `selectedIndex` with `inputX: string`,
  `inputY: string`, and a parsed/validation computed.
- **Template:** replace the `options-grid` of four buttons with two labelled
  text inputs (`x =`, `y =`) plus inline parse-error hints. Keep the
  `Submit Answer` / `Pay 50 Gold to Skip` / `Proceed (Paths Hidden)` buttons and
  the post-answer result block unchanged.
- **`submitAnswer`:** parse both inputs with `parseFraction`; if either is
  `null`, show a validation message and do not submit. Otherwise compare each to
  the corresponding `endpoint` coordinate via `rationalEquals` against
  `numberToRational(endpoint.x|y)`. `iaResult = bothEqual ? 'correct' : 'wrong'`.
- **Question display:** the equations already render via `curveToLatex` (now
  fraction-exact). Change the "common point is in `{{intervalStr}}`" line to show
  the **disclosure `region`** rectangle instead of `interval`: `region` bounds
  are `P* ± halfExtent` clamped to the integer grid, hence dyadic and cleanly
  renderable as fractions; `interval` (spawn-derived) is not. Render region
  bounds with `fractionToLatex`.
- **Wrong-answer feedback:** keep showing the correct point, rendered as
  fractions.
- `payToSkip` / `ignoreAndProceed` / `startGame` — unchanged.

> After this change the view imports only `math/` + `utils/` — see §6.11.

### 6.9 `frontend/src/math/WasmBridge.ts`

- `multisetEntryToCode` — simplify: entries are now always `1|2|3`, so it is the
  identity on the numeric code. The `MULTISET_TRIG_SIN/COS`, `MULTISET_LOG`
  constants and the string branches become dead — remove them.
- `readCurveAt` — the `FAMILY_TRIG` / `FAMILY_LOG` branches become unreachable
  for *generated* levels but `readCurveAt` is only called from
  `generateLevelDeterministic`; the branches can be kept as a harmless ABI fence
  or simplified to poly-only. Prefer simplifying with a comment, since the
  generator can no longer emit those families.
- `writeCurveTo`, `jsEvaluate`, `jsDerivative`, `jsInDomain` — **unchanged**:
  still needed to evaluate Magic-tower trig/log curves through the bridge.
- ABI constants (`GENERATED_LEVEL_BYTES = 556`, `CURVE_STRUCT_BYTES = 24`,
  `SPAWN_STRUCT_BYTES = 20`) — **unchanged** (see §7).

### 6.10 WASM C side — `wasm/level_gen.c`, `wasm/level_gen.h`

Mirror the §6.4 algorithm change.

`level_gen.c`:
- `try_generate_level` — quantised dyadic `x0`/`y0` selection; origin-biased
  range when a degree-3 entry is present.
- `generate_polynomial_through` — pick free coefficients by index into dyadic
  candidate lists; solve + quantise the constant term.
- **Delete** `generate_trig_through`, `generate_log_through`; remove their cases
  from `generate_curve_through`.
- Update the coefficient-bound constants block to the dyadic candidate lists;
  drop the `TRIG_*` / `LOG_*` constants.
- `find_pair_intersections`, `find_all_curves_common_point`,
  `compute_spawn_points`, `find_disclosure_region`, `verify_slope_separation`,
  `has_two_spawns_per_curve` — **unchanged**.

`level_gen.h`:
- Remove the now-unused `MULTISET_TRIG_SIN/COS`, `MULTISET_LOG` macros and the
  trig/log line from the wire-encoding comment.
- `generated_level_t`, `curve_t`, `spawn_t`, `generate_level` signature —
  **unchanged** (no ABI break, no `replay_version` struct bump).

`wasm/curve.c`, `wasm/curve.h` — **untouched**. Polynomial evaluation is
unchanged; trig/log evaluation stays for Magic-tower curves.

**Build:** recompile via `wasm/Makefile` (`cd wasm && make`) — requires the
`emcc` toolchain. `EXPORTED_FUNCTIONS` is unchanged, so `wasm/.../wasm-exports.ts`
does not change. If `emcc` is unavailable in the working environment, the C
source changes still land; the maintainer runs the build (e.g. `! cd wasm && make`).

### 6.11 `frontend/scripts/arch-check.ts`

Remove the `PRE_EXISTING_ALLOWLIST` entry:

```
{ fileSuffix: 'src/views/InitialAnswerView.vue', importPath: '@/domain/level/distractor-generator' }
```

The view no longer imports `domain/`, so the exception is obsolete. Leaving a
stale allowlist entry would mask a future real violation.

## 7. Determinism & Replay Contract

- **No ABI change.** `curve_t` (24 B), `spawn_t` (20 B), `generated_level_t`
  (556 B), and the `generate_level` signature are all unchanged. The TS bridge
  marshalling and `wasm-exports.ts` are untouched.
- **Two independent streams, each self-deterministic.** v1 = `generateLevel()`
  in TS seeded by `mulberry32(seed)`; v2 = `generate_level()` in C seeded by the
  PCG `prng_t`. They are independent by existing design (construction plan §3.7)
  and need not match each other — only each must stay deterministic from its own
  seed. Preserve a fixed PRNG draw count per curve so the seed schedule is
  stable.
- **Replay-compatibility break for *existing recordings*.** Because the
  generation *algorithm* changes, a previously recorded `(seed, replayVersion)`
  pair will regenerate a *different* level after this rework. Construction plan
  notes that even changing grid bounds is "a replay v3"; an algorithm change is
  equivalent. **Decision required at rollout:** either (a) accept that
  pre-existing replays no longer reproduce (acceptable mid-development — likely
  choice), or (b) introduce a `replay_version = 3` tag and branch generation on
  it. This spec assumes (a) unless the maintainer states otherwise; recorded
  sessions from before the rework should be treated as non-reproducible.

## 8. Testing Plan

There are currently **no** unit tests for `level-generator.ts`,
`difficulty-defs.ts`, `distractor-generator.ts`, `curve-evaluator.ts`, or
`InitialAnswerView.vue`. Add the following:

**New tests**
- `math/rational.test.ts` — `parseFraction` (valid/invalid/whitespace/decimals/
  zero-denominator), `numberToRational` exactness on dyadic inputs,
  `rationalEquals` (equal/unequal/cross-denominator), `fractionToLatex`
  (integers, proper/improper fractions, sign placement), `quantize`.
- `domain/level/level-generator.test.ts` — for each star, generate N levels and
  assert: all curves are `polynomial`; every coefficient and every `endpoint`
  coordinate is an exact multiple of `RATIONAL_QUANTUM`; `endpoint` is the unique
  common intersection inside `region`; degree-3 levels keep `|endpoint|` within
  the origin-biased bound; generation succeeds within the retry budget for every
  multiset in `DIFFICULTY_TABLE`.
- `math/curve-evaluator.test.ts` — `curveToLatex` renders known dyadic
  polynomials to exact KaTeX (no decimal rounding).
- `views/InitialAnswerView.test.ts` — correct fraction input → `iaResult` is
  `'correct'`; wrong input → `'wrong'`; malformed input → validation error, no
  submit; equivalent forms (`"3/2"` vs `"1.5"`) both accepted.

**Updated tests**
- `math/WasmBridge.levelgen.wasm.test.ts` — assert generated levels are
  polynomial-only with dyadic coefficients/endpoint; remove any trig/log
  expectations.
- `engine/__tests__/determinism.test.ts` — re-baseline any fixtures that pin
  generator output.
- `views/LevelSelectView.test.ts` — should still pass; verify the
  `difficulty-defs` changes do not break its imports.

**Unaffected**
- `score-calculator.parity.test.ts`, `WasmBridge.curve.*`, `WasmBridge.prng.*`,
  spawn/intersection WASM tests (curve evaluation and the intersection/spawn
  primitives are unchanged).

**Gates:** `npm run arch-check`, `vue-tsc` type-check, `npm test`, plus a manual
browser pass of the IA screen (correct answer, wrong answer, malformed input,
fraction rendering of equations and region).

## 9. Implementation Order

1. `math/rational.ts` + `math/rational.test.ts` (no dependencies).
2. `math/curve-types.ts` — reshape `COEFFICIENT_BOUNDS`.
3. `data/difficulty-defs.ts` — narrow `MultisetEntry`, drop `groupId`, rebuild
   table.
4. `domain/level/level-generator.ts` — rational generator; delete trig/log
   helpers.
5. Delete `domain/level/path-group-defs.ts` and
   `domain/level/distractor-generator.ts`.
6. `math/curve-evaluator.ts` — fraction rendering in `curveToLatex`.
7. `math/WasmBridge.ts` — simplify multiset coding / `readCurveAt`.
8. `views/InitialAnswerView.vue` — fill-in UI.
9. `scripts/arch-check.ts` — drop the allowlist entry.
10. `wasm/level_gen.c` + `wasm/level_gen.h` — mirror the algorithm; `cd wasm && make`.
11. Tests (new + updated); run all gates.
12. Update `frontend/README.md` references to the deleted files. Leave
    `docs/v2_implementation/*` as historical point-in-time records.

## 10. Risks & Open Items

| Risk / item | Mitigation |
|-------------|-----------|
| Degree-3 dyadic coefficients still produce steep, short enemy paths | Origin-biased `P*` for degree-3 multisets; rejection sampling culls the worst; bounds are tunable (§6.2). Accepted per D5. |
| Rejection-sampling acceptance rate drops with the tighter dyadic search space | Measure acceptance rate per multiset in the generator test; widen candidate lists / loosen `P*` bias if `MAX_BATCHES * ATTEMPTS_PER_BATCH` is hit. |
| Existing recorded replays no longer reproduce | §7 decision (a): accept mid-development. Escalate to a `replay_version=3` branch only if reproducing old sessions is required. |
| `emcc` toolchain may be unavailable locally | C source changes still land; maintainer runs `cd wasm && make`. No ABI change means a stale `.wasm` keeps the old generator until rebuilt — flag clearly at rollout. |
| Degree-3 hand-solving is genuinely hard for students | Accepted per D5. If feedback is poor, the lever is the difficulty table (§6.3) — reduce degree-3 frequency without further code change. |
| `MultisetEntry` narrowing ripples to unexpected consumers | Type-check (`vue-tsc`) surfaces every site; the grep audit found only `pickRandomMultiset`, `level-generator.ts`, and `WasmBridge.multisetEntryToCode`. |

## 11. File-Change Summary

| File | Change |
|------|--------|
| `frontend/src/math/rational.ts` | **New** — rational parse/format/quantize/compare primitives |
| `frontend/src/math/curve-types.ts` | `COEFFICIENT_BOUNDS` → polynomial-only dyadic specs |
| `frontend/src/data/difficulty-defs.ts` | `MultisetEntry` → `1\|2\|3`; drop `groupId`; rebuild `DIFFICULTY_TABLE` polynomial-only |
| `frontend/src/domain/level/level-generator.ts` | Rational `P*` + dyadic-coefficient construction; delete trig/log generators |
| `frontend/src/domain/level/path-group-defs.ts` | **Delete** (dead code) |
| `frontend/src/domain/level/distractor-generator.ts` | **Delete** (only IA used it) |
| `frontend/src/math/curve-evaluator.ts` | `curveToLatex` renders exact fractions |
| `frontend/src/math/WasmBridge.ts` | Simplify multiset coding / `readCurveAt`; ABI unchanged |
| `frontend/src/views/InitialAnswerView.vue` | MC grid → two fraction inputs; show `region` as fractions; no `domain/` import |
| `frontend/scripts/arch-check.ts` | Remove the obsolete `InitialAnswerView` allowlist entry |
| `wasm/level_gen.c` | Mirror the rational generator; delete trig/log construction |
| `wasm/level_gen.h` | Remove unused `MULTISET_TRIG/LOG` macros; ABI unchanged |
| `wasm/curve.c`, `wasm/curve.h` | **Untouched** |
| Tests | New: `rational`, `level-generator`, `curve-evaluator`, `InitialAnswerView`. Updated: `WasmBridge.levelgen.wasm`, `determinism` |
| `frontend/README.md` | Update references to deleted files |
| Backend | **No changes** |
