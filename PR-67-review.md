# PR #67 Review — "refactor: optimize UI architecture and components"

| | |
|---|---|
| **PR** | #67 — `refactor: optimize UI architecture and components` |
| **Branch** | `frontend` → `main` |
| **Head commit** | `2baeba0` (`style(misc-views): About / Replay / Spectate / Surveys`) |
| **Merge base** | `7c978c2` |
| **Size** | 25 commits · 40 files · +3027 / −1701 |
| **State** | OPEN · `MERGEABLE` |
| **Reviewed** | Full diff (all 40 files) + cross-checks against the PR branch and `main` |

---

## How this review was verified

1. **Branch topology was confirmed against the real PR head**, not a stale
   tracking ref. `main` is only **6 commits** ahead of the merge base, and all
   6 are dependabot/CI chores touching only `.github/workflows/ci.yml` and
   `backend/requirements.txt`. They do **not** overlap any of the PR's 40
   frontend files, so the `gh pr diff` (three-dot) output equals the real
   merge impact for the frontend. The PR is effectively up to date.
2. **Every line of the 40-file diff was read.**
3. The 5 views with `<template>`/`<script>` changes had **every template
   binding cross-checked** against their (unchanged) `<script setup>`.
4. The `variables.css` token values were **confirmed directly on the PR
   branch** (`git grep pr67`), not inferred from the diff alone.
5. The list of components that consume the re-tinted shared tokens but were
   **not** updated was enumerated directly on the PR branch.

---

## Executive summary

Despite the title, the **net effect of this PR is a full visual re-skin** to a
"Morandi cool-blue" theme — it is *not* an architecture refactor.

- **35 of 40 files are CSS-only changes** (inside `<style>` blocks).
- **Only 5 views have real `<template>`/`<script setup>` structural changes:**
  `AuthView`, `InitialAnswerView`, `LevelSelectView`, `MenuView`,
  `ScoreResultView`.
- The `feat(...)` commit messages in the PR history
  (`restructure HUD`, `shop dropdown`, `magic mode toggle`,
  `left utility bar`) **do not correspond to logic changes in the net diff** —
  those component files (`HUD.vue`, `ShopPanel.vue`, `MagicModePanel.vue`,
  `GameView.vue`) are CSS-only in the diff; the underlying template structures
  already existed at the merge base. The `ShopPanel.vue` diff comment even
  states *"Open/close logic (collapsed state) is unchanged."*

**Verdict**

| Question | Answer |
|---|---|
| **1. Does it introduce bugs?** | **Yes** — 1 critical (Monty Hall text invisible), several moderate contrast regressions, 1 mobile-layout regression. |
| **2. Does it lose existing functionality?** | **Minor losses only** — a lock icon and instructional text were dropped. Game logic is intact. |
| **3. Are there SoC violations?** | **Yes, several** — large-scale CSS duplication, a dual token system, literals bypassing tokens, a partial/inconsistent re-skin, and a typography-contract bypass. |

---

## 1. Bugs

### 1.1 🔴 CRITICAL — Monty Hall mini-game text becomes invisible

`variables.css` flips three shared tokens from a dark theme to a light theme:

| Token | Old (dark theme) | New (this PR) |
|---|---|---|
| `--overlay-panel-bg` | `rgba(26,21,32,0.95)` (near-black) | `rgba(232,239,245,0.96)` (near-white) |
| `--overlay-text` | `#e8dcc8` (light cream) | `#4F4A48` (dark charcoal) |
| `--bar-bg` | `rgba(80,100,130,0.96)` | `rgba(200,210,220,0.96)` |

The PR updates 11 game components to match the new theme, but **9 game
components that consume these tokens were not updated**.

`MontyHallPanel.vue` is the worst case. Its panel background is a **hard-coded
dark gradient** (not a token):

- `MontyHallPanel.vue:142` — `background: linear-gradient(135deg, #1a1520, #252030);`

while its core text uses the now-flipped token:

