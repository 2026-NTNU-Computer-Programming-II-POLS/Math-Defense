# UI Unification Plan — Light Blue-White Theme

**Goal**: Bring every standalone page view into a consistent light blue-white palette that
matches the finished `MenuView`. The in-game rendering layer (canvas, HUD bars, spell VFX)
is excluded.

---

## Scope

### In scope

All views in `frontend/src/views/` not already correct, plus one targeted panel change in
`ScoreResultView.vue`.

### Explicitly out of scope

| Category | Reason |
|---|---|
| Canvas renderers (`SpellEffectRenderer`, `TowerRenderer`, `EnemyRenderer`, `GridRenderer`, …) | Tower, enemy, spell visuals on canvas are excluded per product spec |
| In-game overlay components (`HUD`, `TowerBar`, `BuildPanel`, `SpellBar`, `BuildHint`, `ShopPanel`, `MontyHallPanel`, `ChainRulePanel`, `BuffCardPanel`) | Overlay the game canvas; dark bars are intentional there |
| `GameView.vue` | Already correct |
| `MenuView.vue` | Already done |

### Already correct — no changes needed

`LeaderboardView`, `RankingsView`, `TerritoryResultView`, `AdminView`, `ChallengeBuilder`,
`ChallengeLeaderboardView`, `ChallengeView`, `AuthView`, `ClassView`, `TeacherTerritorySetup`

---

## Step 1 — Token additions to `variables.css`

Four literal values appear in existing files without a corresponding token. Add them:

```css
--live-green:   #6cc44a;   /* SpectateView "live" status indicator */
--formula-blue: #60c0ff;   /* ScoreResultView formula row highlight */
--scope-border: #7a6fa0;   /* Territory scope badge border (purple) */
--scope-text:   #a08fc0;   /* Territory scope badge text (purple) */
```

**`#e8dcc8` (parchment cream)** appears in 6 files and was designed for text on dark
backgrounds. No new token is needed — replace every instance with `var(--text-secondary)`.

---

## Step 2 — Stone-dark backgrounds → light (5 files)

These files explicitly set `background: var(--stone-dark)` on their root element and use
`var(--stone-light)` for inner cards/panels. When the backgrounds go light, two additional
token mismatches surface:

- `var(--gold-bright)` = `#ffffff` (white) — correct on dark bg, invisible on light.
  Replace with `var(--gold)` wherever used as a heading color.
- `var(--grid-line)` = `rgba(255,255,255,0.2)` — white at 20%, was designed for canvas grid
  lines, invisible on light UI backgrounds. Replace UI borders with `var(--panel-border)`.

| Old value | New value |
|---|---|
| `background: var(--stone-dark)` on root | `background: var(--bg-base)` |
| `background: var(--stone-light)` on inner panels/cards | `background: var(--panel-bg)` |
| `color: var(--gold-bright)` on headings | `color: var(--gold)` |
| `border: … var(--grid-line)` on UI elements | `border: … var(--panel-border)` |
| `color: #fff` on dark-colored action buttons | **keep** (blue/gold buttons, white text is correct) |

### `AboutView.vue`

- `.about-view`: `var(--stone-dark)` → `var(--bg-base)`
- `h1`: `var(--gold-bright)` → `var(--gold)`
- `kbd { background }`: `var(--stone-light)` → `var(--stone-selected)`
- `.back-btn { border }`: `var(--grid-line)` → `var(--panel-border)`

### `LevelSelectView.vue`

- `.level-select`: `var(--stone-dark)` → `var(--bg-base)`
- `h1`: `var(--gold-bright)` → `var(--gold)`
- `.star-card { background }`: `var(--stone-light)` → `var(--panel-bg)`
- `.star-card { border }`: `var(--grid-line)` → `rgba(164, 185, 212, 0.5)` (visible on light)
- `.star-card.selected`: background stays `var(--stone-selected)` — already a light token ✓
- `.suggestion-badge { border }`: `var(--gold-bright, #d4a840)` (resolves to white!) → `var(--gold)`
- `.suggestion-text strong { color }`: `var(--gold-bright, #d4a840)` → `var(--gold)`
- `.back-btn { border }`: `var(--grid-line)` → `var(--panel-border)`

### `InitialAnswerView.vue`

