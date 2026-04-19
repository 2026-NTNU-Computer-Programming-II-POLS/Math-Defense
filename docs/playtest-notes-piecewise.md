# Phase 8 — Playtest & Polish Notes (Piecewise Paths)

> Scope: Phase 8 of `Piecewise_Path_And_Buildable_Positions_Construction_Plan.md`.
> Purpose: record what was tuned in Phase 8, what was deliberately **not**
> tuned (and why), and the analytical basis for both. This document is
> referenced by each Phase 8 commit in lieu of a live playtest log until
> live playtest data is collected on `main`.

## 1. Methodology

Phase 8 is described by the plan (§10.1) as "open-ended by design" and
driven by playtest data. At the time this phase was executed the feature
was not yet shipped to `main`; no live playtest session had produced
numeric evidence of a regression from the deterministic-path change.

Rather than invent playtest numbers, tuning in this pass is split into
two buckets:

1. **Analytical changes** — adjustments that follow from closed-form
   analysis of the new deterministic path (P8-T4, P8-T5).
2. **Deferred changes** — adjustments that require observed session data
   to justify (P8-T1 HP/waves, P8-T2 buildable density review, P8-T3
   tower costs). These are left at current values and the reasoning is
   recorded below so a future playtest can compare against a documented
   baseline.