- `MontyHallPanel.vue:158` — `.mh-prompt { color: var(--overlay-text); }`
- `MontyHallPanel.vue:181` — `.door { color: var(--overlay-text); }` (drives
  the door numbers via `.door-number`)

Result: **dark charcoal text on a near-black panel** (contrast ≈ 1.3:1). The
prompt text and the door numbers become effectively invisible, making the
Monty Hall bonus round unplayable. This is a concrete, user-facing functional
regression.

### 1.2 🟠 MODERATE — Contrast regressions in 8 other unchanged components

The same token flip degrades the other components that were not updated.
Where a component uses `--overlay-panel-bg` for background **and**
`--overlay-text` for text, both flip together and the *primary* text stays
readable — but **hard-coded accent colours that were chosen for a dark
background now sit on a light one**:

| File | Line | Issue |
|---|---|---|
| `BuildHint.vue` | 38 | `color: var(--gold)` — new `--gold` is `#ADA284` (grey khaki). On the now-light panel this is ≈ 2.4:1 → **fails WCAG AA**. |
| `PrincipleOverlay.vue` | 121 | `color: #d4cab4` (pale cream) on a now-light panel → **near-invisible**. |
| `AchievementToast.vue` | 74 | `.toast-desc { color: #b8a98c }` (tan) on a now-light panel → low contrast. |
| `WaveForecast.vue` | 71 | `--gold-bright` (new value `#C5BCA1`, pale) text on light → low contrast. |
| `WaveBanner.vue` | 126 | `--gold-bright` accent text on light → low contrast. |
| `FunctionPanel.vue` | 333 | `#b5a586` (tan) accent on light → low contrast. |
| `SpellBar.vue` | 113 | `.spell-btn` background flips to light; `--spell-color` glyphs were tuned for a dark button → contrast uncertain. |

**Exception — not affected:** `BuffCardPanel.vue` also consumes
`--overlay-cell-bg`, but it is **visually safe**: its panel has no background
and sits over a `rgba(0,0,0,0.6)` scrim (`BuffCardPanel.vue:180`), and
`--overlay-cell-bg` stays near-transparent, so its cards remain dark and its
WCAG-tuned `#c9b895` text (`:253`) still holds.

**Full list of 9 unaffected-by-the-PR consumers of the flipped tokens:**
`AchievementToast`, `BuffCardPanel`, `BuildHint`, `FunctionPanel`,
`MontyHallPanel`, `PrincipleOverlay`, `SpellBar`, `WaveBanner`, `WaveForecast`.

> Root cause: the theme flip was applied to the shared tokens in
> `variables.css` but the migration of token *consumers* was incomplete.

### 1.3 🟠 MODERATE — `LevelSelectView` star grid breaks on mobile

The old star grid used `display: flex; flex-wrap: wrap; flex: 1 1 140px` so
cards wrapped on narrow screens. The new grid is:

```css
.star-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
```

A fixed 5-column grid with **no `flex-wrap` and no media query**. On a ~360px
phone, the five cards are compressed to ~50px each and the star row, label,
and the new description text overflow. This is a responsive regression.

---

## 2. Loss of existing functionality

The game's interactive logic is **not** lost — all 5 restructured views had
every template binding cross-checked against their unchanged `<script setup>`
and all references resolve (`submitAnswer`, `payToSkip`, `ignoreAndProceed`,
`startGame`, `submitReflection`, `toggleMode`, `handleCancelMfa`,
`isStarLocked`, `STAR_5_LOCK_TOOLTIP`, `continueRef`, etc.). The only losses
are dropped UI content:

### 2.1 `LevelSelectView` — lock icon removed

The old template rendered an explicit lock badge on locked star cards:

```html
<div v-if="isStarLocked(star)" class="lock-badge" aria-hidden="true">&#128274;</div>
```

The new template **removes this element**. A locked Star-5 card is still
`:disabled`, still gets the `.locked` class (opacity 0.5), and still has the
`title` tooltip — but the explicit 🔒 visual cue is gone. Users must hover to
learn why the card is unselectable.