- `.ia-view`: `var(--stone-dark)` → `var(--bg-base)`
- `h1`: `var(--gold-bright)` → `var(--gold)`
- `.equations { background }`: `var(--stone-light)` → `var(--panel-bg)`
- `.equations { border }`: `var(--grid-line)` → `var(--panel-border)`
- `.option-btn { background }`: `var(--stone-light)` → `rgba(255, 255, 255, 0.7)`
- `.option-btn { border }`: `var(--grid-line)` → `rgba(164, 185, 212, 0.5)`
- `.option-btn.selected`: `var(--option-selected)` ✓ — already a light token
- `.pay-btn { color }`: `var(--stone-dark)` → `var(--text-on-accent)` (text on gold/yellow button)
- `.ignore-btn { border }`: `var(--grid-line)` → `var(--panel-border)`

### `SpectateView.vue`

- `.spectate-view`: `var(--stone-dark)` → `var(--bg-base)`
- `.status { background }`: `var(--stone-light)` → `var(--panel-bg)`
- `.status[data-status="live"] { color }`: `#6cc44a` → `var(--live-green)` (new token)
- `.last-event { background }`: `var(--stone-light)` → `var(--panel-bg)`
- `.btn-ghost { border }`: `var(--grid-line)` → `var(--panel-border)`

### `ReplayView.vue`

- `.replay-view`: `var(--stone-dark)` → `var(--bg-base)`
- `.replay-header h1`: `var(--gold-bright)` → `var(--gold)`
- `.replay-header { border-bottom }`: `var(--grid-line)` → `rgba(164, 185, 212, 0.4)`
- `.replay-controls { border-top }`: `var(--grid-line)` → `rgba(164, 185, 212, 0.4)`
- `.replay-canvas { background }`: `var(--stone-light)` — **keep** (canvas viewport, stone bg is fine)
- `.scrub { background }`: `var(--stone-light)` → `rgba(164, 185, 212, 0.4)`
- `.btn-ghost { border }`: `var(--grid-line)` → `var(--panel-border)`
- `.btn { color: #fff }` on tower-cannon button — **keep**

---

## Step 3 — AffectSurveyView.vue and StudyProbeView.vue

These two files were written with a completely different color system (`--color-text`,
`--color-accent`, `--color-text-muted`). They currently have **no explicit background set**,
so they already render on the light `var(--bg-base)` body background — but all their text
and border colors were designed for a dark background, making them effectively broken today.

Both files have near-identical structure. Apply the same mapping to both:

| Old | New | Notes |
|---|---|---|
| `var(--color-text, #ddd)` | `var(--text-primary)` | Body text — dark on light |
| `var(--color-text-muted, #aaa)` | `var(--text-secondary)` | Meta / muted text |
| `var(--color-accent, #6db)` | `var(--gold)` | Question numbers, selected state accent |
| `rgba(255, 255, 255, 0.03)` (item card bg) | `rgba(255, 255, 255, 0.72)` | Card on light bg needs opacity to show |
| `rgba(255, 255, 255, 0.08)` (item border) | `var(--panel-border)` | Visible on light |
| `rgba(110, 220, 187, 0.08)` (selected tint) | `rgba(255, 215, 0, 0.12)` | Gold tint for selected state |
| `border-color: var(--color-accent, #6db)` on selected | `var(--gold)` | Selected border |
| `.affect-submit / .probe-submit { background }` | `var(--gold)` | Submit button bg |
| `.affect-submit / .probe-submit { color: #0a1118 }` | `var(--text-on-accent)` | Text on gold button |
| `color: #ff8a8a` (error text) | `var(--error-red)` | Error text token |
| Warning block `rgba(255, 165, 0, 0.12)` bg | `rgba(255, 215, 0, 0.1)` | Use gold family |
| Warning block `rgba(255, 165, 0, 0.4)` border | `var(--gold-dim)` | Use gold family |
| `.likert-cell:hover { background: rgba(255,255,255,0.04) }` | `rgba(255, 215, 0, 0.06)` | Visible hover on light |
| `.probe-option:hover { background: rgba(255,255,255,0.04) }` | `rgba(255, 215, 0, 0.06)` | Same |

---

## Step 4 — ScoreResultView.vue (panel only)

`ScoreResultView` is rendered as an overlay inside `GameView` on top of the game canvas.
The black dimming overlay (`rgba(0,0,0,0.75)`) is correct and stays. Only the inner panel
changes to match the light theme.

