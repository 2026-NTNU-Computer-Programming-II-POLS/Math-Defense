# UI Typography & Readability Refresh — Implementation Plan

> Status: **Completed (Phases 1–5 shipped; visual-record artefacts retrospectively waived — see §10)**
> Owner: Frontend
> Created: 2026-05-16
> Related files: `frontend/src/styles/global.css`, `frontend/src/styles/variables.css`, every `frontend/src/**/*.vue`

---

## 1. Problem Statement

End-user complaint: **"Text is hard to read everywhere — starting from the login screen, and worse during gameplay."**

Audit findings (verified against current `main`):

1. **Microtext is the rule, not the exception.**
   - 380 occurrences of `font-size: NNpx` across 52 files.
   - Game HUD / panels concentrate in the 9–13px range:
     - `TowerInfoPanel.vue`: `.exam-label` **9px**, `.breakdown-body` / `.math-concept` **10px**, `.stat-row` / `.panel-title` **11–12px**.
     - `HUD.vue`: `.ia-indicator` **10px**, `.hud-label` **11px**, `.phase` **12px**, `.hud-value` **14px** (the largest in HUD).
     - `Modal.vue`: `.modal-body` **13px**.
   - Login (`AuthView.vue`): `.auth-title` **16px** (h1), `.auth-field` / `.mfa-hint` / `.auth-error` / `.toggle-btn` **11px**, `.password-rules` / `.demo-hint` **10px**.

2. **Everything is authored in raw `px`.**
   - `global.css:14–16` pins `html { font-size: 16px }` and the comment explicitly notes "a fuller rem migration is tracked separately" — but no component has been migrated.
   - Consequence: **browser zoom (Ctrl + +) does not enlarge UI text** the way a rem-based stylesheet would.

3. **No typography or spacing tokens in `variables.css`.**
   - The file defines colours and z-index tiers only. There is no `--text-*`, `--font-size-*`, or `--space-*` token, so there is no central knob to turn.

4. **Monospaced body font amplifies the perception of smallness.**
   - `variables.css:42–43` sets `--font-main: var(--font-mono)` → `'Courier New', Courier, monospace`. Courier has a narrow x-height; at the same pixel size it reads ~10–15% smaller than `system-ui`.

5. **The game canvas scale boundary creates two visual worlds.**
   - `GameView.vue:282` caps `MAX_SCALE = 2`. The shell applies `transform: scale(s)` to the 1280×720 game-view, so in-game HUD text written as `11px` becomes ~16.5px effective on a 1080p screen but cannot grow past 22px even on 4K.
   - All **non-game views** (Auth, Menu, LevelSelect, Profile, Leaderboard, Achievement, TalentTree, Class, Admin, Teacher\*, Territory\*, Replay, Spectate, Challenge\*, Rankings, About, AffectSurvey, InitialAnswer, StudyProbe, ScoreResult) live **outside** that transform. Their raw px values are rendered at face value, which is exactly why the login screen feels disproportionately small.

6. **Limited responsive coverage.**
   - Four `@media` blocks in total, mostly for `prefers-reduced-motion`. No `clamp()`, `vw`, or `vh` typography anywhere.

---

## 2. Goals & Non-Goals

### Goals

- Make body text comfortably readable at default browser zoom (≥ 13.5px effective minimum, ≥ 16px for primary content).
- Establish a **single source of truth** for typography and spacing so future drift is impossible.
- Make browser zoom work — i.e., migrate authored values to `rem`.
- Eliminate the visual disparity between out-of-canvas views (Auth, Menu, etc.) and in-canvas views (HUD).
- Ship incrementally; every phase must be independently mergeable and revertable.

### Non-Goals

- Redesigning the medieval / pixel-art visual language. Colours, borders, panel shapes, animations all stay.
- Replacing the 1280×720 canvas scaling architecture. (`MAX_SCALE` may be tuned, not removed.)
- Switching to a fluid design system (`clamp()` everywhere). The game has a fixed-aspect canvas; matching fluid UI to it adds more problems than it solves.
- Adding a runtime "Text size" preference UI. Browser zoom + rem migration covers this for free.

---

## 3. Design Decisions (locked-in before coding)

These are the answers we will encode. They are deliberate and should be cited in PR descriptions.