### 2.2 `InitialAnswerView` — instructional text removed

- The explanatory subtitle is **deleted**:
  `"All paths share exactly one common point. It lies in the region:"`.
  It is replaced by an abstract `.motto` that no longer states the actual
  rule the player must use.
- The per-equation labels `<span class="path-label">Path {{ i + 1 }}:</span>`
  are **removed**. Curves are now listed unlabelled under a "The curves"
  heading, losing the "Path N" cross-reference.

### 2.3 Game logic — intact (reassurance)

HUD / Shop / Tower / Magic panels and the in-game control flow are CSS-only
changes. Behaviour, conditionals, and state transitions are preserved.

---

## 3. Separation-of-Concerns (SoC) issues

The title claims to "optimize UI architecture", but for the shared-styling
concern the PR moves in the opposite direction.

### 3.1 Large-scale CSS duplication (primary issue)

Presentation primitives are **copy-pasted verbatim** into the scoped
`<style>` of multiple views:

- `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-stack`, `.section-label`,
  `.motto`, `.pill` — duplicated across **`MenuView`, `AuthView`,
  `InitialAnswerView`, `LevelSelectView`, `ScoreResultView`** (the ~25-line
  `.btn { display:inline-flex; … }` block appears 5×, word-for-word).
- `.card` — duplicated across **12+ files**.

Shared UI concerns belong in `global.css` or a shared component
(`<BaseButton>`, `<BaseCard>`), not duplicated per view.

### 3.2 Dual token system / loss of single source of truth

`variables.css` keeps **all** old tokens (re-tinted) *and* adds a parallel
Morandi set. The result is overlapping vocabularies:

- `--hp-red` ≈ `--clay-deep`, `--enemy-red` ≈ `--clay-deep`
- `--axis` ≈ `--charcoal-soft`
- `--gold` vs `--gold-deep` / `--gold-soft` / `--gold-bright`

Components now mix old and new tokens inconsistently.

### 3.3 Literal values bypassing the tokens

The new palette was added as tokens (`--cream: #DCE5ED`, …) but views then
**bypass them with raw literals**:

- `.card` background `rgba(220, 229, 237, 0.86)` is hard-coded in 12+ files
  (it is `--cream` at 0.86 alpha).
- `rgba(245,250,254,*)`, `rgba(168,188,203,0.28)`, `#fff`, etc. are scattered
  throughout instead of being tokenised.

### 3.4 Partial / inconsistent re-skin

`global.css` already defines `.btn` (line 37). The 5 restructured views
declare their own scoped `.btn`, which **shadows** the global one (scoped
selectors gain a `[data-v-*]` attribute → higher specificity). The other
~21 views/components keep the *old* global `.btn`. Combined with the token
flip from §1, the application is left in a **"half-skinned" state**: 5 views
with new Morandi buttons, the rest with the old style, and 9 game components
with broken/degraded contrast.

### 3.5 Typography contract bypass

`frontend/CLAUDE.md` mandates that authored font sizes use the `--text-*`
tokens. The PR introduces **many raw `rem` literals**: `0.68rem`, `0.7rem`,
`0.82rem`, `0.88rem`, `0.92rem`, `1.35rem`, `1.6rem`, `2.2rem`,
`clamp(2.1rem, 4.5vw, 3rem)`, etc. The `no-raw-px` linter only blocks `px`,
so CI passes — but the design-system contract is violated. This also works
against `main`'s recent typography cleanup
(`d7a425d` / `39fd37c` — *"sweep remaining raw rem font-sizes"*).

### 3.6 Dead tokens

`variables.css` defines the per-tower colour tokens `--tw-radar-*`,
`--tw-matrix-*`, `--tw-calculus-*`, `--tw-limit-*` (18 tokens). A branch-wide
grep shows **only `--tw-magic-*` is ever referenced** (in `MagicModePanel`).
The rest are dead code — `TowerBar.vue`'s own comment admits per-tower
tinting is "out of scope here".