| Element | Old | New |
|---|---|---|
| `.score-panel { background }` | `rgba(50, 68, 95, 0.98)` | `var(--panel-bg)` |
| `.breakdown .label { color }` | `#ffffff; opacity: 0.8` | `var(--text-primary)` (remove opacity) |
| `.breakdown tr.formula .label/.value { color }` | `#60c0ff` | `var(--formula-blue)` (new token) |
| `.btn-continue:hover { background }` | `#ffea00` | `var(--gold-bright)` |
| `.reflection-input { background }` | `rgba(0, 0, 0, 0.4)` | `var(--stone-selected)` |
| `.reflection-input { color }` | `#e8dcc8` | `var(--text-primary)` |

---

## Step 5 — Hardcoded color cleanup in mostly-tokenized files

These files already sit on the light `var(--bg-base)` background (no explicit root bg set),
so their hardcoded values are already a current rendering problem, not a future one.

### `TalentTreeView.vue`

- `.node-name { color: #e8dcc8 }` → `var(--text-secondary)`
- `rgba(212, 168, 64, 0.1)` (available hover) → `rgba(255, 215, 0, 0.1)` (canonical gold RGB)
- `rgba(212, 168, 64, 0.08)` (maxed bg) → `rgba(255, 215, 0, 0.08)`

### `TeacherDashboard.vue`

- `.reflection-text { color: #e8dcc8 }` → `var(--text-secondary)`
- `.competency-suggestion { color: #e8dcc8 }` → `var(--text-secondary)`
- `.explainer { color: #e8dcc8 }` → `var(--text-secondary)`

### `ProfileView.vue`

- `.settings-label { color: #e8dcc8 }` → `var(--text-primary)` (form labels need full contrast)
- `.settings-row { color: #e8dcc8 }` → `var(--text-primary)`

### `AchievementView.vue`

- `.ach-name { color: #e8dcc8 }` → `var(--text-secondary)`
- `.ach-card.unlocked { background: rgba(212, 168, 64, 0.05) }` → `rgba(255, 215, 0, 0.05)`
- `.season-banner { background: rgba(212, 168, 64, 0.1) }` → `rgba(255, 215, 0, 0.1)`

### `TerritoryDetailView.vue`

- `.scope-tag { border: 1px solid #7a6fa0 }` → `var(--scope-border)` (new token)
- `.scope-tag { color: #a08fc0 }` → `var(--scope-text)` (new token)
- `.recommendation-bar { color: #e8dcc8 }` → `var(--text-secondary)`
- `.recommendation-bar { background: rgba(255, 215, 0, 0.05) }` — already correct value, keep

### `TerritoryListView.vue`

- `.scope-badge { border: 1px solid #7a6fa0 }` → `var(--scope-border)`
- `.scope-badge { color: #a08fc0 }` → `var(--scope-text)`

---

## Acceptance criteria

After all changes, these greps must return zero results in `frontend/src/views/`:

```
grep -rn "var(--stone-dark)"              # removed from page backgrounds
grep -rn "#e8dcc8"                        # all replaced with var(--text-secondary/primary)
grep -rn "var(--color-text"               # AffectSurvey + StudyProbe cleaned
grep -rn "#7a6fa0\|#a08fc0"              # scope badge colors tokenized
grep -rn "#6cc44a"                        # live-green tokenized
grep -rn "#60c0ff"                        # formula-blue tokenized
grep -rn "rgba(50, 68, 95"               # ScoreResultView dark panel gone
```

Additionally, `var(--grid-line)` should no longer appear as a UI border color in any view
(it remains valid only in canvas-context CSS, where white lines on a dark canvas are correct).
Verify with:

```
grep -rn "var(--grid-line)" frontend/src/views/
```

---

## Notes

**`var(--gold-bright)` = `#ffffff` (white)** — the name is misleading. It is intentionally
white (the brightest "gold" in a rendering sense), correct for star icons and canvas
highlights. On page headings it becomes invisible on any light background. After this plan,
heading colors that use `var(--gold-bright)` will all be converted to `var(--gold)`.

**`var(--stone-dark)` as hover text** — Multiple files use the pattern
`.btn:hover { background: var(--axis); color: var(--stone-dark) }`, which gives blue-slate
text (`#5b718f`) on gold (`#ffd700`) at ~3.5:1 contrast. Updating these hover states to
`var(--text-on-accent)` for WCAG AA compliance is a separate task and not included here.

**`var(--grid-line)` as a UI border** — Using the canvas grid-line color as a UI element
border was a historical mistake made when dark backgrounds made white 20%-opacity borders
visible. After this migration it should be treated as a canvas-only value.
