# Spell Re-skin Plan

> **Status:** **Ready to implement** as of 2026-05-16. Gameplay-owner decisions on the four open questions in [§2](#2-design-decisions-recorded-2026-05-16) are recorded inline below. Implementation may begin at Phase 0.

**Parent.** [`Visual_Redesign_Plan.md`](./Visual_Redesign_Plan.md) line 727–735 explicitly defers spell re-skinning to "a follow-up plan" so the parent stays tractable. This is that plan.

**Why now.** Parent Phase 6 has shipped — towers are math instruments, enemies are math-error glyphs, pets are cyan-fringe math helpers. Spells (`SpellEffectRenderer.ts`, `data/spell-defs.ts`) are still on their pre-redesign visual language (lit circles, radial rays, sparkles), so the combat surface visibly splits into "math vocabulary" + "FX-pack vocabulary". Parent Risk Register line 775 caps the acceptable mismatch window at **one milestone after Phase 6**. We are inside that window.

**Out of scope.**
- Spell *mechanics* — costs, cooldowns, damage, radii, target modes. All of those stay exactly as `data/spell-defs.ts` defines today. Re-skin only.
- Spell *audio*. Audio polish is tracked in a sibling plan (TBD); the visual events introduced here will be handed to the audio owner at the end of Phase 0.
- New spells. The roster stays at the four in `SPELL_DEFS`.

**Estimated effort.** 2–3 working days — Option A (glyph rewrite) was chosen (see [§2.3](#23-scope-a-vs-b)).

---

## 1. Current State (audit)

| Surface | File | Today |
|---------|------|-------|
| Spell definitions | `frontend/src/data/spell-defs.ts` | 4 spells: `fireball` / `slow` / `lightning` / `haste`. Each has `color`, `vfxDuration`, `targetMode`. |
| VFX renderer | `frontend/src/renderers/SpellEffectRenderer.ts` (785 lines) | Single class with per-spell private draw methods. Subscribes to `Events.SPELL_EFFECT`. Already deterministic (`seededUnit` / `seedFor`). Already wires `LEVEL_START → clear()`. **Does not** extend `EffectLayer`. |
| HUD icon | `frontend/src/components/game/SpellBar.vue` | Currently colored chip per spell, no glyph. |
| Manual | `frontend/src/components/common/ManualModal.vue` + `utils/manualSections.ts` | References each spell by name + a short description. No procedural preview. |
| Event surface | `Events.SPELL_EFFECT` (existing) | Already in `EVENT_HANDLER_REGISTRY`. No new events expected. |

**What's already aligned.** Determinism, replay safety, `LEVEL_START` clear contract — all in place from the original `SpellEffectRenderer` build.

**What clashes with the redesign.**
- No glyph silhouette; spells read as "FX-pack" not "math".
- No chromatic-aberration fringe (the parent plan's shared "this is a math symbol" treatment).
- Palette is per-spell with no shared discipline; towers/enemies/pets each carry their identity colour + structural slate + white-highlight, no extra hues. Spells do not respect that.
- `SpellEffectRenderer` predates the `EffectLayer` base added in parent Phase 0 — it is the last renderer not using it. Cleanup belongs here.

---

## 2. Design Decisions (recorded 2026-05-16)

Pet 6.5-A mapped each entity to a math symbol that read as the entity's *function* (`½` for slow, `→` for fast, `×` for heavy). Spells get the same exercise, but they are *actions* not *creatures*, so the glyph reads as a verb / operator.

### 2.1 Glyph mapping per spell — **Decided**

| Spell | Mechanic | Glyph | Rationale |
|-------|----------|-------|-----------|
| Fireball | AoE damage burst | `eˣ` | Exponential blow-up reads as "explosive damage". |
| Frost Nova | AoE slow toward zero | `lim → 0` | Enemy speed limits to zero. Collision with Regenerator's `lim` accepted — distinguished by motion (see §2.4). |
| Lightning | Single-target spike | `δ` | Dirac delta — canonical "single-point spike" symbol. |
| Haste | Self / all-tower speed buff | `d/dt` | Derivative of position reads as "go faster". |

Each glyph appears in three places: `SpellEffectRenderer` canvas body, `SpellBar.vue` icon, `ManualModal` section header. **The mapping holds across all three** or the redesign reverts to its current incoherence.

### 2.2 Fringe colour for the third category — **Decided: α Gold-only**

Parent plan uses cyan/magenta fringe for hostile glyphs (enemies) and cyan-only fringe for allied glyphs (pets). Spells are a third category — *player actions* — so they need a distinct fringe signal.

**Chosen:** **α — Gold-only fringe** (`#ffd700` / `#c47206`). Reuses the parent plan's existing gold tokens (axis, T2 rim) so spells read as "player resource". Three-way signal stays clean:

| Category | Fringe |
|----------|--------|
| Enemies (hostile) | Cyan / Magenta (`#00d6ff` / `#ff2bd6`) |
| Pets (allied entity) | Cyan-only (`#7df3ff` / `#00d6ff`) |
| Spells (player action) | **Gold-only (`#ffd700` / `#c47206`)** |

Implementation note: `drawGlyphBody`'s existing `fringeColors?: readonly [string, string]` option (added in Phase 6.5-A) already supports this — spells pass `['#ffd700', '#c47206']` at every callsite, no new primitive needed.

### 2.3 Scope: A vs B — **Decided: A (glyph rewrite)**

**Chosen:** **A — Glyph rewrite.** Replace each spell's current radial/burst geometry with a glyph-centred composition. Fireball = `eˣ` rising from cast point with shockwave; Frost Nova = `lim → 0` contour collapsing inward; Lightning = `δ` spike connecting tower → target; Haste = `d/dt` arrow rising above each tower. ~2–3 days. Closes the visual mismatch fully — the parent plan's whole thesis is that **silhouette communicates identity**; fringe over non-glyph silhouette is fringe-as-decoration, not fringe-as-language.

### 2.4 Frost Nova vs Regenerator `lim` collision — **Decided: accept, distinguish by motion**

**Chosen:** **Accept the symbol collision; distinguish by motion.**

| Surface | `lim` behaviour |
|---------|------------------|
| Regenerator enemy | Static glyph inside a slowly rotating dashed regen ring; the glyph itself does not move. |
| Frost Nova spell | Glyph appears at cast point and the surrounding contour rings **collapse inward toward 0** over `vfxDuration`. |

Phase 1b implementation must keep the contour-collapse animation visible (not pruned by reduced-motion); the collapsing motion is the load-bearing differentiator from the enemy. Under reduced-motion the spell still drops the collapse animation but the **glyph reads `lim → 0`** (with the arrow), whereas the enemy reads `lim` alone — text is the fallback differentiator. If playtest shows lingering confusion, fall back to `→ 0` as a separate glyph and revisit this decision.

---

## 3. Architecture & Foundations

Same five Guiding Principles as the parent plan (event-driven, procedural canvas, lifecycle uniformity, determinism preserved, layered-not-coupled, reduced-motion respect, per-phase demoable, English-only source, pause-safe). Three specific obligations beyond those:

1. **Extend `EffectLayer`.** `SpellEffectRenderer` is the last renderer that hand-rolls its event subscription + clear() lifecycle. Migrating to the base is Phase 0 here, separate from the visual work so a regression is bisectable.
2. **Reuse `drawGlyphBody`.** Per-spell draw methods must compose with the same primitive that enemies and pets use, with the chosen fringe palette from §2.2. No spell hand-rolls its own fringe.
3. **`ANIM` durations.** Any new timing constants land in `data/constants.ts` `ANIM` — never inlined. Phase 7-tuning lands in the same diff.

---

## 4. Phase Breakdown

### Phase 0 — Foundations (≈0.25 day) ⛏️ no visible change

**Goal.** Refactor `SpellEffectRenderer` to extend `EffectLayer` without changing any visual.

1. Change class signature to `class SpellEffectRenderer extends EffectLayer<SpellVfx>`.
2. Move event subscription into `init(game)` (`super.init(game)` first, then `this.unsubs.push(...)`).
3. Replace `this._effects` with the base's `effects`, replace ad-hoc `update` with the base's age-and-cull loop.
4. Drop the hand-rolled `LEVEL_START → clear()` subscription (base handles it).
5. Add `EVENT_HANDLER_REGISTRY` entry for the base's `LEVEL_START` if not already there (parent Phase 0 should have covered this — verify).

**Acceptance.** All gates green. `npm run test` 523/523 (or whatever the baseline is at branch tip). Spells visually identical to `main`.

---

### Phase 1 — Per-spell glyph bodies (≈1.5 days, Option A)

**Goal.** Replace each spell's draw method with a glyph-centred composition using `drawGlyphBody` + the chosen fringe palette.

**Shared rules** (mirror parent §5 / §6 disciplines):
- Common silhouette: glyph fits a ~28–36 px bounding box at cast time, scales with `radius` for area spells.
- Common palette: glyph fill = spell's `color`; fringe = chosen palette from §2.2; structure stroke = `stoneDark`.
- Common animation envelope: each spell has a 2-phase lifetime (cast → resolve) inside `vfxDuration`. No spell sprouts a third sub-effect outside that window.

**Per-spell sub-phases.**

- **1a — Fireball.** Glyph rises from cast point, shockwave ring radiates outward at glyph size × `radius`. Damage frame at t≈0.3 of vfxDuration (visually punctuates the actual `damage` resolution).
- **1b — Frost Nova.** `lim → 0` glyph centres at cast point; concentric contour rings collapse inward (toward 0) over vfxDuration; affected enemies pick up their existing frost overlay.
- **1c — Lightning.** `δ` glyph appears at target; a high-tension polyline connects nearest tower → target with chromatic offset (mirrors the chromatic fringe). Short vfxDuration so the spike reads as instantaneous.
- **1d — Haste.** `d/dt` glyph spawns over each affected tower with a brief upward drift + colour pulse. Loops gently for the spell `duration` (8s) — distinct from the cast moment which is one shot.

**Per-spell task shape.**

For each spell:
1. Replace its private `_draw<SpellId>` in `SpellEffectRenderer.ts`.
2. **Required UI-shadow updates:**
   - `SpellBar.vue`: chip becomes mini-glyph (scaled `drawGlyphBody` snapshot or static SVG-of-glyph).
   - `ManualModal.vue` + `utils/manualSections.ts`: spell sections show the new glyph + a one-line description of the math motivation. Grep each spell id before merging.
3. Per-spell render-smoke test (`SpellEffectRenderer.test.ts`, new file). Stub `CanvasRenderingContext2D`; assertion is "does not throw". Pattern matches `EnemyRenderer.test.ts` / `PetRenderer.test.ts`.

**Acceptance.**
- All four spells render with glyph silhouettes.
- `SpellBar` and `ManualModal` show the new glyphs — no surface left on old chips.
- Determinism preserved (replay regression on three seeds).
- `npm run test`, `npm run arch-check`, `npm run no-raw-px`, `npm run event-registry-check`, `npm run lint-determinism`, `npm run lint-chinese-comments` all green.

---

### Phase 2 — Reduced motion + polish (≈0.5 day)

**Goal.** Honour `prefers-reduced-motion` and finalise timings.

1. Wire `prefersReducedMotion()` (parent Phase 7 added `@/utils/reducedMotion`) into each spell branch:
   - Fireball: drop the shockwave ring, keep the glyph + a static colour flash.
   - Frost Nova: drop the contour collapse animation, keep the glyph + the frost-overlay application on affected enemies.
   - Lightning: drop the chromatic offset on the connecting polyline, keep the glyph + a single static stroke.
   - Haste: drop the upward drift + pulse, keep the static glyph above each tower.
2. Update `Math_Defense_Spec.md §4.1` "Reduced-motion contract" to add the spell line.
3. Tuning pass on the glyph sizes / vfxDurations (likely already correct from §3 ANIM table, but playtest at 1× and 2× game speeds per parent Phase 7 task 1).

**Acceptance.** Playtest at both speed multipliers, reduced-motion toggled on/off. Identity glyphs stay visible in all four states; only motion intensity changes.

---

## 5. Spec & Memory Updates

1. Update `Math_Defense_Spec.md §4.1`: change the "Spells — re-skin deferred" paragraph to "Spells — re-skin completed" with a one-line summary of the chosen glyph mapping and fringe palette decision.
2. Update `memory/project_visual_redesign.md`: change the "Deferred (out-of-scope)" line about spells to past tense; add a line under "How to apply" describing the spell glyph + fringe rules.

---

## 6. Risk Register

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `lim → 0` for Frost Nova reads as the Regenerator enemy glyph (`lim`) and confuses the player. | Medium | Distinguish by motion (Regenerator's `lim` is static inside a rotating ring; Frost Nova collapses inward). If still ambiguous in playtest, fall back to `→ 0` as a separate glyph string. |
| Per-spell glyph rewrite breaks the deterministic replay path. | Low | All RNG already routes through `seededUnit(seedFor(spellId, x, y, ...))`. New geometry must not introduce `Math.random()`; `npm run lint-determinism` catches this. |
| Chromatic fringe over short-lifetime spells (Lightning at 0.85s) is too brief to read. | Medium | Phase 2 tuning pass — lengthen `vfxDuration` if needed, or thicken the fringe offset specifically for short-lifetime spells. |
| Glyph rendering looks crowded with multiple spells active. | Low | Spells are gated by cooldown (12–25 s); overlapping is rare. If it happens, the EffectLayer's lifetime culling keeps the screen clean. |
| Manual / SpellBar mini-glyph rendering across OS Unicode falls back inconsistently. | Medium | Reuse `GLYPH_BODY_FONT_STACK` from `primitives.ts`. Same font fallback chain that enemies / pets already validated. |

---

## 7. Acceptance Criteria (Whole Plan)

- All four spells use the new glyph vocabulary with the chosen fringe palette.
- `SpellBar` and `ManualModal` show the same glyphs as the canvas — no surface left on the old chip art.
- `prefers-reduced-motion` honoured per Phase 2 contract.
- Three saved replays from the regression suite reproduce frame-for-frame.
- Every new `eventBus.on(...)` (none expected in this plan, but verify) has a matching entry in `engine/event-handlers/registry.ts`.
- All new files / touched files carry English-only comments.
- `npm run test`, `npm run arch-check`, `npm run no-raw-px`, `npm run event-registry-check`, `npm run lint-determinism`, `npm run lint-chinese-comments` all pass.
- `Math_Defense_Spec.md §4.1` updated; `memory/project_visual_redesign.md` updated.

---

## Appendix A — File Touchpoint Index

| File | Phase | Change |
|------|-------|--------|
| `frontend/src/renderers/SpellEffectRenderer.ts` | 0, 1 | Extend `EffectLayer`; replace per-spell draw methods. |
| `frontend/src/renderers/SpellEffectRenderer.test.ts` | 1 | New — render-smoke per spell. |
| `frontend/src/data/spell-defs.ts` | 1 (optional) | If a spell needs a new `vfxDuration`, edit here only — never inline. |
| `frontend/src/data/constants.ts` | 2 | Add any new `ANIM.SPELL_*` durations if Phase 2 tuning identifies any. |
| `frontend/src/components/game/SpellBar.vue` | 1 | Replace chip with mini-glyph. |
| `frontend/src/components/common/ManualModal.vue` | 1 | Update spell section content. |
| `frontend/src/utils/manualSections.ts` | 1 | Same. |
| `Math_Defense_Spec.md` | 5 | §4.1 "Spells" paragraph: deferred → completed. |
| `memory/project_visual_redesign.md` | 5 | Move spell line out of "Deferred" block. |

---

## Appendix B — Design Decisions Log (closed 2026-05-16)

| # | Question | Decision |
|---|----------|----------|
| 1 | Glyph mapping for each spell | `eˣ` / `lim → 0` / `δ` / `d/dt` (Fireball / Frost Nova / Lightning / Haste) |
| 2 | Fringe palette for spells | α — Gold-only (`#ffd700` / `#c47206`) |
| 3 | Scope: A (glyph rewrite) vs B (fringe-only) | A — full glyph rewrite |
| 4 | Frost Nova vs Regenerator `lim` collision | Accept; distinguish by motion (Frost Nova's contour collapses inward, Regenerator's `lim` is static) |

All four decisions ratified by the gameplay owner. Plan is implementation-ready.