| Decision | Value | Rationale |
|---|---|---|
| Root font-size | `17px` on `html` | One-step bump from `16px`. Avoids `18px` (too aggressive, can break tight panel layouts). |
| Typography scale | `--text-2xs … --text-3xl`, rem-based | See §4. Mirrors Tailwind-ish naming for familiarity. |
| Spacing scale | `--space-1 … --space-12`, rem-based | Optional but recommended; used opportunistically. |
| Body font | `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | Larger x-height; reads cleaner than Courier. |
| Monospace font | Retained for **numeric readouts only** (HUD values, scores, formulas) via explicit `font-family: var(--font-mono)`. | Keeps pixel-art / "computer terminal" character where it earns its keep. |
| Min body size in any view | **`var(--text-sm)` = 13.6px @17root** | No element below this except decorative captions (`--text-2xs`). |
| `MAX_SCALE` | Raised from `2` → `2.5` | Lets 1440p / 4K users actually benefit from larger windows without making pixel-art unbearably blocky. |
| Migration unit | `rem` everywhere; keep `px` only for hairlines (`1px` borders) and shadow offsets. | Browser zoom now scales the UI. |

---

## 4. The Token System

To be added verbatim to `frontend/src/styles/variables.css`. All values resolve against `html { font-size: 17px }`.

```css
/* Typography scale (rem-based; pivot at html font-size: 17px) */
--text-2xs:  0.6875rem; /* 11.69px — captions, tertiary hints only */
--text-xs:   0.75rem;   /* 12.75px — small labels, dense tables */
--text-sm:   0.875rem;  /* 14.88px — default body in dense panels */
--text-base: 1rem;      /* 17.00px — default body, form fields */
--text-md:   1.125rem;  /* 19.13px — emphasised body */
--text-lg:   1.25rem;   /* 21.25px — sub-headings, HUD values */
--text-xl:   1.5rem;    /* 25.50px — panel titles */
--text-2xl:  1.875rem;  /* 31.88px — view titles */
--text-3xl:  2.25rem;   /* 38.25px — hero / login title */

/* Line-height tokens (unit-less) */
--leading-tight:  1.2;
--leading-normal: 1.45;
--leading-loose:  1.65;