### 3.7 Minor smells

- `TowerBar.vue` — `.tower-btn { border-radius: 10px !important; }` uses
  `!important` as a specificity hack.
- `LevelSelectView` — an inline data map is embedded in the template:
  `{{ ({ 1:'Learn the ropes', … })[star] }}`. Content data should live in
  `<script>` (the old `starLabels` did).
- `InitialAnswerView.vue:143` — `.math-block` hard-codes
  `font-family: 'Cambria', 'Times New Roman', serif`, bypassing the
  `--font-*` tokens.

---

## 4. Severity summary

| # | Finding | Severity | Type |
|---|---|---|---|
| 1.1 | Monty Hall prompt / door numbers invisible (dark-on-dark) | 🔴 Critical | Bug / functional regression |
| 1.2 | 8 unchanged game components: contrast degradation / WCAG-AA failures | 🟠 Moderate | Bug |
| 1.3 | `LevelSelectView` 5-column grid breaks on mobile | 🟠 Moderate | Bug / regression |
| 2.1 | `LevelSelectView` lock icon removed | 🟡 Minor | Lost functionality |
| 2.2 | `InitialAnswerView` instructional text + path labels removed | 🟡 Minor | Lost functionality |
| 3.1 | `.btn` / `.card` / etc. duplicated across 5–12 files | 🟠 Moderate | SoC |
| 3.2–3.3 | Dual token system + literals bypassing tokens | 🟠 Moderate | SoC |
| 3.4 | Partial re-skin → inconsistent buttons app-wide | 🟠 Moderate | SoC / consistency |
| 3.5 | Raw `rem` literals bypass the `--text-*` typography contract | 🟡 Minor | SoC / convention |
| 3.6 | 18 dead per-tower colour tokens | 🟡 Minor | SoC / dead code |

---

## 5. Recommendations

**Must fix before merge**

1. **Migrate the 9 unchanged token consumers to the light theme** — or thread
   the token flip through to every consumer. `MontyHallPanel` is mandatory:
   the bonus round is currently broken.
2. Restore wrapping / add a media query to `LevelSelectView`'s star grid.

**Should fix**

3. Restore the lock icon and the `InitialAnswerView` instructional text — or,
   if the removal is intentional, state so explicitly in the PR description.
4. Extract `.btn` / `.card` / `.section-label` / `.pill` etc. into
   `global.css` or shared components, then apply them, instead of duplicating
   per view. At minimum, replace the hard-coded palette literals with the
   already-defined tokens.
5. Run a full visual / contrast QA pass over the in-game HUD with the new
   theme (the screens most affected by §1.2).

**Nice to have**

6. Remove the 18 unused `--tw-*` tokens, or wire them up.
7. Decide on one token vocabulary and migrate consistently, rather than
   keeping two parallel sets.
8. Rename the PR to reflect reality (a *visual re-theme*, not an architecture
   refactor) so reviewers calibrate correctly.

---

## Appendix — file inventory

**Files with `<template>` / `<script>` structural changes (5):**
`AuthView.vue`, `InitialAnswerView.vue`, `LevelSelectView.vue`, `MenuView.vue`,
`ScoreResultView.vue`.

**CSS-only changes (35):** the remaining 24 views + 11 game components
(`CalculusPanel`, `GameSpeedPanel`, `HUD`, `LimitQuestionPanel`,
`MagicModePanel`, `MatrixPairPanel`, `RadarConfigPanel`, `ShopPanel`,
`TargetingModePanel`, `TowerBar`, `TowerInfoPanel`) + `GlobalBackground.vue`,
`global.css`, `variables.css`.

**Affected but NOT in the PR (9 game components consuming the flipped
tokens):** `AchievementToast`, `BuffCardPanel` (benign), `BuildHint`,
`FunctionPanel`, `MontyHallPanel` (critical), `PrincipleOverlay`, `SpellBar`,
`WaveBanner`, `WaveForecast`.