Per plan §10.4 ("balance changes may require updating numeric assertions
in specific wave tests; such updates must not hide regressions"),
numeric changes are only committed when we can point at the source of the
change. Silent rebalance is not a Phase 8 output.

## 2. P8-T1 — Enemy HP & Wave Counts (deferred)

**Decision:** no HP or wave-size changes in this pass.

**Baseline (current values in `frontend/src/data/enemy-defs.ts`):**

| Enemy | maxHp | speed | reward | damage |
|---|---:|---:|---:|---:|
| Basic Slime | 30 | 2.0 | 15 | 1 |
| Fast Slime | 15 | 4.0 | 20 | 1 |
| Tank Slime | 100 | 1.0 | 40 | 2 |
| Split Slime | 40 | 2.0 | 25 | 1 |
| Stealth Slime | 35 | 2.0 | 30 | 1 |
| Boss Dragon | 500 | 0.8 | 200 | 99 |

**Analytical sanity check (Function Cannon vs Basic Slime, Level 1):**

- FC: damage 20, cooldown 1.5 s, range 15 → 13.3 DPS.
- L1 path x-range: `[-3, 25]`, total length ~28 world units; basic slime
  speed 2.0 → ~14 s traversal.
- A single FC placed on the `y = 8` shelf near the quadratic dip
  (vertex at `(10, 2)`) has the slime in range for ~6 s → ~80 damage
  dealt per enemy, vs 30 HP. One FC trivializes wave 1.

This is expected for a teaching level. The question for playtest is
whether waves 2 and 3 (6 and 8 basic slimes respectively) still feel
like a step-up when a player has only one tower, which depends on
gold pacing, not HP — so the HP values are left alone.

**What a playtest should look for before tuning:**

- L2: whether the sinusoidal traverse at `y ≈ 10` causes Fast Slimes
  to out-run Function Cannons placed on the `y = 3` shelf (range 15 →
  border of coverage at vertical distance 7). If yes, reduce Fast
  Slime speed or increase FC range rather than nerfing HP.
- L3: whether Tank Slimes take disproportionate focus fire at the
  quadratic vertex `(14, 2)` because the deterministic path makes the
  chokepoint obvious. If HP feels light, bump Tank HP by ~15 % before
  touching wave counts.
- L4: whether the 5-wave Boss run exhausts player gold before wave 5
  spawns. The Boss is designed to be a binary win/lose check (damage
  99 to player maxHp 20), so pacing of waves 1–4 is the real dial.

## 3. P8-T2 — Buildable Density (reviewed; no change)

**Decision:** densities are already within the §10.3 bands; no cells
added or removed.

| Level | Buildable cells | §10.3 band | Status |
|---|---:|---|---|
| L1 Grassland | 20 | wide (teaching) | ✓ |
| L2 Canyon | 20 | ~20 | ✓ |
| L3 Fortress | 14 | 12–16 | ✓ |
| L4 Dragon Lair | 10 | narrow (boss) | ✓ |

Spatial distribution was also reviewed:

- L1 has a dominant `y = 8` shelf with 12 co-linear cells — this is
  intentional for the teaching level, but a playtest should confirm
  that players do not just place every tower on that single row and
  ignore the `y = 10` overwatch row.
- L3 has only three cells around the quadratic vertex (`[13,5]`,
  `[14,6]`, `[15,5]`). This is a tight cluster by design — the
  deterministic dip makes it the correct placement, and the cost of
  the correct answer is that it has no redundancy against Matrix Link
  positioning. Watch for this in playtest.
- L4 boss-lair cells are sparse at y=10 (six cells spaced 4 apart) and
  four corner cells at y=5. With `FOURIER_SHIELD` free (cost 0), the
  player is expected to always have one free placement slot; verify
  this assumption does not trivialize the boss.

## 4. P8-T3 — Tower Cost Tuning (deferred)

**Decision:** no cost changes. The existing cost ladder (40 / 50 / 60 /
80 / 100 / 0) is already known-balanced under the old random-path
system. Moving to deterministic paths does not directly change tower
economy — it changes *placement optimality*, which is better measured
in a playtest than predicted analytically.

**What a playtest would change:**

- If Function Cannon becomes strictly dominant on every level because
  deterministic paths make its hit-point calculation trivial, raise
  its cost from 50 → 60 (same as Radar Sweep) before nerfing damage.
- If Integral Cannon's area-of-effect becomes under-utilized because
  players now know where the enemy path goes and prefer single-target
  Function Cannons, lower its cost from 100 → 80 rather than buffing
  damage.

Both options are reversible in a single-line `tower-defs.ts` edit;
neither is warranted without data.

## 5. P8-T4 — Art Pass & Colour-Blind Accessibility (applied)

**Change:** `frontend/src/engine/render-helpers/tile-style.ts`.

Old palette:

| Class | Fill | Border | Border style |
|---|---|---|---|
| path | `#2a3426` | `#4aab6e` (green) | solid |
| buildable | `#2a2536` | `#c89848` (amber) | dotted |
| forbidden | `#1a1520` | — | hatching |

Problem surfaced by colour-blind simulation:

- Under **deuteranopia** and **protanopia**, green (`#4aab6e`) and
  amber (`#c89848`) collapse toward a similar olive tone. The dotted
  vs. solid distinction still reads, but the primary colour cue
  (green = path, amber = buildable) is lost.
- `buildable` fill (`#2a2536`) and `forbidden` fill (`#1a1520`) differ
  by only ~10 luminance units. When a tower sprite is painted on top
  of a buildable cell and occludes its dotted border, the fill alone
  is nearly indistinguishable from forbidden under reduced contrast.

New palette:

| Class | Fill | Border | Border style |
|---|---|---|---|
| path | `#2a3426` (unchanged) | `#4aab6e` green (unchanged) | solid |
| buildable | **`#2f2a44`** (lighter violet) | **`#4a82c8`** blue | dotted |
| forbidden | `#1a1520` (unchanged) | — | hatching |

Rationale:

- **Blue `#4a82c8`** preserves its blue channel under deuteranopia and
  protanopia, so it remains clearly distinct from the green path
  border regardless of simulator. This exact value is already used as
  the FunctionPanel curve stroke, so the change does not introduce a
  new accent into the global palette — it simply stops overloading the
  amber token, which the Probability Shrine, Fourier tower, and HP
  mid-bar already own.
- The buildable **fill** was lifted from `#2a2536` → `#2f2a44`: a +9
  luminance delta against forbidden `#1a1520` that gives a readable
  fill contrast even without the border.
- Path fill kept as-is because its green border already carries the
  classification signal and changing the fill would affect the
  emotional read of "safe vs. enemy territory" established in the
  existing art direction.
- Hatching on `forbidden` remains the final fallback: if both other
  cues fail for any reason (very low-gamut display, extreme
  accessibility mode), the diagonal lines are a pattern cue that
  survives full desaturation.

Simulator check (applied manually against Deuteranopia / Protanopia /
Tritanopia by running the new hex values through a standard CB
transform matrix):

- Path border vs. buildable border: distinguishable under all three.
- Path fill vs. buildable fill vs. forbidden fill: three readable
  tiers under all three.
- Border-gone scenario (tower sprite occludes the border): fill-only
  contrast between buildable and forbidden is readable under all three.

Tests in `tile-style.test.ts` do not pin specific hex values; they
assert the *invariants* (`hatching: true` on forbidden, `dotted` on
buildable, `solid` on path). The new palette satisfies all of them.

**Known unresolved CB gap (pre-existing, NOT fixed in this phase).**
`Renderer.drawPlacementCursor` (`engine/Renderer.ts` around line 173)
hard-codes the tower-placement cursor outline as green `#6adf8a` for
legal cells and red `#b84040` for illegal cells. Red vs. green is the
canonical deuteranopia/protanopia collision, so this cue is **not**
reliable for affected players. It is deliberately out of scope for
Phase 8 because:

1. The cursor cue is redundant with the under-cursor tile classification
   (which carries the retuned palette plus hatching), so the accessibility
   signal is not lost — it is merely less immediate.
2. Moving the cursor colours would also touch tower-placement-specific UX
   and risk a visual regression outside the scope of this phase.

A follow-up is warranted: swap the legal/illegal pair for a shape cue
(e.g. a solid ring vs. a dashed-cross) so shape carries the signal and
colour can be demoted to decoration.

Corrected note on `imageSmoothingEnabled`: an earlier draft of this
phase set `ctx.imageSmoothingEnabled = false` on the FunctionPanel plot
context. That flag only affects `drawImage` and pattern scaling; it has
no effect on vector `stroke()`/`fill()` AA. The flag was removed; the
crispness fix comes entirely from the `Math.round(y) + 0.5` pixel-snap
on the axis stroke and the rounded `lineCap`/`lineJoin` on the curve.

## 6. P8-T5 — FunctionPanel Polish (applied)

**Changes:** `frontend/src/components/game/FunctionPanel.vue`.

1. **Canvas plot crispness.**
   - Axis `y` coordinate snapped to `Math.round(y) + 0.5` so the 1 px
     stroke renders on a single pixel row instead of smearing across
     two. This is the actual source of axis crispness.
   - Curve drawn with `lineCap: 'round'` / `lineJoin: 'round'` so the
     polyline joins cleanly at every sample without sharp mitres that
     fight the built-in stroke AA.

2. **Typography.**
   - `.fn-expr`: added `line-height: 1.25`, `letter-spacing: 0.2px`,
     `font-variant-numeric: tabular-nums`. Monospace math looks better
     with slight tracking, and tabular figures keep the coefficients
     aligned when the expression updates on segment change.
   - `.fn-seg`: same tabular-nums treatment + a 120 ms colour
     transition so the active/past/upcoming state flip is not jarring
     when a boundary is crossed.

3. **Segment list scroll behaviour.**
   - `overscroll-behavior: contain` stops page-level scroll bleed-
     through when the player flicks the in-panel list on trackpads.
   - Custom thin scrollbar (`scrollbar-width: thin` + WebKit pseudo
     elements) in the same ochre accent colour as the panel border,
     so a long level with many segments doesn't show an OS default
     scrollbar in an otherwise tightly art-directed panel.

4. **Keyboard focus visibility.**
   - `.fn-seg:focus-visible` adds an inset 1 px gold outline. The
     segment list is keyboard-reachable (`tabindex="0"`) for the
     hover-highlight round-trip, so focus needs a visible state
     distinct from the mouse-hover state.

## 7. Deferred / Follow-ups

- Real playtest session on `main` post-flip. The most important
  observations to capture are listed in §§2, 3, 4 above.
- Balance assertion tests in wave specs may need updating after that
  playtest; per plan §10.4 any such update must be accompanied by a
  line in this document naming the playtest finding that justified it.
- If future accessibility work adds a high-contrast mode, the palette
  here is the baseline the HC mode deviates from.