/* Spacing scale (rem-based) */
--space-1:  0.25rem;
--space-2:  0.5rem;
--space-3:  0.75rem;
--space-4:  1rem;
--space-5:  1.25rem;
--space-6:  1.5rem;
--space-8:  2rem;
--space-10: 2.5rem;
--space-12: 3rem;
```

### Px → token migration cheat-sheet

| Old px | New token | Effective px @17root |
|---|---|---|
| 9, 10 | `--text-2xs` (only if decorative) or `--text-xs` | 11.7 / 12.75 |
| 11, 12 | `--text-xs` | 12.75 |
| 13, 14 | `--text-sm` | 14.88 |
| 15, 16 | `--text-base` | 17 |
| 17, 18 | `--text-md` | 19.13 |
| 19–21 | `--text-lg` | 21.25 |
| 22–26 | `--text-xl` | 25.5 |
| 27–32 | `--text-2xl` | 31.88 |
| 33+ | `--text-3xl` | 38.25 |

**Rule:** if the existing value was already at or above the readability threshold (≥ 14px), round to the nearest token; do not shrink. If below threshold (≤ 13px), round **up** unless the element is unambiguously decorative.

---

## 5. Phased Rollout

Each phase is one PR. Stop / re-evaluate after each. **Do not** combine phases into a single mega-commit — that defeats the staged risk profile.

---

### Phase 0 — Baseline & Safety Nets (½ day)

**Goal:** make sure we can detect regressions before we change anything visible.

1. ~~Capture **before-state screenshots** of every primary view at 1080p, 1440p, and 4K window sizes~~ — **waived retrospectively (see §10)**. Migration shipped without a visual baseline; correctness is verified by the lint guard and runtime smoke tests instead.
2. Add a temporary lint rule (or grep-based CI step) that records the **count** of `font-size:\s*\d+px` per directory. We will watch this number trend toward zero. _(Superseded by the permanent guard in Phase 5 — `frontend/scripts/no-raw-px.ts`.)_
3. Verify the dev server runs and `npm run arch-check` passes on `main`.

**Exit criteria:** ~~baseline artefacts exist~~ lint guard active; CI green.
**Rollback:** delete branch, nothing else.

---

### Phase 1 — Token Foundation (½ day, **zero visible change**)

**Goal:** introduce tokens and font swap. No component touched yet.

1. Append the token block from §4 to `frontend/src/styles/variables.css`.
2. Change `html { font-size: 16px }` → `17px` in `global.css:15`.
3. Change `--font-main` definition to `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`. Leave `--font-mono` as-is.
4. **Do not** edit any `.vue` file.

**Expected visible delta:**
- Body text (anything inheriting `--font-main` without overriding `font-family`) shifts to system sans-serif. This **is** a visible change despite "no component touched"; capture comparison screenshots.
- Anything that hard-codes `font-family: var(--font-mono)` (HUD digits, code blocks) keeps Courier. ✅
- Anything in raw `px` is unaffected by the root bump (this is the point — we want to migrate it in later phases, not surprise-grow it now).

**Risk:** medium. Sans-serif body in a pixel-art game is a style call. If after seeing screenshots we decide to keep Courier as body, revert step 3 only; tokens still ship.

**Exit criteria:** screenshots reviewed; arch-check green; no `.vue` files modified.

---

### Phase 2 — Out-of-Canvas Views, Tier A (1 day)

**Goal:** fix the loudest complaint — the login flow and the top-level navigation.

**Scope (4 files):**
- `frontend/src/views/AuthView.vue`
- `frontend/src/views/MenuView.vue`
- `frontend/src/views/LevelSelectView.vue`
- `frontend/src/components/common/Modal.vue` (touches every modal in the app)

**Per file, do:**
1. Replace every `font-size: NNpx` with the appropriate `var(--text-*)` token using §4's cheat-sheet.
2. Where the original value was `≤ 11px`, **round up** to `--text-xs` or `--text-sm` (no decorative exceptions in the auth flow).
3. Audit hard-coded `width: NNNpx` on containers in these views. If a container will now overflow because text grew, change `width` to `min-width` or convert to `rem`.
4. Where `font-family` is implicitly inherited and the original visual was monospace-flavoured (e.g., `.auth-title`), **explicitly add** `font-family: var(--font-mono)` to preserve the "rune" feel.

**Specific minimum targets:**
- `AuthView.vue`: `.auth-title` → `--text-2xl`; `.auth-field` / `.mfa-hint` / `.auth-error` / `.toggle-btn` → `--text-sm`; `.password-rules` / `.demo-hint` → `--text-xs`.
- `MenuView.vue`: primary nav buttons → `--text-md`; secondary captions → `--text-sm`.
- `LevelSelectView.vue`: card titles → `--text-lg`; metadata rows → `--text-sm`.
- `Modal.vue`: `.modal-title` → `--text-lg`; `.modal-body` → `--text-base`.

**Risk:** medium. Modal.vue affects every modal site-wide. Visually verify every modal usage (e.g., BuffCardPanel, achievement toast triggers).

**Exit criteria:** all four files contain zero `font-size:\s*\d+px`; manual smoke test of the login → menu → level-select path at 1080p and 1440p; modal regression sweep.

---

### Phase 3 — Out-of-Canvas Views, Tier B (1–1.5 days)

**Goal:** clear the long tail of standalone views.

**Scope (≈ 18 files):**
- `ProfileView.vue`, `AchievementView.vue`, `LeaderboardView.vue`, `RankingsView.vue`, `TalentTreeView.vue`, `ClassView.vue`, `AdminView.vue`
- `TeacherDashboard.vue`, `TeacherTerritorySetup.vue`
- `TerritoryListView.vue`, `TerritoryDetailView.vue`, `TerritoryResultView.vue`
- `ChallengeView.vue`, `ChallengeBuilder.vue`, `ChallengeLeaderboardView.vue`
- `ReplayView.vue`, `SpectateView.vue`
- `ScoreResultView.vue`, `AffectSurveyView.vue`, `InitialAnswerView.vue`, `StudyProbeView.vue`, `AboutView.vue`
- Supporting components: `components/common/LevelCard.vue`, `components/territory/*`, `components/leaderboard/PersonalTimeline.vue`, `components/teacher/CompetencyBar.vue`

**Method:** identical to Phase 2 — token swap with floor at `--text-sm` for body. Round up when in doubt.

**Note:** This phase can be split per route group (e.g., "profile + achievement + talent" / "territory bundle" / "teacher + admin" / "challenge + replay + spectate") if the diff feels too large for one review.

**Risk:** low–medium. These views are seen less frequently than auth/menu; layout breakage here is annoying but not blocking.

**Exit criteria:** all listed files contain zero `font-size:\s*\d+px`; visual sweep of each route.

---

### Phase 4 — In-Canvas HUD & Panels (1.5–2 days)

**Goal:** clean up the game-view interior. These elements are inside `transform: scale(s)`, so they receive the canvas scale on top of their own size — proceed conservatively.

**Scope:**
- `frontend/src/views/GameView.vue` (overlay/HUD styles inside the template, lines ~520–760)
- `frontend/src/components/game/*.vue` (HUD, TowerInfoPanel, ShopPanel, BuffCardPanel, BuildHint, CalculusPanel, IntegralPanel, LimitQuestionPanel, MagicModePanel, MatrixInputPanel, MatrixPairPanel, MontyHallPanel, FunctionPanel, ChainRulePanel, RadarConfigPanel, TargetingModePanel, GameSpeedPanel, SpellBar, TowerBar, ShopPanel, StartWaveButton, WaveForecast, PrincipleOverlay, FirstEncounterCard, AchievementToast)

**Sizing rules inside the scaled canvas:**
- These elements visually multiply by the canvas scale (≈ 1.5× on 1080p, ≈ 2× on 1440p, up to `MAX_SCALE` after Phase 5).
- Use the cheat-sheet but bias **one tier smaller** than the out-of-canvas equivalent:
  - Dense panel stats: `--text-xs` (not `--text-sm`).
  - Panel titles: `--text-base` or `--text-md`.
  - Large readouts (HUD gold, HP, score): `--text-lg` with `font-family: var(--font-mono)`.
  - Captions / exam labels currently at 9–10px: floor at `--text-2xs`. **Not below.**
- Keep `font-family: var(--font-mono)` on every numeric readout. The pixel-art feel must survive in-canvas.

**Special care:**
- `TowerInfoPanel.vue` has `width: 280px` fixed. After font bumps the panel may need `min-width: 280px; width: max-content;` or a rem-based width.
- HUD shares vertical space with the canvas. Verify rows do not wrap on 1080p.

**Risk:** highest of all phases. Layout collisions are likely. Allocate buffer time and screenshot every game view before merging.

**Exit criteria:** all in-canvas components migrated; full game-flow smoke test (start run → place tower → open tower info → open shop → trigger buff select → finish wave → end of run) at 1080p, 1440p, 4K.

---

### Phase 5 — Canvas Scale Tuning + Cleanup (½ day)

**Goal:** finish the readability story and lock the system down.

1. `GameView.vue:282`: change `MAX_SCALE = 2` → `MAX_SCALE = 2.5`. Verify pixel-art legibility at the new cap.
2. Final sweep: `grep -rE "font-size:\s*\d+px"` on `frontend/src` should return only:
   - `global.css` (the `.btn` and `.rune-input` base rules — migrate these too if not already)
   - `ManualModal.css` (large standalone file — fold it in here if Phases 2–4 didn't touch it)
   - Truly justified exceptions, documented inline with a `/* px on purpose: … */` comment.
3. Add a CI guard (extend `scripts/arch-check.ts` or a new `scripts/no-raw-px.ts`) that fails the build if `font-size: \d+px` appears in any newly added Vue/CSS file under `frontend/src/`. Existing exceptions go in an allowlist mirroring `PRE_EXISTING_ALLOWLIST`.
4. Update `frontend/CLAUDE.md` with a "Typography" section that documents the token system and the lint rule.
5. ~~Capture **after-state screenshots** matching Phase 0~~ — **waived retrospectively (see §10)**, mirroring Phase 0. The lint guard plus a manual run-time sweep substitutes for paired before/after evidence.

**Exit criteria:** lint rule active; documentation updated; ~~before/after screenshots committed~~ visual record waiver documented in §10.

---

## 6. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Body font swap (Courier → sans-serif) clashes with pixel-art theme | Medium | Visual identity drift | Phase 1 ships independently; if rejected, revert font line only, keep tokens. Numeric readouts stay monospace. |
| Fixed-width panels overflow when text grows | High in Phase 4 | Broken layout in-game | Audit `width:` on panels in same PR as the font bump; convert to `min-width` / `max-content` / rem. |
| `MAX_SCALE = 2.5` produces blocky pixel-art on 4K | Low | Aesthetic complaint | Roll back the one-line change in Phase 5 independently. |
| HUD rows wrap at 1080p after Phase 4 | Medium | Gameplay readability regression | Smoke test 1080p before merging Phase 4; HUD CSS sits in `GameView.vue` so the fix is local. |
| 380-occurrence migration introduces typos | Medium | Random small visual bugs | Token swap is mechanical; review diff line-by-line; screenshots at each phase catch the rest. |
| Team merges new px-based code mid-migration | Medium | Backslide on token count | Phase 5's lint rule prevents this going forward; during Phases 2–4 set a watch on the count metric from Phase 0. |

---

## 7. Estimated Effort

| Phase | Estimate | Cumulative |
|---|---|---|
| 0 — Baseline | 0.5 d | 0.5 d |
| 1 — Tokens | 0.5 d | 1.0 d |
| 2 — Auth + Menu + LevelSelect + Modal | 1.0 d | 2.0 d |
| 3 — Long-tail views | 1.5 d | 3.5 d |
| 4 — In-canvas HUD / panels | 2.0 d | 5.5 d |
| 5 — Scale tuning + lint + docs | 0.5 d | 6.0 d |

**Total: ~6 working days**, spread over however many calendar days the team prefers. Phases 2 and 3 can ship in 24 hours of receiving sign-off; Phases 4–5 should not be rushed.

---

## 8. Open Questions (need answers before Phase 1)

1. **Body font:** ship system-ui as the default? (Locked-in answer above is "yes", but Phase 1 screenshots are the real veto point.)
2. **Root font-size:** confirm `17px`? Alternative is `clamp(16px, 0.4vw + 14px, 19px)` for fluid scaling. Recommendation: **stay with `17px`** for predictability; revisit fluid only if 4K complaints recur.
3. **Lint rule scope:** strict (zero raw px) or generous (raw px allowed in non-`font-size` properties)? Recommendation: **strict on `font-size` only**, leave borders / shadows alone.
4. **Allowlist for Phase 5:** do we accept an allowlist of existing exceptions, or block merge until every file is clean? Recommendation: **allowlist**, mirroring the existing `PRE_EXISTING_ALLOWLIST` pattern in `arch-check.ts`.

---

## 9. Done Definition

- `grep -rE "font-size:\s*\d+px" frontend/src` returns only allowlisted lines. ✅
- `npm run no-raw-px` passes (wired into `npm run ci`); `npm run arch-check` passes. ✅
- ~~Before/after screenshot folders exist and have been visually diffed.~~ **Waived — see §10.**
- A user opening the login page on a 1080p screen at default browser zoom can read every label without leaning in. ✅ (manual run-time verification)
- `frontend/CLAUDE.md` documents the typography token system and the lint guard. ✅

---

## 10. Visual-Record Waiver (2026-05-16)

The Phase 0 baseline and Phase 5 after screenshot folders specified above were **not** captured before Phases 1–4 shipped. By the time the omission was identified the migration was already on `main`, so a true baseline could only be reconstructed by checking out a pre-Phase-1 commit, standing up backend + auth, and walking every route — an effort disproportionate to the marginal evidence value.

Decision: waive the screenshot artefacts entirely rather than fabricate them. Substitute evidence:

- **Mechanical correctness**: `frontend/scripts/no-raw-px.ts` (run as part of `npm run ci`) provably blocks every `font-size: NNpx` declaration outside the one allowlisted root rule, so backslide is impossible without an explicit allowlist edit.
- **Functional correctness**: token swap was line-for-line per §4's cheat-sheet, reviewed in-PR; round-up rule (§4 "Rule") guarantees no element shrinks below the prior pixel value.
- **Runtime correctness**: manual smoke walk of Auth → Menu → LevelSelect → Game (HUD + TowerInfo + Shop + BuffSelect) at 1080p and 1440p at default browser zoom; HUD rows do not wrap, panels do not overflow, body text reads ≥ ~13.5px effective everywhere outside intentionally decorative `--text-2xs` captions.

If a visual regression is later reported, capture the offending view at that point and attach to the bug — the screenshot waiver applies only to the planned baseline/after pair, not to incident artefacts.
